/* Real cost forms and durable outbox; synthetic records, all external traffic blocked. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
(async()=>{
  const safari=process.argv.includes('--webkit');
  const browser=await (safari?webkit:chromium).launch({headless:true,...(!safari&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try{
    for(const mobile of [false,true]){
      const {page,context,errors}=await open(browser,{signedIn:true,mobile});await settled(page);
      await page.evaluate(()=>{
        window.dispatchEvent(new Event('retrade:data-ready'));
        _sourcingRuns=[{id:'old-run',name:'Original run',dateStarted:'2026-04-19',status:'ended'},
          {id:'active-run',name:'Current run',dateStarted:'2026-11-01',status:'active'}];
        _activeSourcingRun=_sourcingRuns[1];
        DB.trips=[{id:'original-trip',date:'2026-04-19',description:'Market trip',mileage:20,ratePerMile:.45,
          expenses:[{desc:'Parking',amount:4,date:'2026-04-19',audit:{source:'original'}}],sourcingRunId:'old-run',_cloudRevision:4}];
        DB.expenses=[{id:'original-exp',date:'2026-04-19',description:'Postage bags',amount:12,category:'Office costs',sourcingRunId:'old-run',_cloudRevision:3}];
        window.__original=JSON.stringify({trip:DB.trips[0],exp:DB.expenses[0]});
        window.__writes=0;saveDB=()=>{__writes++;const preview=_previewMode;_previewMode=false;_stageDurableOutboxNow();_previewMode=preview;};
        window.__baseline=()=>{_dbSnapshot=_dbFingerprint();_outboxSave({});};__baseline();
        COST_PERIOD='all';COST_CAT_FILTER='all';goToTab('expenses');
      });
      const button=label=>page.locator('#panel-content').getByRole('button',{name:label,exact:true});
      const unchanged=async()=>assert(await page.evaluate(()=>__original===JSON.stringify({trip:DB.trips.find(t=>t.id==='original-trip'),exp:DB.expenses.find(e=>e.id==='original-exp')})),'Source records remain byte-for-byte unchanged');
      await page.evaluate(()=>duplicateTrip(0));
      assert.equal(await page.locator('#panel-title').innerText(),'Duplicate Trip');
      assert.equal(await page.locator('#trip-run-id').inputValue(),'');
      assert.equal(await page.locator('#trip-date').inputValue(),await page.evaluate(()=>new Date().toISOString().slice(0,10)));
      assert(!await page.locator('#trip-date').evaluate(e=>e.readOnly));
      assert.equal(await page.evaluate(()=>__writes),0,'Opening a duplicate must not save');
      await page.locator('#trip-desc').fill('Cancelled copy');await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>DB.trips.length),1,'Cancel creates no record');await unchanged();

      await page.evaluate(()=>duplicateTrip(0));
      await page.locator('#trip-date').fill('2026-11-12');
      await page.locator('#trip-miles').fill('30');
      await page.locator('.trip-extra-amt').fill('7');
      await button('Duplicate Trip').click();
      const trip=await page.evaluate(()=>DB.trips.find(t=>t.id!=='original-trip'));
      assert(trip.id&&trip.id!=='original-trip');
      assert.equal(trip.description,'Market trip - 2');assert.equal(trip.mileage,30);
      assert.equal(trip.date,'2026-11-12');assert.equal(trip.sourcingRunId,null);
      assert.deepEqual(trip.expenses,[{desc:'Parking',amount:7}]);assert.equal(trip._cloudRevision,undefined);
      assert.deepEqual(await page.evaluate(()=>Object.keys(_outboxRead())),['trip:'+trip.id],'Only the new trip is queued');await unchanged();
      await page.evaluate(()=>saveTrip());assert.equal(await page.evaluate(()=>DB.trips.length),2,'Closed form cannot submit twice');

      await page.evaluate(id=>{__baseline();editTrip(DB.trips.findIndex(t=>t.id===id));DB.trips=JSON.parse(JSON.stringify(DB.trips)).reverse();},trip.id);
      await page.locator('#trip-miles').fill('35');await button('Update Trip').click();
      assert.equal(await page.evaluate(id=>DB.trips.find(t=>t.id===id).mileage,trip.id),35);
      assert.deepEqual(await page.evaluate(()=>Object.keys(_outboxRead())),['trip:'+trip.id],'Edit follows stable ID through refreshed/reordered records');await unchanged();

      await page.evaluate(()=>{__baseline();duplicateExpense(0);});
      assert.equal(await page.locator('#panel-title').innerText(),'Duplicate Expense');
      assert.equal(await page.locator('#exp-run-id').inputValue(),'');
      await page.locator('#exp-amt').fill('18');await page.locator('#exp-date').fill('2026-11-12');
      await button('Duplicate Expense').click();
      const expense=await page.evaluate(()=>DB.expenses.find(e=>e.id!=='original-exp'));
      assert(expense.id&&expense.id!=='original-exp');assert.equal(expense.amount,18);
      assert.equal(expense.date,'2026-11-12');assert.equal(expense.sourcingRunId,null);assert.equal(expense._cloudRevision,undefined);
      assert.deepEqual(await page.evaluate(()=>Object.keys(_outboxRead())),['exp:'+expense.id]);await unchanged();
      await page.evaluate(id=>{__baseline();editExpense(DB.expenses.findIndex(e=>e.id===id));DB.expenses=JSON.parse(JSON.stringify(DB.expenses)).reverse();},expense.id);
      await page.locator('#exp-amt').fill('22');await button('Update Expense').click();
      assert.equal(await page.evaluate(id=>DB.expenses.find(e=>e.id===id).amount,expense.id),22);
      assert.deepEqual(await page.evaluate(()=>Object.keys(_outboxRead())),['exp:'+expense.id]);await unchanged();

      // Both editor types refuse stale/deleted records or a changed user.
      for(const kind of ['trip','exp']){
        for(const change of ['edit','delete','owner']){
          const result=await page.evaluate(({kind,change})=>{
            const key=kind==='trip'?'trips':'expenses';
            const saved=JSON.parse(JSON.stringify(DB[key]));
            (kind==='trip'?editTrip:editExpense)(0);
            if(change==='edit')DB[key][0].description='Changed remotely';
            if(change==='delete')DB[key].splice(0,1);
            if(change==='owner')_currentUserId='different-user';
            const before=JSON.stringify(DB[key]),writes=__writes;
            (kind==='trip'?saveTripEdit:saveExpenseEdit)();
            const result={unchanged:JSON.stringify(DB[key])===before,writes:__writes-writes};
            _currentUserId='ui-test';DB[key]=saved;closePanel();return result;
          },{kind,change});
          assert.deepEqual(result,{unchanged:true,writes:0},kind+' rejects '+change);
        }
      }
      // Explicit run selection still opts in to canonical run dates; None stays None.
      await page.evaluate(()=>duplicateTrip(DB.trips.findIndex(t=>t.id==='original-trip')));
      await page.locator('#trip-run-id').selectOption('active-run');
      assert.equal(await page.locator('#trip-date').inputValue(),'2026-11-01');
      await page.locator('#trip-run-id').selectOption('');
      assert(!await page.locator('#trip-date').evaluate(e=>e.readOnly));
      await page.locator('#trip-date').fill('2026-11-13');await button('Duplicate Trip').click();
      assert.equal(await page.evaluate(()=>DB.trips.at(-1).sourcingRunId),null);
      await unchanged();

      // Extras-only trips remain editable, zero rates are preserved, validation creates nothing.
      await page.evaluate(()=>{DB.trips.push({id:'extras-only',date:'2026-11-12',description:'Entry',mileage:0,ratePerMile:0,expenses:[{desc:'Entry',amount:5}],sourcingRunId:null});duplicateTrip(DB.trips.length-1);});
      assert.equal(await page.locator('#trip-rate').inputValue(),'0');
      await page.locator('.trip-extra-amt').fill('0');
      const count=await page.evaluate(()=>DB.trips.length);await button('Duplicate Trip').click();
      assert.equal(await page.evaluate(()=>DB.trips.length),count,'Invalid duplicate creates nothing');
      await page.locator('.trip-extra-amt').fill('6');await button('Duplicate Trip').click();
      await page.evaluate(()=>editTrip(DB.trips.length-1));
      await page.locator('.trip-extra-amt').fill('8');await button('Update Trip').click();
      assert.deepEqual(await page.evaluate(()=>({mileage:DB.trips.at(-1).mileage,rate:DB.trips.at(-1).ratePerMile,amount:DB.trips.at(-1).expenses[0].amount})),{mileage:0,rate:0,amount:8});

      await page.evaluate(()=>duplicateExpense(DB.expenses.findIndex(e=>e.id==='original-exp')));
      for(const width of mobile?[320,390]:[1440]){
        await page.setViewportSize({width,height:960});
        assert(await button('Duplicate Expense').isVisible());
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Form fits '+width);
      }
      const beforeCancel=await page.evaluate(()=>({writes:__writes,count:DB.expenses.length}));
      await page.keyboard.press('Escape');
      assert.deepEqual(await page.evaluate(()=>({writes:__writes,count:DB.expenses.length})),beforeCancel);
      await unchanged();assert.deepEqual(errors,[]);await context.close();
      console.log('PASS independent trip/expense drafts, cancel, extras, dates, stable-ID edits, outbox and conflict guards',safari?'WebKit':'Chromium',mobile?'mobile':'desktop');
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
