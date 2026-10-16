/* Regression for legacy listed labels with completed sales. Synthetic data only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),core=fs.readFileSync(path.join(root,'src/core/application.js'),'utf8');
function take(name){const start=core.indexOf('function '+name+'(');assert(start>=0,name);return core.slice(start,core.indexOf('\n}',start)+2);}
const c={console:{info(){}},DB:{'OCT-26':[]},_accounts:[{id:'p',accountType:'supplier',settlements:[]}],isFinite,
 allDBKeys:()=>['OCT-26'],_activeJobLotMembership:i=>c.lots[i]||null,_activeJobLotForItem:i=>c.lots[i]||null,lots:{},
 calcGrossProfit:i=>i.realised||0,calcEstGrossProfit:i=>i.expectedGross??null,
 _estPotentialGross:i=>{assert.equal(i.salePrice,0,'Unlisted uses its estimate, never a stale asking price');return i.expectedEstimate??null;},
 calcPartsCost:()=>0,_accountPaysOnSale:()=>true,_accountItemDebt:()=>null,_accountItemOwed:()=>0,
 _itemAccountType:i=>i.accountType||'supplier',_fixedAccountAmount:()=>null,
 _jobLotMemberPotentialShare:(i,l)=>l.estimatedShare,_jobLotMemberAskingShare:()=>0,
 roundMoney:n=>Math.round(n*100)/100};
vm.createContext(c);
for(const name of ['_itemLifecycleState','_migrateItemStates','_accountItemIsSold','_accountItems','_accountStockGroups','_accountStats'])vm.runInContext(take(name),c);
const item=(id,more={})=>({id,accountId:'p',state:'listed',dateSourced:'2026-10-01',salePrice:100,costPrice:30,expectedGross:70,returnHistory:[],...more});
const six=Array.from({length:6},(_,n)=>item('active-'+n));
const five=Array.from({length:5},(_,n)=>item('old-sale-'+n,{dateSold:'2026-07-07',realised:70}));
c.DB['OCT-26']=[...six,...five];
let snapshot=JSON.stringify(c.DB),stats=c._accountStats('p');
assert.equal(stats.listedCount,6);assert.equal(stats.forecastListedCount,6);assert.equal(stats.forecastYourShare,420);assert.equal(stats.soldCount,5);assert.equal(stats.yourShare,350);
assert.equal(JSON.stringify(c.DB),snapshot,'Reading the forecast must not mutate records');
const ui=fs.readFileSync(path.join(root,'src/features/partners/account-ui-v4.js'),'utf8');
const start=ui.indexOf('  function potentialInfo('),end=ui.indexOf('\n  function paidInfo(',start);
vm.runInContext(ui.slice(start,end),c);
assert.equal(c.potentialInfo(c._accounts[0]).value,420);assert.match(c.potentialInfo(c._accounts[0]).note,/6 listed items/);
assert.equal(c._migrateItemStates(),5);assert(five.every(i=>i.state==='sold'));
assert.equal(c._migrateItemStates(),0,'Reconciliation is idempotent');
assert.equal(c._accountStats('p').forecastYourShare,420);
const cases=[
 item('returned',{isReturned:true,dateSold:'2026-07-07'}),
 item('resold',{resaleSalePrice:80,resaleDateSold:'2026-09-01'}),
 item('resale-date',{resaleDateSold:'2026-09-02'}),
 item('sourced-sold',{state:'sourced',dateSold:'2026-08-01'}),
 item('disposed',{scrappedAt:'2026-10-01',dateSold:'2026-07-07'}),
 item('relisted',{returnHistory:[{type:'full_seller',date:'2026-08-01',_relistedAt:'2026-08-02'}]}),
 item('unlisted',{state:'sourced',salePrice:999,estSalePrice:50,expectedEstimate:12}),
 item('unpriced',{state:'sourced',salePrice:999,estSalePrice:0}),
 item('loss',{expectedGross:-20}),
 item('ghost',{state:'sold',dateSold:null}),
 item('lot-child',{state:'sourced'}),
 item('building-child',{isReturned:true,state:'returned'})
];
c.lots={'lot-child':{status:'listed',estimatedShare:15},'building-child':{status:'building',estimatedShare:7}};
c.DB['OCT-26']=cases;
snapshot=JSON.stringify(c.DB);stats=c._accountStats('p');
assert.equal(stats.forecastYourShare,84); // 70 relisted -20 loss +12 estimate +15 lot +7 building; ghost is repaired below
assert.equal(stats.forecastListedCount,3);assert.equal(stats.forecastUnlistedCount,2);
assert.equal(stats.unlistedCount,3,'Unpriced stock stays visible but is not forecast');
assert.equal(JSON.stringify(c.DB),snapshot);
const financial=cases.map(i=>JSON.stringify({...i,state:undefined}));
assert.equal(c._migrateItemStates(),5);
assert.deepEqual(cases.map(i=>i.state),['returned','sold','sold','sold','listed','listed','sourced','sourced','listed','listed','sourced','returned']);
assert.deepEqual(cases.map(i=>JSON.stringify({...i,state:undefined})),financial,'Only status labels change; financial/return data stays intact');
assert.equal(c._migrateItemStates(),0);
assert.equal(c._accountStats('p').forecastYourShare,154,'Repaired ghost stock returns to the forecast');
c.DB['OCT-26']=[item('unpriced-only',{state:'sourced',salePrice:999})];
assert.equal(c.potentialInfo(c._accounts[0]).value,null);
console.log('Account potential regression passed: 6 active / 5 legacy sold, returns, resale, disposal, losses, unlisted estimates, job lots and idempotent repair.');
