/* Synthetic browser checks: no requests reach live data or auth. */
const assert=require('node:assert/strict');const {chromium}=require('playwright');const {open,settled}=require('./startup-browser.cjs');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
try{for(const mobile of [false,true]){
 const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
 await page.evaluate(()=>{window.dispatchEvent(new Event('retrade:data-ready'));goToTab('accounts');renderAccountsPage();});
 const input=page.getByRole('searchbox',{name:'Search accounts'});await input.waitFor();
 assert(!await page.locator('.rt-accounts-result').isVisible(),'No redundant result caption before filtering');
 assert(await page.evaluate(()=>document.querySelector('[data-account-kpi="potential"] strong').textContent===fmt(_accounts.reduce((sum,a)=>sum+_accountStats(a.id).forecastYourShare,0))),'Potential sums authoritative retained profit forecasts');
 await page.evaluate(()=>{window.__originalSearch=document.getElementById('rt-acct-op-search');window.__statsCalls=0;window.__baseStats=_accountStats;_accountStats=function(){__statsCalls++;return __baseStats.apply(this,arguments);};window.__accountsBefore=JSON.stringify(_accounts);});
 await input.fill('martin');assert.equal(await page.locator('.rt-acct-op-row:not([hidden])').count(),1);
 assert(await page.locator('.rt-accounts-result').isVisible());
 assert(await input.evaluate(e=>e===window.__originalSearch&&e===document.activeElement));
 await input.fill('no such account');assert(await page.locator('.rt-acct-op-empty').isVisible());await input.fill('');
 await page.getByRole('button',{name:'Filter and sort accounts'}).click();await page.locator('[data-account-filter="share"]').click();
 assert.equal(await page.locator('.rt-acct-op-row:not([hidden])').count(),2);
 assert(await page.locator('.rt-accounts-result').isVisible(),'Filter-only result count is visible');
 await page.evaluate(()=>{_rtAcctOpFilter('all');_rtAcctCompactSort('name-desc');});
 assert(!await page.locator('.rt-accounts-result').isVisible(),'Sorting alone does not show the count');
 assert((await page.locator('.rt-acct-op-row:not([hidden])').first().innerText()).includes('TechClearance'));
 assert.equal(await page.evaluate(()=>__statsCalls),0,'Search/filter/sort must not recalculate financial statistics');
 assert(await page.evaluate(()=>JSON.stringify(_accounts)===__accountsBefore),'List controls do not mutate accounts');
 await page.evaluate(()=>{_accountStats=__baseStats;});
 for(const width of mobile?[320,390,800]:[1440,1920]){
  await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Directory fits '+width);
 }
 await page.setViewportSize({width:mobile?390:1440,height:1000});
 if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/account-list-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
 await page.evaluate(()=>openAccountPage(_accounts[0].id));await page.locator('.rt-account-workspace').waitFor();
 assert.equal(await page.locator('.rt-account-inventory .account-group').count(),4);
 assert.equal(await page.locator('.rt-account-payments .rt-payalloc2').count(),1);
 const listed=page.locator('.account-group[data-group-key="listed"]');await listed.locator('.account-group-head').click();
 assert(!await listed.evaluate(e=>e.classList.contains('collapsed')));
 await page.getByRole('searchbox',{name:'Search partner items'}).fill('Canon');
 assert(await page.getByRole('searchbox',{name:'Search partner items'}).evaluate(e=>e===document.activeElement));
 await page.locator('.rt-partner-v2-select').click();
 assert(await page.locator('.rt-account-payments .account-group .metric-inline').evaluateAll(rows=>rows.every(row=>row.style.display!=='none')),'Item search must not hide payment history after selection re-render');
 await page.locator('.rt-partner-v2-select').click();
 await page.getByRole('searchbox',{name:'Search partner items'}).fill('');
 // All presentation owners must settle; idle mutation loops caused jank.
 await page.waitForTimeout(700);
 const mutations=await page.evaluate(async()=>{let n=0;const observer=new MutationObserver(m=>n+=m.filter(x=>x.type==='childList').length);observer.observe(document.getElementById('p-item'),{childList:true,subtree:true});await new Promise(r=>setTimeout(r,400));observer.disconnect();return n;});
 assert.equal(mutations,0,'Idle account page must not rewrite itself');
 for(const width of mobile?[320,390,800]:[1440,1920]){
  await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Detail fits '+width);
 }
 await page.setViewportSize({width:mobile?390:1440,height:1000});
 if(process.env.RETRADE_CAPTURE)await page.screenshot({path:process.env.RETRADE_CAPTURE+'/account-detail-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
 // Tax references remain visible and the filing guide groups shared box totals.
 await page.evaluate(()=>{goToTab('tax');renderTax();});await page.locator('#tax-income-expenses').waitFor();
 if(!await page.locator('#tax-income-expenses').evaluate(e=>e.open))await page.locator('#tax-income-expenses>summary').click();
 assert(await page.locator('#tax-income-expenses .tax-exp-row small').first().isVisible());
 await page.locator('.tax-inline-action').click();
 assert((await page.locator('.tax-filing-lines').innerText()).includes('Box 9'));
 await page.locator('#tax-filing-form').selectOption('full');assert((await page.locator('.tax-filing-lines').innerText()).includes('Box 15'));
 await page.evaluate(()=>{goToTab('expenses');renderExpenses();});await page.locator('#cost-selection-controls .select-toggle').click();
 const geometry=await page.locator('#cost-selection-controls').evaluate(el=>{const all=el.querySelector('.sel-check').getBoundingClientRect(),done=el.querySelector('.sel-exit').getBoundingClientRect(),r=el.getBoundingClientRect();return {left:Math.abs(all.left-r.left),right:Math.abs(done.right-r.right)};});
 assert(geometry.left<2&&geometry.right<2,'Select all left and Done right');
 if(!mobile){await page.evaluate(()=>{goToTab('monthly');MONTHLY_VIEW='detail';renderMonth();});assert(await page.locator('#p-monthly .filter-pill-dd').first().isVisible());assert(!await page.locator('#p-monthly .filter-chips').first().isVisible());}
 // A retry must not reset the spinner's unresolved-episode clock.
 await page.evaluate(()=>{window.__pendingBase=_outboxPendingCount;_outboxPendingCount=()=>1;_syncing=true;_lastSyncError=null;_syncStatusStarted=Date.now()-20000;_refreshSideNavSync('pending');_refreshSideNavSync('saving');});
 assert(await page.locator('#mobile-sync-badge').evaluate(e=>e.classList.contains('waiting')&&getComputedStyle(e.querySelector('.rt-sync-mark')).animationName==='none'));
 await page.evaluate(()=>{_refreshSideNavSync('offline');_refreshSideNavSync('saving');});
 assert(await page.locator('#mobile-sync-badge').evaluate(e=>e.classList.contains('waiting')));
 await page.evaluate(()=>{_outboxPendingCount=()=>0;_syncing=false;_refreshSideNavSync('synced');});
 assert.equal(await page.evaluate(()=>_syncStatusStarted),0);
 await page.evaluate(()=>{_syncing=true;_refreshSideNavSync('saving');_syncStatusStarted=Date.now()-20000;window.dispatchEvent(new Event('pageshow'));});
 assert(await page.locator('#mobile-sync-badge').evaluate(e=>e.classList.contains('waiting')));
 await page.evaluate(()=>{_syncing=false;_outboxPendingCount=__pendingBase;_reconcileSyncStatus();});
 if(!mobile){
  const result=await page.evaluate(()=>{
   _accounts=Array.from({length:60},(_,n)=>({id:'speed-'+n,name:'Partner '+String(n).padStart(2,'0'),accountType:'supplier',arrangementModel:'fixed_cost',paymentTerms:'upfront',settlements:[]}));
   DB={'SEP-26':Array.from({length:600},(_,n)=>({id:'speed-item-'+n,item:'Stock '+n,accountId:'speed-'+(n%60),accountType:'supplier',state:'listed',costPrice:10,salePrice:30,dateSourced:'2026-09-01',dateListed:'2026-09-02',parts:[],returnHistory:[],salePlatform:'fb'})),trips:[],expenses:[]};
   goToTab('accounts');renderAccountsPage();let calls=0;const base=_accountStats;_accountStats=function(){calls++;return base.apply(this,arguments);};const times=[];
   for(const q of ['P','Pa','Part','Partner 3','Partner 39','']){const start=performance.now();_rtAcctOpSearch(q);times.push(performance.now()-start);}
   _accountStats=base;return {calls,maxMs:Math.max(...times),rows:document.querySelectorAll('.rt-acct-op-row').length};
  });
  assert.equal(result.calls,0);assert.equal(result.rows,60);assert(result.maxMs<250,'Prepared search remains responsive with 60 accounts and 600 items');console.log('Account search scale check',result);
 }
 assert.deepEqual(errors,[]);await context.close();console.log('PASS account directory performance, stable detail layout, filing boxes, shared controls and bounded sync retries',mobile?'mobile':'desktop');
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
