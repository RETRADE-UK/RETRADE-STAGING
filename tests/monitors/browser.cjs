const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { open, settled } = require("../startup-browser.cjs");
(async () => {
  const { preset } = await import(
    "../../worker/monitors/src/service-validation.mjs"
  );
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    for (const mobile of [false, true]) {
      const { page, context, errors } = await open(browser, {
        signedIn: true,
        mobile,
      });
      await settled(page);
      let monitors = [
          {
            ...preset(),
            id: "11111111-1111-4111-8111-111111111111",
            revision: 1,
            status: "waiting",
          },
        ],
        calls = 0;
      await page.route("**/functions/v1/monitor-service", async (route) => {
        calls++;
        const d = route.request().postDataJSON();
        let response = {};
        let status = 200;
        if (d.op === "bootstrap")
          response = {
            monitors,
            anonymous: false,
            devices: 0,
            pushKey: "A".repeat(87),
            source: {
              status: "blocked",
              message: "Source blocked (HTTP 403).",
              checkedAt: "2026-09-24T09:19:06Z",
            },
          };
        if (d.op === "feed")
          response = {
            matches: [],
            comparison: {
              rows: [],
              observedDiscordIds: 0,
              pairedIds: 0,
              discordOnly: 0,
              retradeOnly: 0,
            },
            baselineExclusions: 0,
          };
        if (d.op === "save") {
          if (d.name === "Fail save") {
            status = 400;
            response = { error: "Storage rejected the save" };
          } else {
            const m = {
              ...d,
              id: d.id || "22222222-2222-4222-8222-222222222222",
              revision: (d.revision || 0) + 1,
            };
            monitors = monitors.filter((x) => x.id !== m.id).concat(m);
            response = { monitor: m };
          }
        }
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(response),
        });
      });
      await page.evaluate(() => {
        _currentUserId = "ui-test";
        window.__fixtureSession.access_token = "synthetic-test";
        goToTab("monitors");
      });
      await page
        .getByText("Live source not connected", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "+ New monitor", exact: true })
        .click();
      const dialog = page.locator(".monitor-dialog");
      await dialog.waitFor();
      await dialog.getByLabel("Name", { exact: true }).fill("Fail save");
      await dialog.getByLabel("Search terms").fill("GoPro");
      await dialog.getByLabel("Model names").fill("Hero 12, Hero 13");
      await dialog.getByRole("button", { name: "Save monitor" }).click();
      await dialog.getByText("Storage rejected the save").waitFor();
      assert.equal(monitors.length, 1);
      await dialog.getByLabel("Name", { exact: true }).fill("GoPro under £100");
      await dialog.getByRole("button", { name: "Save monitor" }).click();
      await dialog.waitFor({ state: "detached" });
      await page.getByText("Monitor saved.", { exact: true }).waitFor();
      assert.equal(monitors.length, 2);
      assert.deepEqual(monitors[1].recipe.customModels, ["Hero 12", "Hero 13"]);
      await page.getByRole("button", { name: "Preview example cards" }).click();
      await page
        .getByText("Canon EOS 600D with kit lens", { exact: true })
        .waitFor();
      assert.equal(await page.locator(".monitor-feed a").count(), 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "No horizontal overflow",
      );
      await page.screenshot({
        path: "/tmp/monitors-" + (mobile ? "mobile" : "desktop") + ".png",
        fullPage: true,
      });
      await page.evaluate(() => goToTab("summary"));
      assert.equal(await page.locator("#p-monitors").textContent(), "");
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        "Monitor browser " +
          (mobile ? "mobile" : "desktop") +
          ": custom save, failure retention, preview isolation and navigation disposal passed.",
      );
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
