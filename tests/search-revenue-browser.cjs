/* Search revenue: synthetic sales, return/re-sale, bundle allocations and live refresh.
 * The startup harness isolates network, authentication and personal data. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {open,settled}=require('./startup-browser.cjs');

(async()=>{
 const browser=await chromium.launch({
  headless:true,
  ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),
  args:['--no-sandbox','--disable-dev-shm-usage']
 });
 try{
  for(const width of [320,390,1440]){
   const {page,context,errors}=await open(browser,{signedIn:true,mobile:width<600});
   await settled(page);
   await page.setViewportSize({width,height:900});
   const result=await page.evaluate(()=>{
    const mk=(id,item,salePrice,extra={})=>Object.assign({
     id,gid:'R-TEST-'+id,item,category:'Other',
     dateSourced:'2026-10-01',dateListed:'2026-10-02',dateSold:'2026-10-10',
     salePrice,costPrice:0,state:'sold',isReturned:false,
     salePlatform:'fb',defaultPlatform:'fb',soldOnPlatform:'fb',
     postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,
     parts:[],returnHistory:[]
    },extra);
    DB={'OCT-26':[
     mk('a','Camera First',100),
     mk('b','Camera Second',75),
     mk('listed','Camera Asking Only',999,{dateSold:null,state:'listed'}),
     mk('returned','Camera Fully Returned',500,{isReturned:true,state:'returned'}),
     mk('resold','Camera Returned and Resold',25,{
      dateSold:null,resaleSalePrice:50,resaleDateSold:'2026-10-20',resalePlatform:'fb',
      returnHistory:[{
       type:'full_seller',saleNo:1,loggedAt:'2026-10-11',refundAmount:25,
       _salePriceAtReturn:25,_dateSoldAtReturn:'2026-10-10',
       _platformAtReturn:'fb',_relistedAt:'2026-10-12'
      }]
     }),
     mk('bundle1','Camera Bundle Part A',12.5,{bundleId:'batch',bundleRef:'B-1',bundleTotal:40}),
     mk('bundle2','Camera Bundle Part B',27.5,{bundleId:'batch',bundleRef:'B-1',bundleTotal:40}),
     mk('lens','Lens Unsold',200,{dateSold:null,state:'listed'}),
     mk('other','Laptop Sold',800)
    ],trips:[],expenses:[]};
    _accounts=[];_jobLots=[];_jobLotItems=[];
    openSearchPage('camera');
    const read=()=>({
     summary:document.querySelector('[data-testid="search-results-summary"]')?.textContent.replace(/\s+/g,' ').trim(),
     revenue:document.querySelector('[data-testid="search-total-revenue"]')?.textContent,
     overflow:document.documentElement.scrollWidth>innerWidth+1
    });
    const initial=read();
    renderSearchResults('lens');
    const unsold=read();
    DB['OCT-26'].find(i=>i.id==='listed').dateSold='2026-10-22';
    renderSearchResults('camera');
    const updated=read();
    return {initial,unsold,updated};
   });
   assert.equal(result.initial.revenue,'£265.00','Revenue is actual sold allocations, not listing prices or returned receipts');
   assert.match(result.initial.summary,/7 items matching.*5 sold/);
   assert.match(result.initial.summary,/Total revenue: £265\.00/);
   assert.match(result.initial.summary,/Total profit:/);
   assert.equal(result.unsold.revenue,undefined,'Unsold-only query has no booked revenue');
   assert.equal(result.updated.revenue,'£1,264.00','Re-query reflects a newly recorded sale');
   assert.match(result.updated.summary,/6 sold/);
   assert.equal(result.initial.overflow,false,'Search summary must fit '+width+'px viewport');
   assert.equal(result.updated.overflow,false,'Updated summary must fit '+width+'px viewport');
   assert.deepEqual(errors,[],'No browser errors');
   console.log('PASS search revenue, sales/resales/bundles, '+width+'px');
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
