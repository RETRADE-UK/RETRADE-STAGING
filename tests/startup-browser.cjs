/* Isolated UI regression tests. All requests are fulfilled from this checkout
 * or blocked; authentication and data are synthetic. Never contact Supabase. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const {assets}=require('../scripts/assets.cjs');
const session = { user: { id: 'ui-test', email: 'ui@example.test', user_metadata: { full_name: 'Test User' } } };

function mockAuth(initialSession) {
  window.__fixtureSession = initialSession;
  window.__fixtureSignInCalls = 0;
  const listeners = [];
  window.supabase = { createClient(url) { window.__fixtureClientUrl=url; return { auth: {
    async getSession() { await new Promise(r => setTimeout(r, 100)); return { data: { session: window.__fixtureSession } }; },
    onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithPassword({ password }) {
      window.__fixtureSignInCalls++;
      await new Promise(r => setTimeout(r, 100));
      if (password === 'bad') return { error: { message: 'Invalid login credentials' } };
      window.__fixtureSession = { user: { id: 'ui-test', email: 'ui@example.test', user_metadata: { full_name: 'Test User' } } };
      listeners.forEach(fn => fn('SIGNED_IN', window.__fixtureSession));
      // Reproduce the accepted-session/transient-response race.
      return { error: { message: 'Network error' } };
    }
  } }; } };
}

const fixture = fs.readFileSync(path.join(root,'src/features/diagnostics/preview-fixtures.js'),'utf8')+`
SUMMARY_PERIOD='30d';
loadFromSupabase=async function(){
  await new Promise(r=>setTimeout(r,300));
  DB=_buildPreviewDB();DB._userOwned=true;_previewMode=true;
  const key=currentMonthKey();DB[key]=DB[key]||[];
  for(let i=0;i<24;i++){
    const date=new Date();date.setDate(date.getDate()-(i%7));const ds=date.toISOString().slice(0,10);
    DB[key].push({id:'audit-'+i,item:'Test stock '+i,state:'sold',category:'Electronics',dateSourced:ds,dateListed:ds,dateSold:ds,salePrice:100+i*10,costPrice:40+i,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,salePlatform:'ebay_biz',returnHistory:[],parts:[]});
  }
};
_hydrateUserSettings=async()=>{};_startRealtimeSync=async()=>{};_stopRealtimeSync=()=>{};
saveDB=()=>{};_readSyncClockRevision=async()=>{};_refreshCloudOnResume=async()=>false;
`;

async function open(browser, { signedIn = false, mobile = false, reduced = false, slowCore = false, failedCore = false, failedBinding = false, slowData = false, slowFeatures = false, items = 24, timezoneId } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block',timezoneId });
  const page = await context.newPage();
  const errors = [];
  const missingAssets=[];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/supabase-js@')) return route.fulfill({ contentType: 'text/javascript', body: `(${mockAuth.toString()})(${JSON.stringify(signedIn ? session : null)});` });
    if (url.origin !== 'http://retrade.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/ integrity="[^"]*"/g, '') });
    if(failedBinding&&url.pathname==='/src/platform/staging-binding.js')return route.abort();
    const file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)){missingAssets.push(url.pathname);return route.fulfill({ status: 404, body: 'Missing test asset' });}
    if(slowFeatures&&url.pathname==='/src/features/bundles/orders.js')await new Promise(r=>setTimeout(r,2200));
    if (url.pathname === '/src/core/application.js') {
      if (failedCore) return route.abort();
      if (slowCore) await new Promise(r => setTimeout(r, 6000));
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8') + (slowData ? fixture.replace('setTimeout(r,300)', 'setTimeout(r,4200)') : fixture).replace('i<24', 'i<'+items) });
    }
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)] || 'application/octet-stream';
    return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
  });
  await page.goto('http://retrade.test/', { waitUntil: 'domcontentloaded' });
  return { page, context, errors, missingAssets };
}
async function settled(page) {
  await page.waitForFunction(() => window.__rtFeaturesReady && window.__rtLaunchSettled && !document.documentElement.classList.contains('rt-app-cold'), null, { timeout: 15000 });
}
async function checkFigures(page) {
  const values = await page.evaluate(() => [...document.querySelectorAll('#p-summary [data-cv]')].filter(e => e.getClientRects().length).map(e => ({ value: e.textContent, expected: (_CV_FMT[e.dataset.cvFmt] || _CV_FMT.k)(Number(e.dataset.cv)), target: Number(e.dataset.cv) })));
  assert(values.some(v => v.target > 1000), 'Populated fixture must exercise number animation');
  for (const value of values) assert.equal(value.value, value.expected, 'KPI must settle at its exact formatted target');
}
module.exports={mockAuth,fixture,open,settled};
if(require.main===module)(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const options of [{ signedIn: true }, { signedIn: true, mobile: true }, { signedIn: true, reduced: true }]) {
      const { page, context, errors, missingAssets } = await open(browser, options);
      await settled(page);
      await checkFigures(page);
      if(options.mobile){
        const tapGeometry=await page.evaluate(()=>{
          document.body.style.minHeight='2400px';
          window.scrollTo(0,560);
          return true;
        });
        await page.waitForFunction(()=>window.scrollY>300);
        const hit=await page.evaluate(()=>{
          const nav=document.querySelector('#bottom-nav .bnt[data-tab="stock"]');
          const rect=nav.getBoundingClientRect();
          const top=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
          const font=parseFloat(getComputedStyle(document.getElementById('global-search-mobile')).fontSize);
          return {onTarget:top===nav||nav.contains(top),navBottom:rect.bottom,font};
        });
        assert(hit.onTarget,'Scrolled mobile nav must receive taps at its visible coordinates');
        assert(hit.navBottom<=844&&hit.navBottom>740,'Mobile nav remains on screen after scrolling');
        assert(hit.font>=16,'Mobile search input must not trigger iOS focus zoom');
        await page.evaluate(()=>{openPanel('Tap test','<input aria-label="Tap test field">');closePanel();closePanel();});
        assert.equal(await page.evaluate(()=>document.body.style.position),'','Repeated panel dismissal must release the body scroll lock once');
        await page.evaluate(()=>{document.body.style.minHeight='';window.scrollTo(0,0);});
      }
      if(assets.environment==='staging')assert.equal(await page.evaluate(()=>window.__fixtureClientUrl),'https://dvnrxmdejxfuazmpnudj.supabase.co');
      assert.equal(await page.locator('.page.on').getAttribute('id'), 'p-summary');
      if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/dashboard-'+(options.mobile?'mobile':'desktop')+'.png'});
      const chart = options.mobile ? '#summary-chart-svg-mobile' : '#summary-chart-svg';
      assert(await page.locator(chart + ' rect').count() > 0, 'Visible chart must render');
      if (!options.mobile && !options.reduced) {
        assert.equal(await page.locator('#summary-chart-svg-mobile rect').count(), 0, 'Hidden chart should defer SVG work');
        for (const tab of ['stock','monthly','accounts','expenses','cash','runs','tax','data','returns','scrapped','activity','search','summary']) {
          const immediate=await page.evaluate(tab => {goToTab(tab);const p=document.querySelector('.page.on');return {content:p.children.length,busy:p.getAttribute('aria-busy')};}, tab);
          // Fast routes may finish before the delayed placeholder is mounted.
          assert.equal(immediate.busy,'true');
          await page.waitForFunction(tab => document.querySelector('.page.on')?.id === 'p-' + tab, tab);
          await page.waitForFunction(() => !document.querySelector('.page.on')?.hasAttribute('aria-busy'), null, {timeout:5000});
          assert((await page.locator('.page.on').innerText()).trim().length>0,'Route must not be blank: '+tab);
        }
        assert.equal(await page.evaluate(()=>typeof runFinancialRegressionTests),'undefined','Diagnostic fixtures must not load during startup');
        const financial=await page.evaluate(async()=>{await _loadDiagnosticFixtures('accounting');return [runFinancialRegressionTests(),runStockLifecycleRegressionTests(),runCashLedgerRegressionTests(),runSummaryCycleRegressionTests()].map(r=>({ok:r.ok,passed:r.passed,failures:r.results.filter(x=>!x.ok)}));});
        assert(financial.every(r=>r.ok),'Accounting diagnostic regression: '+JSON.stringify(financial));
        const taxSelection=await page.evaluate(()=>{
          const oldYear=DB._taxYear,oldMethod=DB._taxMethod,oldExpenses=DB.expenses;
          try{
            DB._taxYear=2026;DB._taxMethod='ta';
            DB.expenses=(oldExpenses||[]).concat([{id:'allowance-regression',date:'2026-08-01',amount:5000,category:'Other',description:'Fixture'}]);
            renderTax();
            const actualSelected=_taxExportData.method==='Actual expenses';
            const bridge=[...document.querySelectorAll('#p-tax .tax-bridge-row')].map(e=>e.textContent.trim());
            DB._taxMethod='ta_manual';renderTax();
            const manualSelected=_taxExportData.method==='Actual expenses'&&!document.querySelector('#p-tax .tax-method-card');
            return {actualSelected,manualSelected,bridge};
          }finally{DB._taxYear=oldYear;DB._taxMethod=oldMethod;DB.expenses=oldExpenses;renderTax();}
        });
        assert(taxSelection.actualSelected,'Legacy automatic allowance must update when actual expenses exceed £1,000');
        assert(taxSelection.manualSelected,'Legacy manual allowance must not change actual-expense filing totals');
        assert(taxSelection.bridge.some(row=>row.includes('Yearly Sales gross profit')),'Tax must compare against Yearly Sales gross');
        assert(taxSelection.bridge.some(row=>row.includes('Yearly Sales net profit')),'Tax must compare against Yearly Sales net');
        console.log('PASS lazy accounting fixtures',financial.map(r=>r.passed));
        await page.evaluate(()=>openAddAccountModal());
        await page.waitForFunction(()=>document.querySelector('#acc-type option[value=consignment]')?.textContent.includes('Profit share'));
        await page.evaluate(()=>closePanel());
        await page.evaluate(()=>openAccountPage(_accounts[0].id));
        await page.locator('#p-item .rt-partner-statement-btn').click();
        await page.waitForFunction(()=>window.__rtPartnerStatementAccountingV3Ready&&window.__rtPartnerAdjustmentStatementExportersReady);
        await page.evaluate(()=>closePanel());
        await page.evaluate(() => goToTab('monthly'));
        await page.waitForFunction(() => document.querySelector('#p-monthly').dataset.rtSalesView==='detail'&&!document.querySelector('#p-monthly').hasAttribute('aria-busy'));
        const yearly=await page.evaluate(() => {backToMonthlyGrid(false);return document.querySelector('.rt-route-skeleton')?.dataset.view;});
        assert.equal(yearly,undefined,'Quick Sales switches retain content instead of flashing a skeleton');
        await page.waitForFunction(() => document.querySelector('#monthly-profitability-svg')&&!document.querySelector('#p-monthly').hasAttribute('aria-busy'));
        if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/sales-yearly.png'});
        await page.evaluate(() => goToTab('monthly'));
        await page.waitForFunction(() => !document.querySelector('#p-monthly').hasAttribute('aria-busy'));
        assert.equal(await page.evaluate(() => {backToMonthlyGrid(false);return document.querySelector('.rt-route-skeleton')?.dataset.view;}),undefined);
        await page.waitForFunction(() => !document.querySelector('#p-monthly').hasAttribute('aria-busy'));
        await page.evaluate(()=>{MONTHLY_VIEW='detail';renderMonthlyPage();MONTHLY_VIEW='grid';_showRoutePending('monthly');});
        await page.waitForSelector('.rt-route-skeleton[data-view="yearly"]');
        await page.evaluate(()=>{renderMonthlyPage();document.querySelector('#p-monthly').removeAttribute('aria-busy');});
        await page.evaluate(() => {goToTab('stock');goToTab('summary');});
        await page.waitForFunction(() => document.querySelector('#p-summary').hasAttribute('aria-busy')===false);
        assert.equal(await page.locator('.page.on').getAttribute('id'),'p-summary','Rapid navigation keeps the newest destination');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.querySelector('#summary-chart-svg-mobile rect'));
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.waitForFunction(() => document.querySelector('#summary-chart-svg rect'));
        await page.evaluate(session => window.__rtAuthHandoff(session), session);
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('rt-app-cold')), false, 'Repeated session event must not restart cold motion');
      }
      await page.evaluate(()=>setSummaryPeriod('current_fy'));
      await page.waitForFunction(()=>document.querySelector('#p-summary .rt-chart-forecast-shell'));
      if(!options.reduced)await page.waitForFunction(selector=>document.querySelector(selector+' .rt-chart-forecast-shell')?.getAnimations().length>0,chart);
      const sequence=await page.evaluate(selector=>{
        const svg=document.querySelector(selector);const ms=s=>parseFloat(s)*1000;
        const bars=[...svg.querySelectorAll('.rt-chart-primary-bar:not(.rt-chart-forecast-shell)')];
        const actualEnd=Math.max(...bars.map(b=>{const s=getComputedStyle(b);return ms(s.animationDelay)+ms(s.animationDuration);}));
        const shell=svg.querySelector('.rt-chart-forecast-shell'),style=getComputedStyle(shell);
        const a=shell.getAnimations()[0];let earlyOpacity=null;if(a){a.pause();a.currentTime=Math.max(0,ms(style.animationDelay)-1);earlyOpacity=Number(getComputedStyle(shell).opacity);a.play();}
        const dial=document.getElementById('fab-dial'),token=dial.__rtVisibilityToken;_syncFabVisibility();_syncFabVisibility();
        return {actualEnd,delay:ms(style.animationDelay),earlyOpacity,noFabReplay:token===dial.__rtVisibilityToken};
      },chart);
      assert(sequence.noFabReplay,'Repeated FAB sync must not restart motion');
      if(!options.reduced){assert(sequence.delay>=sequence.actualEnd+100,'Forecast must start after every actual bar settles: '+JSON.stringify(sequence));assert.equal(sequence.earlyOpacity,0,'Forecast stays invisible through actual reveal');}
      assert.deepEqual(errors, []);
      assert.deepEqual(missingAssets,[],'Every requested local asset must exist');
      console.log('PASS authenticated', JSON.stringify(options));
      await context.close();
    }
    const login = await open(browser);
    await login.page.waitForSelector('#rt-auth-brand-bridge');
    const bridgeCheck=await login.page.evaluate(()=>{
      const bridge=document.getElementById('rt-auth-brand-bridge');
      const animation=bridge.getAnimations()[0];animation.pause();
      const gaps=[0,180,360,540,720].map(t=>{animation.currentTime=t;const mark=bridge.querySelector('svg').getBoundingClientRect(),word=bridge.querySelector('.rt-auth-word').getBoundingClientRect();return word.top-mark.bottom;});
      const target=document.querySelector('#auth-screen-login .rt-auth-brand');
      const hidden=getComputedStyle(target).visibility;
      animation.currentTime=0;animation.play();return {gaps,hidden,words:bridge.textContent.trim()};
    });
    assert.equal(bridgeCheck.words,'RETRADE');assert.equal(bridgeCheck.hidden,'hidden');
    assert(bridgeCheck.gaps.every(g=>Math.abs(g-18)<1),'Shield and wordmark must maintain their 18px gap throughout travel');
    if(process.env.RETRADE_CAPTURE){await login.page.waitForTimeout(500);await login.page.screenshot({path:process.env.RETRADE_CAPTURE+'/login-transition.png'});}
    await settled(login.page);
    assert.equal(await login.page.evaluate(() => window.__rtLaunchPerf.brandHandoff), 'auth', 'Welcome must hand off to login rather than a fallback');
    await login.page.locator('#auth-email').fill('ui@example.test');
    await login.page.locator('#auth-pass').fill('bad');
    await login.page.evaluate(() => doSignIn());
    assert(await login.page.locator('#auth-error').isVisible(), 'Invalid credentials must still show an error');
    await login.page.locator('#auth-pass').fill('accepted');
    await login.page.evaluate(() => Promise.all([doSignIn(), doSignIn()]));
    await settled(login.page);
    await checkFigures(login.page);
    assert.equal(await login.page.evaluate(() => window.__fixtureSignInCalls), 2, 'Duplicate submit must produce one request');
    assert.equal(await login.page.locator('#auth-error').isVisible(), false, 'Accepted session must not show a false failure');
    assert.deepEqual(login.errors, []);
    console.log('PASS login handoff, rejected credentials, duplicate submit and transient response');
    await login.context.close();
    const mobileAuth=await open(browser,{mobile:true});
    await mobileAuth.page.waitForSelector('#rt-auth-brand-bridge');
    const mobileGap=await mobileAuth.page.evaluate(()=>{const b=document.getElementById('rt-auth-brand-bridge');return b.querySelector('.rt-auth-word').getBoundingClientRect().top-b.querySelector('svg').getBoundingClientRect().bottom;});
    assert(Math.abs(mobileGap-18)<1,'Mobile brand spacing must match welcome');
    await settled(mobileAuth.page);assert.equal(await mobileAuth.page.locator('#rt-auth-brand-bridge').count(),0);assert.deepEqual(mobileAuth.errors,[]);await mobileAuth.context.close();
    console.log('PASS mobile brand travels together and cleans up');
    const slow = await open(browser, { slowCore: true });
    await slow.page.waitForTimeout(4500);
    assert.equal(await slow.page.locator('#rt-launch-brand').evaluate(e => getComputedStyle(e).opacity), '1', 'Slow core load must not uncover the app');
    assert(await slow.page.locator('.rt-launch-progress').evaluate(e=>getComputedStyle(e).opacity)>.5,'Prolonged welcome shows quiet progress');
    await settled(slow.page);
    assert.equal(await slow.page.evaluate(() => window.__rtLaunchPerf.brandHandoff), 'auth');
    assert.deepEqual(slow.errors, []);
    console.log('PASS slow startup retains the welcome until auth is ready');
    await slow.context.close();
    const slowData=await open(browser,{signedIn:true,slowData:true});
    await slowData.page.waitForFunction(()=>document.body.classList.contains('rt-real-layout-loading')&&document.querySelector('#rt-launch-brand').classList.contains('rt-launch-brand-out'));
    assert(await slowData.page.locator('#p-summary .rt-data-loading').count()>0,'Slow data must expose masked skeleton regions');
    if(process.env.RETRADE_CAPTURE)await slowData.page.screenshot({path:process.env.RETRADE_CAPTURE+'/slow-data-skeleton.png'});
    await settled(slowData.page);await checkFigures(slowData.page);assert.deepEqual(slowData.errors,[]);
    await slowData.context.close();console.log('PASS slow data uses dashboard skeleton before true figures');
    const stress=await open(browser,{signedIn:true,items:600});
    await settled(stress.page);await checkFigures(stress.page);
    const warning=await stress.page.evaluate(()=>{
      const original=console.warn;let count=0;console.warn=()=>count++;
      try{const a=_calcEbayBizFeeComponents(100,'fixture-unknown');const b=_calcEbayBizFeeComponents(100,'fixture-unknown');return {count,a,b};}finally{console.warn=original;}
    });assert.equal(warning.count,1);assert.deepEqual(warning.a,warning.b);
    const timings=await stress.page.evaluate(async()=>{
      const frames=[];let last=performance.now(),running=true;
      function frame(t){frames.push(t-last);last=t;if(running)requestAnimationFrame(frame);}requestAnimationFrame(frame);
      const result=[];
      for(let i=0;i<2;i++){
        const start=performance.now();goToTab('monthly');const acknowledged=performance.now()-start;
        await new Promise(resolve=>{function check(){if(document.querySelector('#p-monthly').hasAttribute('aria-busy'))requestAnimationFrame(check);else resolve();}requestAnimationFrame(check);});
        result.push({view:MONTHLY_VIEW,acknowledgedMs:Math.round(acknowledged),readyMs:Math.round(performance.now()-start)});
      }
      running=false;return {routes:result,maxFrameMs:Math.round(Math.max(...frames))};
    });
    assert.deepEqual(stress.errors,[]);console.log('PASS 600-item navigation fixture',JSON.stringify(timings));await stress.context.close();
    if(assets.environment==='staging'){
      const binding=await open(browser,{failedBinding:true});
      await binding.page.getByRole('button',{name:'Unable to load RETRADE. Tap to retry.'}).click({trial:true});
      assert.equal(await binding.page.evaluate(()=>window.__fixtureClientUrl),undefined,'Failed staging binding must never create a production client');
      assert.deepEqual(binding.errors,[]);await binding.context.close();console.log('PASS staging binding fails closed');
    }
    const failed = await open(browser, { failedCore: true });
    await failed.page.getByRole('button', { name: 'Unable to load RETRADE. Tap to retry.' }).click({ trial: true });
    assert.deepEqual(failed.errors, []);
    console.log('PASS failed core load exposes an accessible retry');
    await failed.context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
