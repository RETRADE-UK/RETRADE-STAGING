/* Execute the real calculation/stock owners with synthetic records and I/O stubs.
 * No browser, database, credentials or network is used. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/core/application.js'),'utf8');
function take(name){
 const match=new RegExp('^(?:async )?function '+name+'\\(', 'm').exec(source);assert(match,'Missing '+name);
 const start=match.index,lineEnd=source.indexOf('\n',start),line=source.slice(start,lineEnd);
 const end=line.endsWith('}')?lineEnd:source.indexOf('\n}',start)+2;
 assert(end>start);return source.slice(start,end);
}
const c={console,Date,Math,JSON,Object,Array,Map,Set,Number,String,Promise,crypto:require('node:crypto').webcrypto,
 DB:{},_accounts:[],_jobLots:[],_jobLotItems:[],COUNTRY:'uk',_currentUserId:'synthetic',STOCK_SELECTED:new Set(),STOCK_SELECTION_MODE:false,
 saveDB:async()=>{c.saves++;},saves:0,toast(){},openItemPage(){},openItemDetail(){},getNextGID:()=>c.gid++,gid:1,
 _goToSourcedStock(){c.destination='sourced';},showConfirm:async()=>true};
c.window=c;vm.createContext(c);
vm.runInContext(source.slice(0,source.indexOf('// DB keys')),c);
vm.runInContext(source.slice(source.indexOf('const EXPENSE_CATEGORY_DEFS='),source.indexOf('function _resolveExpenseCat(')),c);
vm.runInContext(source.slice(source.indexOf('const PLATFORMS='),source.indexOf('let _settingsSyncTimer=')),c);
vm.runInContext(source.slice(source.indexOf('const _WITHDRAW_CLEAR_FIELDS ='),source.indexOf('function _canWithdrawStock(')),c);
vm.runInContext('let _stockWithdrawPending=false;',c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/domain/accounting-engine.js'),'utf8'),c);
const names=['_currentFYStart','_fyKeys','currentMonthKey','keyCode','keyYear','allDBKeys','_findItemRecordById','_monthlyPeriodResolve','_resolveExpenseCat','_performancePeriodSummary','_performanceFYMonths','_performanceMonthStats','_itemLifecycleState','_activeJobLots','_activeJobLotMembership','_canWithdrawStock','_applyStockWithdrawal','withdrawSelectedStock','_duplicateItemRecord','duplicateItem','_newId','_itemPlatform','_s1Platform','_itemAccountType','_accountItemOwed','_accountItemIsSold','_hmrcMileageFirstTierRate'];
for(const name of names)vm.runInContext(take(name),c);
const plain=x=>JSON.parse(JSON.stringify(x));
const item=(id,price,cost,date)=>({id,item:'Synthetic '+id,state:date?'sold':'sourced',dateSourced:'2026-04-01',dateListed:date?'2026-04-01':null,dateSold:date,salePrice:price,costPrice:cost,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,listingFee:0,salePlatform:'fb',platform:'fb',defaultPlatform:'fb',parts:[],returnHistory:[]});
function reconcile(expected){
 const before=JSON.stringify(c.DB),fy=c._performanceFYMonths(2026,{});
 const total=+Array.from(fy.months.values()).reduce((s,m)=>s+m.netProfit,0).toFixed(2);
 assert.equal(total,fy.summary.netProfit,'Month allocation must equal canonical FY, not a different total');
 if(expected!==undefined)assert.equal(total,expected);
 assert.equal(JSON.stringify(c.DB),before,'Read-only presentation');return fy;
}
(async()=>{
 c.DB={'APR-26':[item('small',100,10,'2026-04-01'),item('large',1000,700,'2026-04-20')],trips:[],expenses:[{date:'2026-04-30',amount:50,category:'Software & subscriptions'}]};
 c.DB['APR-26'][1].returnHistory=[{id:'refund',type:'partial_seller',saleNo:1,loggedAt:'2026-05-01',refundAmount:100}];
 c.DB['APR-26'].push({...item('writeoff',0,25,null),state:'scrapped',scrappedAt:'2026-06-01'});
 const fy=reconcile(215);assert.equal(fy.months.get('MAY-26').netProfit,-100);assert.equal(fy.months.get('JUN-26').netProfit,-25);
 assert(fy.months.get('JUN-26').hasCosts,'Expense/write-off-only months stay visible');
 // Full-year policy is shared across month slices, including Apr 1–5.
 c.DB.trips=[{id:'travel',date:'2026-05-01',mileage:100,expenses:[{category:'Parking',amount:7}]}];
 c.DB.expenses.push({date:'2026-06-10',category:'Motor, van & travel',amount:80});
 for(const method of ['mileage','actual']){c.DB._motorMethod=method;reconcile();}
 c.DB={trips:[],expenses:[{date:'2026-07-01',category:'Other',amount:30}]};reconcile(-30);
 // Copy state, independently-owned child rows, and title sequence across months.
 c.DB={'OCT-26':[item('source',0,25,null)],'SEP-26':[],trips:[],expenses:[]};
 const src=c.DB['OCT-26'][0];src.item='Camera';src.parts=[{id:'part-source',name:'Battery',cost:5}];src.notes='Preserve me';
 const before=JSON.stringify(src);c.duplicateItem('OCT-26','source');
 let copy=c.DB['OCT-26'].at(-1);assert.equal(copy.item,'Camera - 2');assert.equal(copy.state,'sourced');assert.equal(copy.dateListed,null);assert.equal(copy.listingFee,0);assert.notEqual(copy.parts[0].id,src.parts[0].id);assert.equal(copy.costPrice,25);assert.equal(copy.notes,src.notes);assert.equal(JSON.stringify(src),before);
 // Simulate fields lost in cloud mapping; the saved name still drives numbering.
 delete copy.parentId;delete copy.baseName;delete copy.copySeq;c.DB['SEP-26'].push(copy);c.DB['OCT-26'].pop();
 c.duplicateItem('OCT-26','source');assert.equal(c.DB['OCT-26'].at(-1).item,'Camera - 3');
 c.duplicateItem('SEP-26',copy.id);assert.equal(c.DB['SEP-26'].at(-1).item,'Camera - 4');
 const listed={...item('listed',80,20,null),state:'listed',dateListed:'2026-10-01',photo:'synthetic',notes:'Keep',returnHistory:[]};c.DB['OCT-26'].push(listed);
 c.duplicateItem('OCT-26','listed');assert.equal(c.DB['OCT-26'].at(-1).state,'listed');
 c.STOCK_SELECTED=new Set(['source','listed']);let saves=c.saves;
 c.showConfirm=async()=>false;await c.withdrawSelectedStock();assert.equal(listed.state,'listed');assert.equal(c.saves,saves);
 c.showConfirm=async()=>true;await c.withdrawSelectedStock();assert.equal(listed.state,'sourced');assert.equal(listed.salePrice,0);assert.equal(listed.dateListed,null);assert.equal(listed.costPrice,20);assert.equal(listed.photo,'synthetic');assert.equal(src.state,'sourced');assert.equal(c.saves,saves+1);assert.equal(c.destination,'sourced');
 const stale={...listed,id:'stale',state:'listed',dateListed:'2026-10-01'};c.DB['OCT-26'].push(stale);c.STOCK_SELECTED=new Set(['stale']);saves=c.saves;
 c.showConfirm=async()=>{stale.state='sold';stale.dateSold='2026-10-13';return true;};await c.withdrawSelectedStock();assert.equal(stale.state,'sold');assert.equal(c.saves,saves,'Never withdraw a record sold while confirmation was open');
 console.log('PASS stock copies, persistent-name numbering, guarded bulk withdrawal and canonical monthly/FY reconciliation');
})().catch(e=>{console.error(e);process.exitCode=1;});
