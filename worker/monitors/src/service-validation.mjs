import { createRecipe, canonBenchmark } from "./contracts.mjs";

export function monitorInput(body) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 80
  )
    throw new TypeError("Name must be 1–80 characters");
  const recipe = createRecipe(body.recipe);
  if (!recipe.searchTerms.length || recipe.searchTerms.length > 3)
    throw new TypeError("Choose 1–3 search terms");
  // MVP supports catalog evidence only. Do not offer filters that require unavailable enrichment.
  if (
    recipe.rejectTerms.length ||
    recipe.conditions.length ||
    recipe.zeroReviews === "hide"
  )
    throw new TypeError(
      "Detailed condition and seller filters are not available yet",
    );
  if (
    typeof body.enabled !== "boolean" ||
    typeof body.notifications !== "boolean" ||
    typeof body.archived !== "boolean"
  )
    throw new TypeError("Invalid monitor switches");
  return {
    name: body.name.trim(),
    recipe,
    enabled: body.enabled && !body.archived,
    notifications: body.notifications,
    archived: body.archived,
  };
}
export const preset = () => ({
  name: "Canon · Discord comparison £51–£100",
  recipe: canonBenchmark(),
  enabled: true,
  notifications: false,
  archived: false,
});

export function subscriptionInput(input) {
  if (
    !input ||
    typeof input.endpoint !== "string" ||
    input.endpoint.length > 2048
  )
    throw new TypeError("Invalid push subscription");
  const url = new URL(input.endpoint);
  const host = url.hostname;
  const allowed =
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com");
  if (
    !allowed ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new TypeError("Unsupported push provider");
  if (
    !/^[A-Za-z0-9_-]{87}=?$/.test(input.keys?.p256dh ?? "") ||
    !/^[A-Za-z0-9_-]{22}={0,2}$/.test(input.keys?.auth ?? "")
  )
    throw new TypeError("Invalid push keys");
  return {
    endpoint: url.href,
    keys: { p256dh: input.keys.p256dh, auth: input.keys.auth },
  };
}
export function comparatorInput(body) {
  let id = String(body.listingId ?? "").trim();
  if (id.startsWith("https://")) {
    const u = new URL(id);
    if (
      !["www.vinted.co.uk", "vinted.co.uk"].includes(u.hostname) ||
      u.port ||
      u.username ||
      u.password
    )
      throw new TypeError("Use a Vinted UK listing link");
    id = /^\/items\/([1-9]\d{0,19})(?:-|\/|$)/.exec(u.pathname)?.[1] ?? "";
  }
  if (!/^[1-9]\d{0,19}$/.test(id))
    throw new TypeError("Enter a Vinted listing ID or link");
  const time = Date.parse(body.observedAt);
  if (
    !/(Z|[+-]\d\d:\d\d)$/.test(body.observedAt ?? "") ||
    !Number.isFinite(time) ||
    time > Date.now() + 60000
  )
    throw new TypeError("Enter the Discord message time with a timezone");
  return { listingId: id, observedAt: new Date(time).toISOString() };
}
