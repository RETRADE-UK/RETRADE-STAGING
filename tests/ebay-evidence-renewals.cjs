/* Synthetic offline accounting regressions; no credentials or customer records. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),core=fs.readFileSync(path.join(root,'src/core/application.js'),'utf8');
function take(name){const m=new RegExp('^function '+name+'\\(', 'm').exec(core);assert(m,name);return core.slice(m.index,core.indexOf('\n}',m.index)+2);}
const noop=()=>{},c={console,Date,Math,JSON,Array,Object,Set,Map,Number,String,isFinite,setTimeout:noop,addEventListener:noop,document:{getElementById:()=>null},DB:{'OCT-26':[],trips:[],expenses:[],cashLedger:[]},_accounts:[],PLATFORMS:{ebay:{},ebay_biz:{},vinted:{pattern:'seller_receives'},fb:{pattern:'seller_receives'}},EBAY_BIZ_FVF:{Other:.129},DEFAULT_PLATFORM:'ebay_biz',allDBKeys:()=>['OCT-26'],saveDB:noop,_itemPlatform:i=>i.defaultPlatform||'ebay_biz',_s1Platform:i=>i.salePlatform||i.defaultPlatform||'ebay_biz',_listingFeeFor:p=>p==='ebay_biz'?.36:0,toast:noop,_currentUserId:'synthetic'};c.window=c;vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(root,'src/domain/accounting-engine.js'),'utf8'),c);vm.runInContext(take('_rowToItem'),c);c._cashLedger=()=>[];
vm.runInContext(fs.readFileSync(path.join(root,'src/features/cashflow/liabilities.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(root,'src/domain/relist-fees.js'),'utf8'),c);
const item=(extra={})=>({id:'i',item:'Synthetic',dateListed:'2026-10-31',state:'listed',salePrice:100,postage:0,costPrice:0,listingFee:.36,defaultPlatform:'ebay_biz',refreshHistory:[],returnHistory:[],...extra});
assert.equal(c._ebayRenewalDate('2026-10-31',1),'2026-11-30');assert.equal(c._ebayRenewalDate('2026-10-31',2),'2026-12-31');assert.equal(c._ebayRenewalDate('2027-01-31',1),'2027-02-28');assert.equal(c._ebayRenewalDate('2028-01-31',1),'2028-02-29');
let i=item();c.DB['OCT-26']=[i];assert.equal(c._accrueEbayRenewals(i,'2027-01-31'),3);assert.equal(i.listingFee,1.44);assert.equal(c._accrueEbayRenewals(i,'2027-01-31'),0);
i=item({dateSold:'2026-11-30',state:'sold'});assert.equal(c._accrueEbayRenewals(i,'2027-01-31'),0,'Same-day time unknown');
for(const extra of [{defaultPlatform:'vinted'},{defaultPlatform:'ebay'},{state:'sourced'},{state:'unlisted'},{state:'sold'},{isReturned:true},{scrappedAt:'2026-11-01'}])assert.equal(c._accrueEbayRenewals(item(extra),'2027-01-31'),0);
i=item({refreshHistory:[{type:'relist',date:'2026-11-10',_listingFee:.36}]});assert.equal(c._accrueEbayRenewals(i,'2026-12-10'),1);assert.equal(i.refreshHistory.at(-1).date,'2026-12-10');
i=item({refreshHistory:[{type:'renewal_policy',fee:0}]});c._accrueEbayRenewals(i,'2026-12-31');assert.equal(i.listingFee,.36);
const evidence={type:'verified_sale_fees',saleNo:1,orderId:'synthetic-order',price:100,postage:0,platform:'ebay',platformFee:0,promoFee:5,promoPercent:.05,priceBasis:'seller_receipt',refunds:[{returnId:1,refundAmount:100,platformCredit:0,promoCredit:5}]};
i=item({salePlatform:'ebay',defaultPlatform:'ebay',refreshHistory:[evidence],returnHistory:[{id:1,saleNo:1,type:'full_seller',refundAmount:100,_salePriceAtReturn:100,_postageAtReturn:0,_platformAtReturn:'ebay',_promoPercentAtReturn:.05}]});
assert.equal(c.calcPlatformBPF(i,100,0,'ebay',1),0);assert.equal(c._salePromoFee(i,1,'ebay',100,0,.05),5);assert.equal(c._netPromoFeeAfterRefunds(i,1,'ebay',100,0,.05),0);assert.equal(c._privateEbayBuyerFeeRefund(i,1,100,0),0);assert.equal(c._returnEventImpact(i,i.returnHistory[0]).profit,-95);
assert.equal(c._verifiedSaleFees(i,1,101,0,'ebay'),null);assert.equal(c._verifiedSaleFees(i,2,100,0,'ebay'),null);assert.notEqual(c._salePromoFee(i,1,'ebay',100,0,.02),5);
for(const h of [[evidence],JSON.stringify([evidence])])assert.equal(c._rowToItem({id:'i',refresh_history:h}).refreshHistory[0].orderId,'synthetic-order');
assert.equal(c._rowToItem({refresh_history:'invalid'}).refreshHistory.length,0);
const listingRows=()=>c._cashEventsAll().filter(e=>e.type==='listing_fee').map(e=>[e.date,e.amount,e.direction]);
i=item({dateListed:'2026-10-01',listingFee:.72,refreshHistory:[{type:'relist',date:'2026-10-15',_listingFee:.36,_saleNo:1,_platform:'ebay_biz'}]});c.DB['OCT-26']=[i];
assert.equal(JSON.stringify(listingRows()),JSON.stringify([['2026-10-01',.36,'out'],['2026-10-15',.36,'out']]));
i=item();c.DB['OCT-26']=[i];c._accrueEbayRenewals(i,'2026-11-30');
assert.equal(JSON.stringify(listingRows()),JSON.stringify([['2026-10-31',.36,'out'],['2026-11-30',.36,'out']]));
const returned={id:1,saleNo:1,type:'full_seller',loggedAt:'2026-10-10',_dateSoldAtReturn:'2026-10-02',_relistedAt:'2026-10-31',_platformAtRelist:'ebay_biz',_listingFeeAtRelist:.36};
i=item({dateListed:'2026-10-01',dateSold:'2026-10-02',resaleDateSold:'2026-12-20',resaleSalePrice:100,resaleListingFee:.36,state:'sold',returnHistory:[{...returned}]});c.DB['OCT-26']=[i];c._accrueEbayRenewals(i,'2026-11-30');
assert.equal(c._saleCycleSnapshot(i,2).listingFee,.72);assert.equal(listingRows().reduce((v,e)=>v+e[1],0),1.08);
i=item({dateListed:'2026-10-01',dateSold:'2026-10-02',resaleListingFee:.36,state:'listed',returnHistory:[{...returned}]});c.DB['OCT-26']=[i];assert.equal(c._accrueEbayRenewals(i,'2026-11-30'),1);
i=item({dateListed:'2026-10-01',dateSold:'2026-10-02',resaleDateSold:'2026-12-20',resaleSalePrice:100,resaleListingFee:.36,state:'sold',returnHistory:[{...returned,_listingFeeAtRelist:null}]});c.DB['OCT-26']=[i];c._accrueEbayRenewals(i,'2026-11-30');assert.equal(listingRows().reduce((v,e)=>v+e[1],0),1.08);
const peers=Array.from({length:5},(_,n)=>item({id:'shared'+n,refreshHistory:[{type:'bundle_listing_fee',basis:'shared',bundleId:'synthetic',saleNo:1,totalFee:.36}]}));c.DB['OCT-26']=peers;peers.forEach(x=>c._accrueEbayRenewals(x,'2026-11-30'));assert.equal(Math.round(peers.reduce((v,x)=>v+x.refreshHistory.at(-1)._listingFee,0)*100),36);
i=item({dateListed:'2026-10-01',listingFee:.72,refreshHistory:[{type:'verified_listing_fees',saleNo:1,through:'2026-10-10',entries:[{date:'2026-10-01',amount:.36,sourceRow:1}]},{type:'relist',date:'2026-10-15',_listingFee:.36,_saleNo:1,_platform:'ebay_biz'}]});c.DB['OCT-26']=[i];assert.equal(JSON.stringify(listingRows()),JSON.stringify([['2026-10-01',.36,'out'],['2026-10-15',.36,'out']]));
for(const key of ['resaleShippingCost','resalePromoPercent','resalePackagingCost','resalePostage']){assert.equal(c._rowToItem({resale_shipping_cost:0,resale_promo_percent:0,resale_packaging_cost:0,resale_postage:0})[key],0,'Explicit resale zero survives reload: '+key);assert.equal(c._rowToItem({})[key],null,'Unknown resale cost remains unknown: '+key);}
console.log('PASS evidence, refunds, JSON history, renewals, shared pennies, resale and dated cash');
