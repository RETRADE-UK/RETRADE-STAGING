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
        calls = 0, failBootstrap = true, delayedSave = null, releaseSave = null,
        statusState = "blocked", feedRows = [], failState = false, deviceRegistered = false;
      await page.route("**/functions/v1/monitor-service", async (route) => {
        calls++;
        const d = route.request().postDataJSON();
        let response = {};
        let status = 200;
        if (d.op === "bootstrap" || d.op === "status")
          response = {
            monitors,
            canonModels: preset().recipe.models,
            anonymous: false,
            devices: 0,
            pushKey: "A".repeat(87),
            source: {
              status: "blocked",
              message: "Source blocked (HTTP 403).",
              checkedAt: "2026-09-24T09:19:06Z",
            },
          };
        if (d.op === "bootstrap" && failBootstrap) {
          failBootstrap = false; status = 503; response = { error: "Temporary startup failure" };
        }
        if (d.op === "status") response.source.status = statusState;
        if (d.op === 'device') response={registered:deviceRegistered};
        if (d.op === 'subscribe') {deviceRegistered=true;response={ok:true};}
        if (d.op === 'unsubscribe') {deviceRegistered=false;response={ok:true};}
        if (d.op === 'testPush') response={message:'Push provider accepted the test. Check your phone to confirm receipt.'};
        if (d.op === 'history') response = {rows:feedRows.filter(r=>d.filter !== 'saved' || r.saved),nextCursor:null};
        if (d.op === 'itemState') {
          if(failState) {status=400;response={error:'Item save failed'};}
          else {const row=feedRows.find(r=>r.listing.id===d.listingId); if(d.saved!==undefined)row.saved=d.saved; if(d.read!==undefined)row.read_at=d.read?'2026-10-05T10:00:00Z':null;response={ok:true};}
        }
        if (d.op === "feed")
          response = {
            matches: feedRows,
            comparison: {
              rows: feedRows.length ? [{listingId:'12345',retradeAt:'2026-09-27T10:00:00Z',discordAt:'2026-09-27T10:00:01Z',differenceMs:-1000}] : [],
              observedDiscordIds: feedRows.length ? 1 : 0,
              pairedIds: feedRows.length ? 1 : 0,
              medianDifferenceMs: -1000,
              p95DifferenceMs: -1000,
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
            if (d.name === "Slow save") {
              delayedSave = new Promise(resolve => { releaseSave = resolve; });
              await delayedSave;
            }
            const m = {
              ...d,
              id: d.id || (monitors.length === 1 ? "22222222-2222-4222-8222-222222222222" : "33333333-3333-4333-8333-333333333333"),
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
        const sub={endpoint:'https://fcm.googleapis.com/fcm/send/fixture',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'fixture',auth:'fixture'}};},async unsubscribe(){return true;}};
        Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>({active:true,pushManager:{getSubscription:async()=>sub}})}});
        Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
        Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'granted',requestPermission:async()=>{window.__pushPermissionAsked=true;return 'granted';}}});
        const interval = window.setInterval;
        window.setInterval = function(fn, ms, ...args) {
          if(ms === 30000) window.__monitorPoll = fn;
          return interval(fn, ms, ...args);
        };
        goToTab("monitors");
      });
      await page.getByText("Temporary startup failure", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await page
        .getByText("Live source not connected", { exact: true })
        .waitFor();
      assert.equal(await page.locator('[data-panel="manage"]').isVisible(),false);
      assert.equal(await page.locator('[data-panel="alerts"]').isVisible(),false);
      await page.getByLabel('Monitor workspace').getByRole('button',{name:'Alerts',exact:true}).click();
      assert.equal(await page.locator('[data-action="test"]').isEnabled(),false,'Another endpoint/account does not imply this device is ready');
      await page.locator('[data-action="push"]').click();
      await page.getByText('This device is connected. Send a test to confirm receipt.',{exact:true}).waitFor();
      assert(await page.evaluate(()=>window.__pushPermissionAsked));
      await page.locator('[data-action="test"]').click();
      await page.getByText('Push provider accepted the test. Check your phone to confirm receipt.',{exact:true}).waitFor();
      await page.getByLabel('Monitor workspace').getByRole('button',{name:'Monitors',exact:true}).click();
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
      // Closing an in-flight editor must not close a later editor or lose the save.
      await page.getByRole("button", { name: "+ New monitor", exact: true }).click();
      await dialog.getByLabel("Name", { exact: true }).fill("Slow save");
      await dialog.getByLabel("Search terms").fill("Canon");
      await dialog.getByLabel("Model names").fill("600D");
      const saveRequest = page.waitForRequest(r=>r.url().includes('monitor-service') && r.postDataJSON().name === 'Slow save');
      await dialog.getByRole("button", { name: "Save monitor" }).click();
      await saveRequest;
      await dialog.getByRole("button", { name: "Close builder" }).click();
      await page.getByRole("button", { name: "+ New monitor", exact: true }).click();
      await dialog.getByLabel("Name", { exact: true }).fill("Keep this draft");
      releaseSave();
      await page.locator('.monitor-list').getByText("Slow save", { exact: true }).waitFor();
      assert.equal(await dialog.getByLabel("Name", { exact: true }).inputValue(),"Keep this draft");
      await dialog.getByRole("button", { name: "Close builder" }).click();
      // The existing Canon codes keep their aliases; added phrases are custom.
      await page.locator('[data-action="edit"][data-id="11111111-1111-4111-8111-111111111111"]').click();
      await dialog.getByLabel("Model names").fill("600D, vintage camera");
      await dialog.getByRole("button", { name: "Save monitor" }).click();
      await dialog.waitFor({state:"detached"});
      assert.deepEqual(monitors.find(x=>x.id.startsWith('1111')).recipe.customModels,['vintage camera']);
      assert.deepEqual(monitors.find(x=>x.id.startsWith('1111')).recipe.models,['600D']);
      const searchLink = new URL(await page.getByRole('link',{name:'Search Canon on Vinted ↗'}).first().getAttribute('href'));
      assert.equal(searchLink.searchParams.get('price_from'),'51.00');
      statusState = 'degraded';
      await page.evaluate(()=>window.__monitorPoll());
      await page.getByText("Catalogue temporarily unavailable", {exact:true}).waitFor();
      // Feed output remains text-safe and gallery preserves native disclosure state.
      feedRows = [{ listing: { id:'12345', title:'<script>hostile title</script>', itemPricePence:8500,
        imageUrls:['https://images.vinted.net/one.jpg','https://images.vinted.net/two.jpg','javascript:alert(1)'] },
        result:{status:'match',warnings:[]}, observed_at:'2026-09-27T10:00:00Z' }];
      await page.getByRole('button',{name:'Finds',exact:true}).click();
      await page.getByRole('button',{name:'Refresh',exact:true}).click();
      await page.getByText('<script>hostile title</script>',{exact:true}).waitFor();
      assert.equal(await page.locator('.monitor-feed script').count(),0);
      await page.locator('.monitor-item-details > summary').click();
      await page.locator('.monitor-gallery summary').click();
      assert.equal(await page.locator('.monitor-gallery img').count(),2);
      await page.getByRole('button',{name:'Refresh',exact:true}).click();
      assert(await page.locator('.monitor-gallery').evaluate(e=>e.open));
      failState=true;
      const failedItemWrite=page.waitForResponse(r=>r.url().includes('monitor-service') && r.request().postDataJSON().op==='itemState');
      await page.locator('[data-action="save-item"]').click();
      assert.equal((await failedItemWrite).status(),400);
      await page.getByText('Item save failed',{exact:true}).waitFor();
      assert.equal(await page.locator('[data-action="save-item"]').textContent(),'Save');
      failState=false;
      await page.locator('[data-action="save-item"]').click();
      await page.locator('[data-action="save-item"][aria-pressed="true"]').waitFor();
      await page.locator('[data-action="read-item"]').click();
      await page.getByRole('button',{name:'Mark unread',exact:true}).waitFor();
      await page.locator('.monitor-tools > summary').click();
      const downloadEvent=page.waitForEvent('download');
      await page.getByRole('button',{name:'Export sample CSV'}).click();
      const download=await downloadEvent;
      const csv=require('node:fs').readFileSync(await download.path(),'utf8');
      assert(csv.includes('"12345","2026-09-27T10:00:00Z","2026-09-27T10:00:01Z","-1000"'));
      assert(csv.includes('retrade_minus_discord_ms'));
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
      for (const width of mobile ? [320,390] : [1024,1440]) {
        await page.setViewportSize({width,height:900});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false,'Width '+width);
      }
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
          ": startup retry, custom/Canon save, delayed-close race, live health, safe gallery, preview, responsive widths and disposal passed.",
      );
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
