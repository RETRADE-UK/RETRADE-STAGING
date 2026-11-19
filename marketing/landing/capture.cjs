/* Refresh genuine product screens for the public tour in a disposable staging account. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {launch,enter,setupDemo}=require('./test-account.cjs');
const examples=require('./haul.json');
const dest=path.resolve(process.argv[2]||path.join(__dirname,'../../assets/landing'));
fs.mkdirSync(dest,{recursive:true});
async function stockExamples(page){
  return page.evaluate(async()=>{
    const {data}=await _sb.auth.getSession(),user=data.session.user;
    if(location.hostname!=='test.retrade-uk.com'||RT_ASSETS.environment!=='staging'||!user.is_anonymous||!user.user_metadata.staging_demo||user.id!==_currentUserId)throw Error('Developer test account required');
    const stock=[['Blue enamel casserole dish','Home & Garden',6,22],['Corduroy overshirt','Clothing & Fashion',4,18],['Mario Party Superstars cartridge','Video Games & Consoles',9,23],['Wooden railway starter set','Toys & Games',6,24],['Agatha Christie paperback bundle','Books',3,12]];
    const {data:old,error}=await _sb.from('items').select('gid').eq('user_id',user.id).like('gid','MARKET-%');if(error)throw Error(error.message);
    const now=new Date().toISOString().slice(0,10),month=_monthKeyFromDate(now);
    const rows=stock.map(([name,category,cost,price],i)=>{const gid='MARKET-'+(i+1);return {id:crypto.randomUUID(),user_id:user.id,gid,month,item:name,category,location:'Shelf A',source:'Weekend market',date_sourced:now,date_listed:now,cost_price:cost,sale_price:price,state:'listed',default_platform:i%2?'vinted':'ebay_biz'};}).filter(r=>!old.some(i=>i.gid===r.gid));
    if(rows.length){const r=await _sb.from('items').insert(rows);if(r.error)throw Error(r.error.message);}
    return rows.length;
  });
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function take(browser,phone,state,work){
  const {context,page}=await enter(browser,{storageState:state,isMobile:phone,hasTouch:phone,viewport:phone?{width:390,height:660}:{width:1220,height:760},deviceScaleFactor:phone?2.5:1.5});
  try{
    const haul=await setupDemo(page,examples),added=await stockExamples(page);
    if(haul.added||added){await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__rtFeaturesReady&&window.__rtLaunchSettled,null,{timeout:120000});}
    await page.evaluate(()=>{setThemePref('dark');goToTab('summary');setSummaryPeriod('30d');});
    async function snap(name,locator){
      await wait(950);
      await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark'&&getThemePref()==='dark');
      const img=path.join(work,name+(phone?'-phone':'')+'.png');
      await (locator||page).screenshot({path:img,animations:'disabled',timeout:15000});
      execFileSync('python3',['-c',"from PIL import Image;import sys;im=Image.open(sys.argv[1]);im.convert('RGB').save(sys.argv[2],quality=92,method=6)",img,path.join(dest,path.basename(img,'.png')+'.webp')]);
      console.log('Captured',name,phone?'mobile':'desktop');
    }
    await snap('dashboard');
    await page.evaluate(()=>{goToTab('stock');STOCK_STATE_FILTER='listed';STOCK_SEARCH='MARKET-';renderStock();});
    await page.waitForFunction(()=>window.__stockItems?.length===5);
    const stock=page.locator('#stock-list');
    await stock.waitFor();await stock.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
    await snap('stock');
    await page.evaluate(()=>openRunPage(_sourcingRuns.find(r=>r.name==='Sunday car boot finds').id));
    const run=page.locator('.run-detail-right');
    await run.waitFor();await run.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
    await snap('sourcing');
    await run.getByText(examples[2].item,{exact:true}).click();
    const pnl=page.locator('#p-item.on .ip-section-pnl').first();
    await pnl.waitFor();await pnl.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
    if(!(await pnl.innerText()).includes('£5.47'))throw Error('Expected the recorded game profit');
    await snap('sale',pnl);
    return await context.storageState();
  }finally{await context.close();}
}
(async()=>{const browser=await launch(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'retrade-screens-'));
try{const state=await take(browser,false,undefined,tmp);await take(browser,true,state,tmp);}
finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e.message);process.exitCode=1});
