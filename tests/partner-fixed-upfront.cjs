/* Real arrangement/payment owners with synthetic records and in-memory I/O.
 * Never loads credentials, contacts a database or changes a real payment. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),core=fs.readFileSync(path.join(root,'src/core/application.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/domain/accounting-engine.js'),'utf8');
function take(name){const m=new RegExp('^function '+name+'\\(', 'm').exec(core);assert(m,name);const end=core.indexOf('\n}',m.index)+2;return core.slice(m.index,end);}
function fixture(){
 const els=new Map(),messages=[];
 const element=()=>({classList:{add(){},remove(){},contains(){return false;}},addEventListener(){},remove(){},querySelector(){return element();},appendChild(){},setAttribute(){}});
 const c={console:{info(){},warn(){},error(){}},Date,Math,JSON,Object,Array,Map,Set,Number,String,Promise,isFinite,
  document:{getElementById:id=>els.get(id)||null,querySelector(){return null;},querySelectorAll(){return [];},createElement:element,head:element(),body:element(),documentElement:element()},
  setTimeout(){},MutationObserver:class{observe(){}},requestAnimationFrame(){},_accounts:[],DB:{},_acctSelected:new Set(),_acctSelectMode:false,
  allDBKeys(){return Object.keys(c.DB).filter(k=>Array.isArray(c.DB[k])&&!['trips','expenses'].includes(k));},
  saveDB:async()=>{c.saves++;},saves:0,fmt:n=>'£'+Number(n).toFixed(2),toast:m=>messages.push(m),closePanel(){},_renderAccountPage(){},_acctCurrentAcct(){return c._accounts[0];},
  calcGrossProfit:i=>i.salePrice-i.costPrice,_findPaidSettlementForItem(){return null;},
  _itemToRow:i=>({account_paid_amount:i.accountPaidAmount,account_split_percent:i.accountSplitPercent}),
  _rowToItem:r=>({accountId:'p',state:r.state||'sourced',costPrice:r.cost_price||0,accountPaidAmount:r.account_paid_amount,accountSplitPercent:r.account_split_percent})};
 c.window=c;vm.createContext(c);
 for(const name of ['_legacyFixedZeroConflict','_fixedAccountAmount','_itemAcquisitionCost','_setItemFixedCost','_itemAccountType','_accountItemIsSold','_accountItemOwed','_accountItemDebt','_accountPaysOnSale','_acctBulkSplitConfirm','_acctBulkSetCostConfirm','submitItemSplit','clearItemSplit'])vm.runInContext(take(name),c);
 for(const file of ['arrangements-v2.js','payment-allocations-v2.js'])vm.runInContext(fs.readFileSync(path.join(root,'src/features/partners',file),'utf8'),c);
 c._accounts=[{id:'p',name:'Synthetic partner',accountType:'consignment',arrangementModel:'profit_share',defaultSplitPercent:50,settlements:[]}];
 c.DB={'OCT-26':[],trips:[],expenses:[]};
 const stock=(id,extra={})=>Object.assign({id,item:'Synthetic '+id,accountId:'p',accountType:'consignment',state:'sourced',costPrice:0,salePrice:40,accountSettled:false,accountPaidAmount:null,accountSplitPercent:null,partnerAgreedAmount:null,arrangementModelOverride:null,parts:[],returnHistory:[],dateSold:null},extra);
 const set=(id,value)=>els.set(id,{value,disabled:false,textContent:'',checked:false,addEventListener(){}});
 set('payalloc-date','2026-10-15');set('payalloc-note','Synthetic test');set('payalloc-create-btn','');
 return {c,stock,set,messages,rows:()=>c.__rtPartnerPaymentCandidates('p')};
}
const plain=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 let f=fixture(),{c,stock,rows}=f;
 const legacy=stock('legacy',{accountPaidAmount:3.25});c.DB['OCT-26']=[legacy];
 const before=JSON.stringify(c.DB);assert.equal(c._rtArrangementForItem(legacy),'fixed_cost');assert.equal(c._rtPartnerAgreedAmount(legacy),3.25);assert.equal(rows()[0].remaining,3.25);assert.equal(JSON.stringify(c.DB),before,'Rendering must not migrate records');
 for(const v of [null,undefined,'']){const i=stock('supplier',{accountType:'supplier',costPrice:4.5,partnerAgreedAmount:v});assert.equal(c._rtPartnerAgreedAmount(i),4.5,'Missing canonical amount must not become zero');}
 assert.equal(c._rtPartnerAgreedAmount(stock('zero',{arrangementModelOverride:'fixed_cost',partnerAgreedAmount:0,accountPaidAmount:99})),0,'Explicit zero is not missing');
 assert.equal(c._rtPartnerAgreedAmount(stock('legacy-zero',{accountPaidAmount:0,costPrice:99})),0,'Explicit legacy zero is not a missing amount');
 assert.equal(c._accountItemOwed(legacy),null,'An unpaid advance agreement must not invent realised profit');
 for(const extra of [{state:'sold',dateSold:'2026-10-01'},{accountSettled:true},{isReturned:true},{returnHistory:[{type:'full_seller'}]},{scrappedAt:'2026-10-02'},{arrangementModelOverride:'profit_share'},{accountSplitPercent:50}])assert.equal(c._rtArrangementForItem(stock('historical',{accountPaidAmount:8,...extra})),'profit_share','Paid or explicit share evidence must not become a new fixed agreement');
 const mapped=c._itemToRow(legacy,'OCT-26');assert.equal(mapped.partner_agreed_amount,3.25);assert.equal(mapped.arrangement_model_override,'fixed_cost');assert.equal(c._rtPartnerAgreedAmount(c._rowToItem(mapped)),3.25,'Agreement survives reload');
 // The actual legacy forms plus arrangement adapters save both fields together.
 f.set('bulk-split-pct','');f.set('bulk-split-paid','6.25');c._acctSelected=new Set(['legacy']);c._acctBulkSplitConfirm();assert.deepEqual([legacy.accountPaidAmount,legacy.partnerAgreedAmount,legacy.arrangementModelOverride],[6.25,6.25,'fixed_cost']);
 f.set('bulk-split-pct','40');f.set('bulk-split-paid','');c._acctSelected=new Set(['legacy']);c._acctBulkSplitConfirm();assert.deepEqual([legacy.accountPaidAmount,legacy.partnerAgreedAmount,legacy.arrangementModelOverride,legacy.accountSplitPercent],[null,null,'profit_share',40]);assert.equal(rows().length,0);
 f.set('split-pct','');f.set('split-paid','7.75');f.set('item-type-override','');c.submitItemSplit('OCT-26','legacy');assert.deepEqual([legacy.partnerAgreedAmount,legacy.arrangementModelOverride],[7.75,'fixed_cost']);assert.equal(rows()[0].remaining,7.75);
 c.clearItemSplit('OCT-26','legacy');assert.equal(legacy.partnerAgreedAmount,null);assert.equal(legacy.arrangementModelOverride,null);
 f.set('bulk-cost-input','9.50');c._acctSelected=new Set(['legacy']);c._acctBulkSetCostConfirm();assert.deepEqual([legacy.costPrice,legacy.partnerAgreedAmount,legacy.arrangementModelOverride],[9.5,9.5,'fixed_cost']);
 const unchanged=JSON.stringify(legacy);f.set('bulk-split-paid','invalid');c._acctSelected=new Set(['legacy']);c._acctBulkSplitConfirm();assert.equal(JSON.stringify(legacy),unchanged,'Invalid terms never mutate data');
 // Nine unpaid fixed costs across legacy/canonical formats become one payment.
 f=fixture();({c,stock,rows}=f);
 c.DB['OCT-26']=[...Array.from({length:7},(_,n)=>stock('legacy-'+n,{accountPaidAmount:3.25})),...Array.from({length:2},(_,n)=>stock('canonical-'+n,{accountType:'supplier',costPrice:4.5,partnerAgreedAmount:4.5,arrangementModelOverride:'fixed_cost',state:'listed'})),stock('percentage',{accountSplitPercent:50}),stock('zero',{partnerAgreedAmount:0,arrangementModelOverride:'fixed_cost'}),stock('disposed',{accountPaidAmount:3.25,scrappedAt:'2026-10-01'}),stock('returned',{accountPaidAmount:3.25,isReturned:true})];
 assert.equal(rows().length,9);assert.equal(+rows().reduce((s,r)=>s+r.remaining,0).toFixed(2),31.75);
 const ids=rows().map(r=>r.item.id);c._acctSelected=new Set(ids);c._acctSelectMode=true;c.__rtPartnerOpenPayment('p',ids);await c._rtPayAllocCreate();
 assert.equal(c._accounts[0].settlements.length,1);const tx=c._accounts[0].settlements[0];assert.equal(tx.partnerAmount,31.75);assert.equal(tx.grossProfit,null);assert.equal(tx.yourAmount,0);assert.equal(tx.items.length,9);assert.equal(tx.items.filter(x=>x.kind==='supplier').length,2);assert.equal(tx.items.filter(x=>x.kind==='consignment').length,7);
 assert(c.DB['OCT-26'].slice(0,9).every(i=>i.accountSettled&&!i.dateSold&&['sourced','listed'].includes(i.state)));assert.equal(c._acctSelected.size,0);assert.equal(c._acctSelectMode,false);assert.equal(rows().length,0);
 await c._rtPayAllocCreate();assert.equal(c._accounts[0].settlements.length,1,'Repeated confirmation never duplicates a payment');
 c.DB['OCT-26'][0].state='sold';c.DB['OCT-26'][0].dateSold='2026-10-16';assert.equal(rows().length,0,'A later sale cannot create a second debt');assert.equal(c._accountItemOwed(c.DB['OCT-26'][0]),3.25);
 // Partial allocations reserve only their amount; unpaid transactions also reserve.
 f=fixture();({c,stock,rows}=f);const partial=stock('partial',{accountPaidAmount:10,partnerAgreedAmount:10,arrangementModelOverride:'fixed_cost'});c.DB['OCT-26']=[partial];
 c._accounts[0].settlements=[{id:'paid',paid:true,partnerAmount:2,items:[{id:'partial',amount:2}]},{id:'reserved',paid:false,partnerAmount:3,items:[{id:'partial',amount:3}]}];assert.equal(rows()[0].remaining,5);
 c.__rtPartnerOpenPayment('p',['partial']);await c._rtPayAllocCreate();assert.equal(c._accounts[0].settlements[0].partnerAmount,5);assert.equal(partial.accountSettled,false,'An unpaid reserved allocation is not cash paid');assert.equal(rows().length,0,'Reserved amounts cannot be paid twice');
 // Changed amounts require a fresh confirmation instead of silently charging more.
 f=fixture();({c,stock,rows}=f);c.DB['OCT-26']=[stock('changed',{accountPaidAmount:3.25})];c.__rtPartnerOpenPayment('p',['changed']);c.DB['OCT-26'][0].accountPaidAmount=20;await c._rtPayAllocCreate();assert.equal(c._accounts[0].settlements.length,0);assert(f.messages.some(m=>m.includes('changed')));
 // Save failures roll back the new allocation/settled flags; retry is safe.
 f=fixture();({c,stock,rows}=f);c.DB['OCT-26']=[stock('retry',{accountPaidAmount:3.25})];c.__rtPartnerOpenPayment('p',['retry']);c.saveDB=async()=>{throw Error('Synthetic save failure');};await c._rtPayAllocCreate();assert.equal(c._accounts[0].settlements.length,0);assert.equal(c.DB['OCT-26'][0].accountSettled,false);assert.equal(rows()[0].remaining,3.25);c.saveDB=async()=>{};await c._rtPayAllocCreate();assert.equal(c._accounts[0].settlements.length,1);
 // A per-account credit reduces bank cash, not the gross item allocation.
 f=fixture();({c,stock,rows}=f);c.DB['OCT-26']=[stock('credit',{accountPaidAmount:3.25})];c.__rtPartnerAdjustmentsPlanPayment=()=>({gross:3.25,credit:1,net:2.25,applications:[{adjustmentId:'credit-fixture'}]});c.__rtPartnerAdjustmentsCommitPayment=async()=>{};
 c.__rtPartnerOpenPayment('p',['credit']);f.set('payalloc-apply-credit','');c.document.getElementById('payalloc-apply-credit').checked=true;await c._rtPayAllocCreate();assert.equal(c._accounts[0].settlements[0].partnerAmount,2.25);assert.equal(c._accounts[0].settlements[0].items[0].amount,3.25);assert.equal(c.DB['OCT-26'][0].accountSettled,true);
 console.log('PASS fixed agreement resolution, both terms writers, nine-item upfront payment, partial/reserved allocations, credits, stale confirmation and rollback');
})().catch(e=>{console.error(e);process.exitCode=1;});
