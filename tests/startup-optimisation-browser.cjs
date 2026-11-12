/* Synthetic auth/data only; the shared harness blocks all business requests. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
  const engine=process.argv.includes('--webkit')?webkit:chromium;
  const browser=await engine.launch({headless:true,...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try{
    const early=await open(browser,{signedIn:true,partnerData:true,mobile:true,reduced:true,slowFeatures:true});
    await early.page.waitForFunction(()=>window.__rtLaunchSettled&&!window.__rtFeaturesReady);
    const loading=await early.page.evaluate(()=>{
      goToTab('accounts');renderAccountsPage();
      return {legacy:document.querySelectorAll('#p-accounts .run-history-row').length,busy:document.getElementById('p-accounts').getAttribute('aria-busy')};
    });
    assert.deepEqual(loading,{legacy:0,busy:'true'},'Early navigation waits for the sole directory renderer');
    await early.page.locator('#rt-acct-op-search').waitFor();
    await early.page.waitForFunction(()=>!document.getElementById('p-accounts').hasAttribute('aria-busy'));
    assert.deepEqual(early.errors,[]);await early.context.close();
    for(const mobile of [false,true]){
      const {page,context,errors,missingAssets}=await open(browser,{signedIn:true,partnerData:true,mobile});
      await settled(page);
      assert.equal(await page.evaluate(()=>window.__rtReplayIntro),true);
      const frames=await page.evaluate(async()=>{
        openAccountPage(_accounts[0].id);
        const snapshot=()=>({legacy:document.querySelectorAll('#p-item .accounts-kpis-v2,#p-item .rt-account-adjustments').length,
          summary:document.querySelectorAll('#p-item .rt-position').length,
          workspace:document.querySelectorAll('#p-item .rt-account-workspace').length,
          statements:document.querySelectorAll('#p-item .rt-partner-statement-btn').length});
        const result=[snapshot()];for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);result.push(snapshot());}return result;
      });
      for(const frame of frames)assert.deepEqual(frame,{legacy:0,summary:1,workspace:1,statements:1});
      assert.equal(await page.getByRole('button',{name:/Allocate & settle|Settle .* outstanding/}).count(),0);
      assert.equal(await page.locator('[data-rt-partner-v2-hidden]').count(),0,'No disposable hidden core controls');
      // Nothing should create, erase and recreate account DOM after the paint.
      await page.waitForTimeout(300);
      const idle=await page.evaluate(async()=>{
        let mutations=0;const p=document.getElementById('p-item'),first=p.firstElementChild;
        const observer=new MutationObserver(m=>mutations+=m.length);observer.observe(p,{childList:true,subtree:true});
        await window.__rtPartnerAdjustmentsEnsureLoaded(true);
        await new Promise(r=>setTimeout(r,500));observer.disconnect();
        const data=JSON.stringify([DB,_accounts]);
        window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
        await new Promise(requestAnimationFrame);
        return {mutations,sameNode:first===p.firstElementChild,sameData:data===JSON.stringify([DB,_accounts]),
          brandHidden:getComputedStyle(document.getElementById('rt-launch-brand')).visibility==='hidden'};
      });
      assert.deepEqual(idle,{mutations:0,sameNode:true,sameData:true,brandHidden:true});
      await page.reload({waitUntil:'domcontentloaded'});await settled(page);
      assert.equal(await page.evaluate(()=>window.__rtReplayIntro),false,'Recent reload skips the brand choreography');
      assert(await page.evaluate(()=>document.documentElement.classList.contains('rt-quick-start')));
      assert.equal(await page.locator('#rt-auth-brand-bridge').count(),0);
      // Seed an expired session before bootstrap (pagehide correctly updates the
      // outgoing document's activity marker, so set it in the incoming document).
      await page.addInitScript(()=>sessionStorage.setItem('rt-last-active-at',String(Date.now()-31*60*1000)));
      await page.reload({waitUntil:'domcontentloaded'});await settled(page);
      assert.equal(await page.evaluate(()=>window.__rtReplayIntro),true,'A document restart after a long absence can replay');
      assert.deepEqual(errors,[]);assert.deepEqual(missingAssets,[]);
      await context.close();console.log('PASS single account layout, idle DOM, quiet foreground and session-aware welcome',mobile?'mobile':'desktop');
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
