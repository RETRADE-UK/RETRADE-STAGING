// Staging-only service. User JWTs are verified with Auth; cron uses a private DB token.
import webpush from "npm:web-push@3.6.7";
import {
  preset,
  monitorInput,
  subscriptionInput,
  comparatorInput,
} from "../../../worker/monitors/src/service-validation.mjs";
import {
  createVintedSource,
  scanCatalog,
  retryAt,
} from "../../../worker/monitors/src/adapters/vinted-source.mjs";
import { matchListing } from "../../../worker/monitors/src/engine/match.mjs";
import { buildFeed } from "../../../worker/monitors/src/feed.mjs";
import { canon } from "../../../worker/monitors/src/contracts.mjs";
const url = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "https://test.retrade-uk.com",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: cors });
async function db(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  const r = await fetch(url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: service,
      Authorization: "Bearer " + service,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(
      e.code === "P0001" ? e.message : "Monitor storage is unavailable",
    );
  }
  return r.status === 204 ? null : r.json();
}
const rpc = (name: string, args: unknown = {}) => db("rpc/" + name, args);
const eq = (s: string) => encodeURIComponent(s);
async function own(user: string, id: unknown) {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
    throw new TypeError("Invalid monitor");
  const rows = await db(
    "monitor_recipes?id=eq." + eq(id) + "&user_id=eq." + eq(user),
  );
  if (!rows.length) throw new TypeError("Monitor not found");
  return rows[0];
}
async function config() {
  const c = await rpc("monitor_config");
  return c.vapid
    ? c
    : rpc("monitor_config", { p_vapid: webpush.generateVAPIDKeys() });
}
async function pushBatch(c: any) {
  const jobs = await rpc("monitor_push_claim");
  for (const job of jobs) {
    try {
      const [sub] = await db(
        "monitor_push_subscriptions?id=eq." + job.subscription_id,
      );
      if (!sub) continue;
      if (job.monitor_id) {
        const [m] = await db(
          "monitor_recipes?id=eq." +
            job.monitor_id +
            "&user_id=eq." +
            sub.user_id,
        );
        if (
          !m ||
          !m.enabled ||
          m.archived ||
          !m.notifications ||
          m.revision !== job.revision
        ) {
          await db("monitor_outbox?id=eq." + job.id, undefined, "DELETE");
          continue;
        }
      }
      subscriptionInput(sub.subscription);
      // Build encrypted Web Push using a pinned library, send through bounded fetch.
      const req = webpush.generateRequestDetails(
        sub.subscription,
        JSON.stringify({ ...job.payload, listingId: job.listing_id || null }),
        {
          vapidDetails: { subject: "https://test.retrade-uk.com", ...c.vapid },
          TTL: 300,
          urgency: "normal",
          topic: job.id.replaceAll("-", ""),
        },
      );
      const r = await fetch(req.endpoint, {
        method: "POST",
        headers: req.headers,
        body: req.body,
        redirect: "error",
        signal: AbortSignal.timeout(7000),
      });
      await r.body?.cancel();
      if (r.status === 404 || r.status === 410) {
        await db(
          "monitor_push_subscriptions?id=eq." + sub.id,
          undefined,
          "DELETE",
        );
        continue;
      }
      if (!r.ok) {
        const error: any = new Error("Push provider HTTP " + r.status);
        error.retryAt = retryAt(
          r.headers.get("retry-after"),
          Date.now(),
          120000,
        );
        throw error;
      }
      await db(
        "monitor_outbox?id=eq." + job.id,
        { state: "sent", sent_at: new Date().toISOString(), error: null },
        "PATCH",
      );
    } catch (e) {
      await db(
        "monitor_outbox?id=eq." + job.id,
        {
          state: job.attempts >= 5 ? "failed" : "pending",
          error: String((e as Error).message).slice(0, 120),
          next_attempt_at: new Date(
            Math.max(
              (e as any).retryAt || 0,
              Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts),
            ),
          ).toISOString(),
        },
        "PATCH",
      );
    }
  }
}
async function tick(c: any) {
  const token = crypto.randomUUID();
  if (!(await rpc("monitor_tick_lease", { p_token: token })))
    return { busy: true };
  try {
    // A refusal stops automatic Vinted requests. An empty feed is never healthy.
    if (
      c.source_status !== "blocked" &&
      (!c.retry_at || Date.parse(c.retry_at) <= Date.now())
    ) {
      const monitors = await rpc("monitor_claim", { p_token: token });
      // UPDATE ... RETURNING does not preserve the due-query order. Within the
      // claimed batch, serve never/least-recently scanned monitors first so a
      // six-request recipe cannot monopolise every cycle's shared budget.
      monitors.sort((a: any, b: any) =>
        (Date.parse(a.last_success_at || "1970-01-01") - Date.parse(b.last_success_at || "1970-01-01")) ||
        String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
      const source = createVintedSource({
        request: fetch,
        timeoutMs: 7000,
      } as any);
      const cache = new Map();
      let requests = 0;
      const budget = {
        async searchPage(q: any) {
          const key = JSON.stringify(q);
          if (cache.has(key)) return cache.get(key);
          if (requests >= 6) throw new Error("cycle_budget");
          requests++;
          const result = await source.searchPage(q);
          cache.set(key, result);
          return result;
        },
      };
      for (const m of monitors) {
        try {
          const seen = await db("monitor_matches?monitor_id=eq." + m.id +
            "&revision=eq." + m.revision + "&select=listing_id&order=observed_at.desc&limit=500");
          const scan = await scanCatalog({
            source: budget,
            recipe: m.recipe,
            maxPages: 2,
            maxRequests: 6,
            perPage: 50,
            knownIds: new Set(seen.map((x: any) => x.listing_id)),
            signal: undefined,
          });
          const items = scan.listings.map((listing: any) => ({
            listing,
            result: matchListing(listing, m.recipe),
          }));
          await rpc("monitor_commit", {
            p_id: m.id,
            p_revision: m.revision,
            p_token: token,
            p_items: items,
            p_complete: scan.coverageComplete,
            p_requests: scan.requests,
          });
          await rpc("monitor_source_state", {
            p_status: "ready",
            p_message:
              "Catalog reachable. Full listing details and seller enrichment are not yet verified.",
            p_retry: null,
          });
        } catch (e) {
          const err = e as any;
          if (err.message === "cycle_budget") break;
          const blocked = [401, 403, 404].includes(err.status);
          await rpc("monitor_source_state", {
            p_status: blocked ? "blocked" : "degraded",
            p_message: blocked
              ? "Vinted refused or could not serve the catalogue (HTTP " +
                err.status +
                "). Live source access needs attention."
              : "The catalogue scan failed; no coverage claim was recorded.",
            p_retry: new Date(
              Math.max(Date.now() + 120000, err.retryAt || 0) +
                Math.random() * 10000,
            ).toISOString(),
          });
          break;
        }
      }
    }
    await pushBatch(c);
    return { ok: true };
  } finally {
    try {
      await rpc("monitor_release_claims", { p_token: token });
    } finally {
      await rpc("monitor_tick_release", { p_token: token });
    }
  }
}
async function body(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new TypeError("Missing request");
  let text = "",
    n = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > 20000) throw new TypeError("Request too large");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
Deno.serve(async (req) => {
  if (url !== "https://dvnrxmdejxfuazmpnudj.supabase.co")
    return reply({ error: "Staging binding required" }, 503);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST required" }, 405);
  try {
    const input = await body(req);
    if (input.op === "tick" || input.op === "sourceCheck") {
      const c = await config();
      if (req.headers.get("x-monitor-token") !== c.token)
        return reply({ error: "Unauthorized" }, 401);
      if (input.op === "sourceCheck") {
        // Explicit operator diagnostic only. Never clears the activation gate,
        // starts jobs, retries a refusal or accepts an arbitrary destination.
        try {
          const source = createVintedSource({ request: fetch, timeoutMs: 7000 });
          const page = await source.searchPage({ searchText: "Canon", perPage: 1 });
          return reply({ reachable: true, count: page.rawCount, checkedAt: new Date().toISOString() });
        } catch (error) {
          return reply({ reachable: false, httpStatus: (error as any).status ?? null,
            reason: (error as any).code || "contract_failure", checkedAt: new Date().toISOString() });
        }
      }
      return reply(await tick(c));
    }
    const token = req.headers.get("authorization") || "";
    if (!token.startsWith("Bearer "))
      return reply({ error: "Sign in to use monitors" }, 401);
    const auth = await fetch(url + "/auth/v1/user", {
      headers: { apikey: service, Authorization: token },
      signal: AbortSignal.timeout(8000),
    });
    if (!auth.ok)
      return reply({ error: "Session expired. Sign in again." }, 401);
    const user = await auth.json();
    if (!user.id) return reply({ error: "Unauthorized" }, 401);
    const anonymous = user.is_anonymous === true;
    if (input.op === "bootstrap" || input.op === "status") {
      const c = await config();
      if (input.op === "bootstrap") {
        const data = preset();
        if (anonymous) data.enabled = false;
        await rpc("monitor_save", {
          p_user: user.id, p_id: null, p_revision: null,
          p_data: data, p_preset: "canon-rl-v1",
        });
      }
      const monitors = await db(
        "monitor_recipes?user_id=eq." + user.id + "&order=created_at.asc",
      );
      const subscriptions = await db(
        "monitor_push_subscriptions?user_id=eq." + user.id + "&select=id",
      );
      return reply({
        monitors,
        canonModels: canon.models.map((model: any) => model.id),
        anonymous,
        pushKey: c.vapid.publicKey,
        devices: subscriptions.length,
        source: {
          status: c.source_status,
          message: c.source_message,
          checkedAt: c.checked_at,
          retryAt: c.retry_at,
        },
      });
    }
    if (input.op === "save") {
      const data = monitorInput(input);
      if (anonymous) {
        data.enabled = false;
        data.notifications = false;
      }
      if (input.id) await own(user.id, input.id);
      return reply({
        monitor: await rpc("monitor_save", {
          p_user: user.id,
          p_id: input.id || null,
          p_revision: input.revision || null,
          p_data: data,
        }),
      });
    }
    if (input.op === "device") {
      if (typeof input.endpoint !== "string" || input.endpoint.length > 2048)
        throw new TypeError("Invalid device");
      const rows = await db("monitor_push_subscriptions?user_id=eq." + user.id +
        "&endpoint=eq." + eq(input.endpoint) + "&select=id&limit=1");
      return reply({ registered: rows.length === 1 });
    }
    if (input.op === "history") {
      const m = await own(user.id, input.id);
      if (!['all','new','saved'].includes(input.filter) || typeof input.query !== 'string' || input.query.length > 100)
        throw new TypeError("Invalid history filter");
      const c = input.cursor;
      if (c != null && (typeof c !== 'object' || typeof c.at !== 'string' || c.at.length > 40 || !Number.isFinite(Date.parse(c.at)) || typeof c.id !== 'string' || !/^[1-9]\d{0,19}$/.test(c.id)))
        throw new TypeError("Invalid history cursor");
      return reply(await rpc("monitor_history", {p_user:user.id,p_monitor:m.id,p_filter:input.filter,p_query:input.query,p_cursor:c || null}));
    }
    if (input.op === "itemState") {
      const m = await own(user.id, input.id);
      if (typeof input.listingId !== 'string' || !/^[1-9]\d{0,19}$/.test(input.listingId) ||
          (input.saved !== undefined && typeof input.saved !== 'boolean') ||
          (input.read !== undefined && typeof input.read !== 'boolean') ||
          (input.saved === undefined && input.read === undefined)) throw new TypeError("Invalid listing action");
      await rpc("monitor_set_item_state", {p_user:user.id,p_monitor:m.id,p_listing:input.listingId,p_saved:input.saved ?? null,p_read:input.read ?? null});
      return reply({ok:true});
    }
    if (input.op === "feed") {
      const m = await own(user.id, input.id);
      const snapshot = await rpc("monitor_feed_snapshot", {
        p_user: user.id, p_monitor: m.id, p_revision: m.revision,
      });
      return reply(buildFeed(snapshot));
    }

    if (input.op === "compare") {
      const m = await own(user.id, input.id);
      const x = comparatorInput(input);
      await rpc("monitor_compare", {
        p_user: user.id,
        p_monitor: m.id,
        p_revision: m.revision,
        p_listing: x.listingId,
        p_at: x.observedAt,
      });
      return reply({ ok: true });
    }
    if (input.op === "subscribe") {
      if (anonymous)
        return reply(
          { error: "Use a registered staging account for phone notifications" },
          403,
        );
      const subscription = subscriptionInput(input.subscription);
      // Explicit opt-in rebinds this browser endpoint; old queued deliveries cascade away.
      await rpc("monitor_subscribe", {
        p_user: user.id,
        p_subscription: subscription,
      });
      return reply({ ok: true });
    }
    if (input.op === "unsubscribe") {
      if (typeof input.endpoint !== "string")
        throw new TypeError("Missing device");
      await db(
        "monitor_push_subscriptions?user_id=eq." +
          user.id +
          "&endpoint=eq." +
          eq(input.endpoint),
        undefined,
        "DELETE",
      );
      return reply({ ok: true });
    }
    if (input.op === "testPush") {
      if (anonymous)
        return reply(
          { error: "Use a registered staging account for phone notifications" },
          403,
        );
      const subs = await db(
        "monitor_push_subscriptions?user_id=eq." +
          user.id +
          "&endpoint=eq." +
          eq(String(input.endpoint)),
      );
      if (!subs.length)
        throw new TypeError("Enable notifications on this device first");
      const sub = subs[0];
      const recent = await db(
        "monitor_outbox?subscription_id=eq." +
          sub.id +
          "&monitor_id=is.null&next_attempt_at=gt." +
          eq(new Date(Date.now() - 60000).toISOString()) +
          "&limit=1",
      );
      if (recent.length)
        return reply({ error: "Wait one minute before another test" }, 429);
      const [testJob] = await db("monitor_outbox", {
        subscription_id: sub.id,
        payload: {
          userId: user.id,
          title: "RETRADE · Test notification",
          body: "This phone is ready for monitor alerts. Live Vinted source access is still being validated.",
          tag: "monitor-test",
        },
      });
      await pushBatch(await config());
      const [delivery] = await db("monitor_outbox?id=eq." + testJob.id + "&select=state");
      return reply({
        ok: true,
        message: !delivery
          ? "This subscription has expired. Enable notifications again."
          : delivery.state === "sent"
            ? "Push provider accepted the test. Check your phone to confirm receipt."
            : delivery.state === "failed"
              ? "The test could not be delivered. Enable notifications again and retry."
              : "Test queued for delivery. Check your phone; permission and Focus settings can affect receipt.",
      });
    }
    return reply({ error: "Unknown operation" }, 400);
  } catch (e) {
    const message = (e as Error).message;
    return reply(
      {
        error:
          message.includes("Monitor") || e instanceof TypeError
            ? message
            : "Monitor request failed. Please retry.",
      },
      400,
    );
  }
});
