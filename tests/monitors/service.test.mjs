import test from "node:test";
import assert from "node:assert/strict";
import {
  monitorInput,
  subscriptionInput,
  comparatorInput,
  preset,
} from "../../worker/monitors/src/service-validation.mjs";
test("MVP recipes retain Canon benchmark scope and separate notification consent", () => {
  const p = preset();
  assert.equal(p.recipe.benchmark, true);
  assert.equal(p.notifications, false);
  assert.equal(monitorInput({ ...p, notifications: true }).notifications, true);
  assert.throws(() =>
    monitorInput({ ...p, recipe: { ...p.recipe, conditions: ["good"] } }),
  );
  assert.throws(() => monitorInput({ ...p, enabled: "yes" }));
  assert.throws(() =>
    monitorInput({ ...p, recipe: { ...p.recipe, searchTerms: [] } }),
  );
});
test("push endpoints exclude SSRF destinations and invalid encryption keys", () => {
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
  };
  assert.equal(subscriptionInput(sub).endpoint, sub.endpoint);
  for (const endpoint of [
    "http://fcm.googleapis.com/test",
    "https://fcm.googleapis.com.evil.test/",
    "https://127.0.0.1/",
    "https://fcm.googleapis.com:444/a",
    "https://user@fcm.googleapis.com/a",
    "https://example.com",
  ])
    assert.throws(() => subscriptionInput({ ...sub, endpoint }));
  assert.throws(() => subscriptionInput({ ...sub, keys: {} }));
});
test("Discord observations validate identity, timezone and future time", () => {
  const value = {
    listingId: "https://www.vinted.co.uk/items/12345-canon",
    observedAt: "2026-01-01T12:00:00Z",
  };
  assert.equal(comparatorInput(value).listingId, "12345");
  assert.throws(() =>
    comparatorInput({ ...value, listingId: "https://evil.test/items/12345" }),
  );
  assert.throws(() =>
    comparatorInput({ ...value, observedAt: "2026-01-01T12:00:00" }),
  );
  assert.throws(() =>
    comparatorInput({ ...value, observedAt: "2099-01-01T12:00:00Z" }),
  );
});
