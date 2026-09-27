/* Scroll/disclosure audit: synthetic data, no production network or writes. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');
async function disclosure(page,selector){
 const header=page.locator(selector).first();
 if(!await header.isVisible())return 0;
 await header.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
 await page.waitForTimeout(80);
 const before=await header.evaluate(e=>{window.__scrollAuditHeader=e;return {y:scrollY,top:e.getBoundingClientRect().top,state:[e.getAttribute('aria-expanded'),e.parentElement.className,e.parentElement.open]};});
 // Tap the measured point, without Playwright's implicit scroll-into-view.
 // The browser must not helpfully reposition a disclosure before our audit.
 const box=await header.boundingBox();
 assert(await header.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit);}),selector+' is reachable at its visible position');
 if(page.viewportSize().width<700)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
 else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await page.waitForTimeout(400);
 const after=await page.evaluate(()=>({same:!!window.__scrollAuditHeader?.isConnected,y:scrollY,max:Math.max(0,document.documentElement.scrollHeight-innerHeight)}));
 assert(after.same,selector+' must not replace its own page');
 assert.notDeepEqual(await header.evaluate(e=>[e.getAttribute('aria-expanded'),e.parentElement.className,e.parentElement.open]),before.state,selector+' actually toggles');
 assert(Math.abs(after.y-Math.min(before.y,after.max))<=8,selector+' scroll moved: '+JSON.stringify({before,after}));
 return 1;
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{for(const options of [{mobile:true},{mobile:false},{mobile:true,reduced:true}]){
 const {page,context,errors}=await open(browser,{signedIn:true,...options});await settled(page);
 await page.evaluate(()=>{
   saveDB=()=>{};DB={trips:[],expenses:[]};_accounts=[{id:'scroll-partner',name:'Scroll fixture',accountType:'supplier',arrangementModel:'fixed_cost',paymentTerms:'on_sale',settlements:[]}];
   const now=new Date();
   for(let m=0;m<36;m++){
     const d=new Date(now.getFullYear(),now.getMonth()-m,12),key=MONTHS[d.getMonth()]+'-'+String(d.getFullYear()).slice(-2),date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-12';
     DB[key]=Array.from({length:3},(_,n)=>({id:'scroll-'+m+'-'+n,item:'Scroll item '+m+' '+n,accountId:'scroll-partner',accountType:'supplier',costPrice:20,salePrice:80,state:n===2?'listed':'sold',dateSourced:date,dateListed:date,dateSold:n===2?null:date,salePlatform:'fb',parts:[],returnHistory:[]}));
     DB.expenses.push({id:'scroll-expense-'+m,date,amount:5,description:'Scroll fixture expense',category:'Other'});
   }
   goToTab('monthly');
 });
 await page.waitForFunction(()=>!document.querySelector('.page.on').hasAttribute('aria-busy'));
 await page.evaluate(()=>backToMonthlyGrid(false));
 await page.waitForSelector('.fy-section');await page.waitForTimeout(400);
 const label=await page.locator('.rt-sales-current-month1530').evaluate(e=>({text:e.innerText,pseudo:getComputedStyle(e.querySelector('.mname'),'::after').content}));
 assert.equal((label.text.match(/now/ig)||[]).length,0);assert(!/now/i.test(label.pseudo),'Current month uses its outline, not a NOW label');
 assert.equal(await page.locator('.rt-sales-current-month1530').getAttribute('aria-current'),'date');
 await page.evaluate(()=>{window.__scrollAuditChart=document.getElementById('monthly-profitability-svg');});
 let checked=0;
 const years=await page.locator('.fy-section').evaluateAll(es=>es.map(e=>e.dataset.fySection));
 for(const year of years)for(let n=0;n<3;n++)checked+=await disclosure(page,'[data-fy-section="'+year+'"] > [role=button]');
 assert(await page.evaluate(()=>window.__scrollAuditChart===document.getElementById('monthly-profitability-svg')),'Year disclosures keep chart mounted');
 // Ordinary native disclosures throughout reporting, settings, cash and items.
 for(const route of ['tax','tax:filing','tax:monthly','cash','data','expenses','runs','summary','returns','scrapped','activity']){
   await page.evaluate(t=>{if(t.includes(':'))setTaxWorkspaceView(t.split(':')[1]);else goToTab(t);},route);await page.waitForTimeout(250);
   const count=await page.locator('.page.on details > summary').count();
   for(let i=0;i<count;i++){
     // Stable unique audit hook also covers nested details with unlike siblings.
     const id='scroll-summary-'+route.replace(':','-')+'-'+i;
     await page.locator('.page.on details > summary').nth(i).evaluate((e,id)=>e.id=id,id);
     for(let n=0;n<2;n++)checked+=await disclosure(page,'#'+id);
   }
   const expenseGroups=await page.locator('.page.on .exp-month-header').count();
   for(let i=0;i<Math.min(expenseGroups,4);i++){
     const id='scroll-expense-'+i;await page.locator('.page.on .exp-month-header').nth(i).evaluate((e,id)=>e.id=id,id);
     for(let n=0;n<2;n++)checked+=await disclosure(page,'#'+id);
   }
 }
 await page.evaluate(()=>{STOCK_STATE_FILTER='listed';STOCK_FILTER='all';STOCK_SEARCH='';STOCK_GROUPED=true;goToTab('stock');});await page.waitForTimeout(250);
 const groups=await page.locator('.stock-group-header').count();
 assert(groups>0,'Stock fixture exposes grouped disclosures');
 for(let i=0;i<Math.min(groups,4);i++){
   const id='scroll-stock-'+i;await page.locator('.stock-group-header').nth(i).evaluate((e,id)=>e.id=id,id);
   for(let n=0;n<2;n++)checked+=await disclosure(page,'#'+id);
 }
 await page.evaluate(()=>openAccountPage('scroll-partner'));await page.waitForTimeout(250);
 const accountGroups=await page.locator('#p-item .account-group-head').count();
 assert(accountGroups>0,'Partner fixture exposes grouped disclosures');
 for(let i=0;i<accountGroups;i++){
   const id='scroll-account-'+i;await page.locator('#p-item .account-group-head').nth(i).evaluate((e,id)=>e.id=id,id);
   for(let n=0;n<2;n++)checked+=await disclosure(page,'#'+id);
 }
 for(let n=0;n<2;n++)checked+=await disclosure(page,'.rt-payalloc2-head');
 await page.evaluate(()=>{const key=Object.keys(DB).find(k=>/^[A-Z]{3}-\d{2}$/.test(k)&&DB[k]?.length);openAccountItemPage(key,DB[key][0].id,'scroll-partner');});await page.waitForTimeout(250);
 const itemDetails=await page.locator('#p-item details > summary').count();
 assert(itemDetails>0,'Item fixture exposes native disclosures');
 for(let i=0;i<itemDetails;i++){
   const id='scroll-item-'+i;await page.locator('#p-item details > summary').nth(i).evaluate((e,id)=>e.id=id,id);
   for(let n=0;n<2;n++)checked+=await disclosure(page,'#'+id);
 }
 assert(checked>20,'Audit must exercise real disclosures');assert.deepEqual(errors,[]);
 console.log('PASS disclosure scroll audit',options,checked+' toggles');await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
