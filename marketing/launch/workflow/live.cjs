const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const origin='https://test.retrade-uk.com';
async function launch() {
  const options={headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined};
  if(process.env.RETRADE_BROWSER_PROXY)options.proxy={server:process.env.RETRADE_BROWSER_PROXY};
  if(process.env.RETRADE_TRUSTED_CA_PIN)options.args=['--ignore-certificate-errors-spki-list='+process.env.RETRADE_TRUSTED_CA_PIN];
  return chromium.launch(options);
}
async function enter(browser, options={}) {
  const state=process.env.RETRADE_TEST_STATE;
  const context=await browser.newContext({viewport:{width:390,height:778},deviceScaleFactor:1.5,
    isMobile:true,hasTouch:true,colorScheme:'dark',locale:'en-GB',timezoneId:'Europe/London',serviceWorkers:'block',
    ...options,...(state&&fs.existsSync(state)?{storageState:state}:{})});
  const page=await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:90000});
  await Promise.race([page.locator('#p-summary.on:visible').waitFor(),page.locator('#staging-dev-btn:visible').waitFor()]);
  if(await page.locator('#staging-dev-btn:visible').count()) await page.locator('#staging-dev-btn').click();
  await page.waitForFunction(()=>window.__rtLaunchSettled&&window.__rtFeaturesReady&&document.querySelector('#p-summary.on')&&typeof _currentUserId!=='undefined'&&_currentUserId,null,{timeout:120000});
  const allowed=await page.evaluate(async()=>{
    const {data}=await _sb.auth.getSession();
    return location.origin==='https://test.retrade-uk.com'&&window.RT_ASSETS?.environment==='staging'&&data.session?.user.is_anonymous===true&&data.session.user.user_metadata?.staging_demo===true;
  });
  if(!allowed)throw Error('A disposable anonymous RETRADE staging account is required.');
  if(state){await context.storageState({path:state});fs.chmodSync(state,0o600);}
  return {page,context};
}
async function setupDemo(page, examples) {
  return await page.evaluate(async examples=>{
    if(location.origin!=='https://test.retrade-uk.com'||RT_ASSETS.environment!=='staging')throw Error('Wrong environment');
    const {data}=await _sb.auth.getSession(),owner=data.session.user;
    if(!owner.is_anonymous||!owner.user_metadata?.staging_demo||owner.id!==_currentUserId)throw Error('Wrong account');
    const runName='Sunday car boot finds';
    const result=await _sb.from('sourcing_runs').select('id').eq('user_id',owner.id).eq('name',runName).maybeSingle();
    if(result.error)throw Error(result.error.message);
    let runId=result.data?.id;
    const day=new Date(), midnight=new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate()));
    // A completed Sunday sourcing trip, with at least 10 days for the stock to sell.
    const offset=midnight.getUTCDay()+14;
    const date=delta=>new Date(+midnight+(delta-offset)*86400000).toISOString().slice(0,10);
    if(!runId){
      runId=crypto.randomUUID();
      const create=await _sb.from('sourcing_runs').insert({id:runId,user_id:owner.id,name:runName,location:'Community car boot',date_started:date(0)+'T08:30:00',date_ended:date(0)+'T10:30:00',started_at_iso:date(0)+'T08:30:00Z',ended_at_iso:date(0)+'T10:30:00Z',status:'ended',notes:'Sample haul for the RETRADE product tour.'});
      if(create.error)throw Error(create.error.message);
    }
    const existing=await _sb.from('items').select('item').eq('user_id',owner.id).eq('sourcing_run_id',runId);
    if(existing.error)throw Error(existing.error.message);
    const rows=[];
    examples.forEach((ex,ix)=>{
      if(existing.data.some(r=>r.item===ex.item))return;
      const item={id:crypto.randomUUID(),gid:'HAUL-'+String(ix+1).padStart(2,'0'),item:ex.item,category:ex.category,source:'Car boot',location:'Stock shelf',state:'sold',dateSourced:date(0),dateListed:date(1),dateSold:date(3+ix*2),salePrice:ex.price,costPrice:ex.cost,packagingCost:ex.pack,shippingCost:ex.ship,postage:0,listingFee:ex.platform==='ebay_biz'?0.36:0,defaultPlatform:ex.platform,salePlatform:ex.platform,soldOnPlatform:ex.platform,sourcingRunId:runId,parts:[],returnHistory:[],refreshHistory:[],_postageMode:'custom'};
      const month=_monthKeyFromDate(item.dateListed);
      const row=_itemToRow(item,month);
      // The shipped client tolerates legacy columns; this fixture only needs the ordinary sale fields.
      const fields=['id','gid','month','item','category','location','source','date_sourced','date_listed','date_sold','sale_price','postage','cost_price','shipping_cost','packaging_cost','listing_fee','postage_mode','state','user_id','default_platform','sold_on_platform','sourcing_run_id','sale_platform','is_returned'];
      rows.push(Object.fromEntries(fields.map(k=>[k,row[k]])));
    });
    if(rows.length){const created=await _sb.from('items').insert(rows);if(created.error)throw Error(created.error.message);}
    return {runId,added:rows.length};
  },examples);
}
module.exports={origin,launch,enter,setupDemo};
