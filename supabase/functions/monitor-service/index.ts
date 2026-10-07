// Staging-only service. User JWTs are verified with Auth; cron uses a private DB token.
import webpush from "npm:web-push@3.6.7";
import {
  monitorInput,
  subscriptionInput,
  comparatorInput,
} from "../../../worker/monitors/src/service-validation.mjs";
import {
  createVintedSource,
  scanCatalog,
  retryAt,
  validateAccessToken,
} from "../../../worker/monitors/src/adapters/vinted-source.mjs";
import { matchListing } from "../../../worker/monitors/src/engine/match.mjs";
import { buildFeed } from "../../../worker/monitors/src/feed.mjs";
import { canon } from "../../../worker/monitors/src/contracts.mjs";
import { checkSession, sessionMessages } from "../../../worker/monitors/src/session-check.mjs";
import { connectionInput, seal, unseal, renewConnection, connectionMessages } from "../../../worker/monitors/src/connection.mjs";
import { automaticScan } from "../../../worker/monitors/src/automatic.mjs";
import { canonTierPresets } from "../../../worker/monitors/src/presets.mjs";
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
  Response.json(data, { status, headers: { ...cors, "Cache-Control": "no-store" } });
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
        JSON.stringify({ ...job.payload, listingId: job.listing_id || null, receipt: { id: job.id, token: job.receipt_token } }),
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
          error: "Push delivery failed; automatic retry pending",
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
    let scan: any;
    try { scan = await automaticScan({ rpc, db, request: fetch, token }); }
    catch { scan = { error: "scan_unavailable" }; }
    await pushBatch(c);
    return { ok: true, ...scan };
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
    if (input.op === "pushReceipt") {
      if (!/^[a-f0-9-]{36}$/.test(input.id || "") || !/^[a-f0-9-]{36}$/.test(input.token || "") || !['received','displayed','failed'].includes(input.status))
        return reply({ error: "Invalid receipt" }, 400);
      await rpc("monitor_push_receipt", {p_id:input.id,p_token:input.token,p_status:input.status});
      return reply({ok:true});
    }
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
    if (input.op === "connectionAutomatic") {
      if (anonymous || typeof input.enabled !== 'boolean') return reply({error:'Registered account and enabled setting required'},403);
      await rpc("monitor_connection_automatic",{p_user:user.id,p_enabled:input.enabled});
      return reply({connection:await rpc("monitor_connection_status",{p_user:user.id}),message:input.enabled?'Automatic searches enabled. The first scan is silent.':'Automatic searches paused.'});
    }
    if (input.op === "connectionDisconnect" || input.op === "connectionTest") {
      if (anonymous) return reply({ error: "Sign in with a registered staging account to connect Vinted." }, 403);
      if (input.op === "connectionAutomatic") {
      if (anonymous || typeof input.enabled !== 'boolean') return reply({error:'Registered account and enabled setting required'},403);
      await rpc("monitor_connection_automatic",{p_user:user.id,p_enabled:input.enabled});
      return reply({connection:await rpc("monitor_connection_status",{p_user:user.id}),message:input.enabled?'Automatic searches enabled. The first scan is silent.':'Automatic searches paused.'});
    }
    if (input.op === "connectionDisconnect") {
        await rpc("monitor_connection_disconnect", { p_user: user.id });
        return reply({ connection: await rpc("monitor_connection_status", { p_user: user.id }), message: "Saved Vinted credentials deleted. Background monitoring is paused." });
      }
      let credentials: any = input.credentials == null ? null : connectionInput(input.credentials);
      input.credentials = null;
      const key = await rpc("monitor_connection_key");
      const claim = await rpc("monitor_connection_begin", { p_user: user.id,
        p_ciphertext: credentials ? await seal(credentials, key, user.id) : null });
      credentials = null;
      if (!claim.accepted) return reply({ error: "Wait until " + claim.retryAt + " before testing renewal again.", retryAt: claim.retryAt }, 429);
      let result: any;
      try {
        credentials = await unseal(claim.ciphertext, key, user.id);
        result = await renewConnection({ credentials, request: fetch });
      } catch { result = { state: "reconnect" }; }
      finally { credentials = null; claim.ciphertext = null; }
      const ciphertext = result.credentials ? await seal(result.credentials, key, user.id) : null;
      result.credentials = null;
      const saved = await rpc("monitor_connection_finish", { p_user: user.id, p_attempt: claim.attempt,
        p_generation: claim.generation, p_state: result.state, p_ciphertext: ciphertext,
        p_expires: result.expiresAt || null, p_retry: result.retryAt ? new Date(result.retryAt).toISOString() : null });
      if (!saved) return reply({ error: "Connection changed or expired during the test. Refresh its status before continuing." }, 409);
      return reply({ connection: await rpc("monitor_connection_status", { p_user: user.id }),
        message: connectionMessages[result.state as keyof typeof connectionMessages] });
    }
    if (input.op === "sessionCheck" || input.op === "savedSessionCheck") {
      if (anonymous) return reply({ error: "Sign in with a registered staging account to check Vinted access." }, 403);
      let savedCredentials: any = null;
      if (input.op === "savedSessionCheck") {
        const encrypted = await rpc("monitor_connection_read", { p_user: user.id });
        if (!encrypted) return reply({ error: "Test session renewal first; the saved access token is unavailable or expired." }, 409);
        try { savedCredentials = await unseal(encrypted, await rpc("monitor_connection_key"), user.id); }
        catch { return reply({ error: "Saved connection could not be read. Reconnect Vinted." }, 409); }
        input.accessToken = savedCredentials.accessToken;
      }
      validateAccessToken(input.accessToken);
      const monitor = await own(user.id, input.id);
      if (monitor.archived) throw new TypeError("Restore this monitor before checking its search.");
      if (!monitor.recipe.searchTerms.includes(input.searchText)) throw new TypeError("Choose a saved search from this monitor.");
      const claim = await rpc("monitor_session_claim", { p_user: user.id });
      if (!claim.accepted) return reply({ error: "Wait until " + claim.retryAt + " before checking again.", retryAt: claim.retryAt }, 429);
      const result = await checkSession({ request: fetch, accessToken: input.accessToken,
        recipe: monitor.recipe, searchText: input.searchText, userAgent: savedCredentials?.userAgent });
      savedCredentials = null;
      // Drop the value before persistence. No token/response body enters storage or logs.
      input.accessToken = null;
      const saved = await rpc("monitor_session_finish", { p_user: user.id, p_check: claim.checkId,
        p_monitor: monitor.id, p_revision: monitor.revision, p_status: result.status,
        p_http: result.httpStatus, p_received: result.received, p_items: result.items,
        p_retry: result.retryAt ? new Date(result.retryAt).toISOString() : null });
      if (!saved) throw new TypeError("Monitor changed during the check. Refresh before trying again.");
      return reply({ status: result.status, message: sessionMessages[result.status as keyof typeof sessionMessages],
        received: result.received, saved: saved.saved, retryAt: saved.retryAt, checkedAt: saved.checkedAt });
    }
    if (input.op === "bootstrap" || input.op === "status") {
      const c = await config();
      if (input.op === "bootstrap") {
        for (const tier of canonTierPresets()) await rpc("monitor_save", {
          p_user: user.id, p_id: null, p_revision: null,
          p_data: tier.data, p_preset: tier.key,
        });
      }
      const monitors = await db(
        "monitor_recipes?user_id=eq." + user.id + "&order=created_at.asc",
      );
      const subscriptions = await db(
        "monitor_push_subscriptions?user_id=eq." + user.id + "&select=id",
      );
      const connection = anonymous ? {state:'disconnected',stored:false,automatic:false} : await rpc("monitor_connection_status", {p_user:user.id});
      const connectedSource = connection.stored || connection.scanCheckedAt ? {
        status: connection.state !== 'verified' ? 'blocked' : !connection.automatic ? 'blocked' : connection.scanStatus === 'ready' ? 'ready' : connection.scanStatus === 'waiting' ? 'starting' : 'degraded',
        message: connection.state !== 'verified' ? 'Vinted session needs attention in Connection.' : connection.scanMessage || 'Waiting for the first scheduled scan.',
        checkedAt: connection.scanCheckedAt || connection.checkedAt, retryAt: connection.scanRetryAt,
        automatic:connection.automatic, intervalSeconds:60
      } : null;
      if (connectedSource?.automatic && connectedSource.checkedAt && Date.parse(connectedSource.checkedAt)<Date.now()-180000 && connectedSource.status==='ready') {
        connectedSource.status='degraded';connectedSource.message='Scheduled scans are stale. The last successful check was more than three minutes ago.';
      }
      return reply({
        monitors,
        capabilities: { sessionCheck: true, persistentConnection: true, automaticMonitoring: true },
        connection,
        pushDevices: anonymous ? [] : await rpc("monitor_push_status",{p_user:user.id}),
        canonModels: canon.models.map((model: any) => model.id),
        anonymous,
        pushKey: c.vapid.publicKey,
        devices: subscriptions.length,
        source: connectedSource || {
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
      const history = await rpc("monitor_history", {p_user:user.id,p_monitor:m.id,p_filter:input.filter,p_query:input.query,p_cursor:c || null});
      history.rows = history.rows.filter((row:any) => matchListing(row.listing,m.recipe).status === 'match');
      return reply(history);
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
      snapshot.matches = snapshot.matches.filter((row:any) => matchListing(row.listing,m.recipe).status === 'match');
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
      const subs = await db("monitor_push_subscriptions?user_id=eq." + user.id +
        (input.all === true ? "" : "&endpoint=eq." + eq(String(input.endpoint))));
      if (!subs.length) throw new TypeError("Enable notifications on this device first");
      const ids: string[] = [];
      for (const sub of subs) {
        const recent = await db("monitor_outbox?subscription_id=eq." + sub.id + "&monitor_id=is.null&next_attempt_at=gt." + eq(new Date(Date.now()-60000).toISOString()) + "&limit=1");
        if (recent.length) continue;
        const [job] = await db("monitor_outbox", {subscription_id:sub.id,payload:{userId:user.id,
          title:"RETRADE · Test notification",body:"Your device received a RETRADE test. Tap to open staging.",tag:"monitor-test-"+crypto.randomUUID()}});
        ids.push(job.id);
      }
      if (!ids.length) return reply({error:"Wait a few minutes before sending another test."},429);
      await pushBatch(await config());
      return reply({ok:true,message:"Test requested for " + ids.length + " device(s). Delivery details below distinguish provider acceptance from device acknowledgement.",
        pushDevices:await rpc("monitor_push_status",{p_user:user.id})});
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
