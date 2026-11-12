/* tax view implementations. Shared state and stable public functions live in core. */
window.__rtRegisterView("tax", {
"renderTax": function(){
  const page=document.getElementById('p-tax');
  const previousSettings=page.querySelector('#tax-estimate-settings');
  const desktopSettingsOpen=previousSettings&&(previousSettings.dataset.desktopMode==='true'?previousSettings.open:previousSettings.dataset.desktopOpen==='true');
  const focusedSetting=page.contains(document.activeElement)&&/^(tax-region|tax-other-income|tax-motor)$/.test(document.activeElement.id)?document.activeElement.id:null;
  const openSections=new Set(Array.from(page.querySelectorAll('details[open]:not([data-mobile-open="false"])')).map(function(el){return el.id;}));
  const now=new Date(),currentYear=(now.getMonth()>3||(now.getMonth()===3&&now.getDate()>=6))?now.getFullYear():now.getFullYear()-1;
  const year=Number(DB._taxYear)||currentYear,label=year+'/'+String(year+1).slice(2);
  const from=year+'-04-06',to=(year+1)+'-04-05';
  const pnl=_buildTaxCashSummary(from,to,'FY '+label),management=_buildPnLSummary(from,to,'FY '+label);
  const cash=pnl.cashDetail;
  const events=getSaleEventsInRange(year+'-04-01',(year+1)+'-03-31'),byMonth=new Map();
  events.forEach(function(e){const key=_monthKeyFromDate(e.saleDate);if(!byMonth.has(key))byMonth.set(key,[]);byMonth.get(key).push(e);});
  const context={eventsByMonth:byMonth,tieredTrips:calcTieredTrips(DB.trips||[])};
  const sales=_fyKeys(year).map(function(k){return calcMonthStatsBySale(k,context);});
  const round=function(v){return +v.toFixed(2);};
  const salesGross=round(sales.reduce(function(s,m){return s+m.grossProfit;},0));
  const salesNet=round(sales.reduce(function(s,m){return s+m.netProfit;},0));
  const income=pnl.totalBusinessIncome,expenses=round(income-pnl.netProfit);
  // This workspace prepares actual-expense accounts. Old saved allowance
  // preferences must not silently change its figures or the exported totals.
  const allowance=0,usingTA=false,profit=pnl.netProfit,deduction=expenses;
  const rates=_taxRateConfig(year),otherIncome=_taxOtherIncome(),region=_taxRegion(),taxable=Math.max(0,profit);
  const incomeTax=_selfEmploymentIncomeTax(taxable,otherIncome,year,region);
  const class2=rates.c2mandatory&&taxable>(rates.c2chargeAt||rates.c2spt)?round(rates.c2weekly*52):0;
  const c4base=Math.max(0,taxable-rates.pa);
  const class4=round(Math.min(c4base,rates.c4upper-rates.pa)*rates.c4low)+round(Math.max(0,taxable-rates.c4upper)*rates.c4high);
  const totalTax=round(incomeTax+class2+class4),effectivePA=_personalAllowanceForIncome(otherIncome+taxable,rates);
  const expenseLines=[
    [17,'Stock, repairs & partner payments',pnl.box17],
    [20,'Motor, van & travel',pnl.byBox[20]||0],[21,'Rent, utilities & insurance',pnl.byBox[21]||0],
    [22,'Repairs & equipment',pnl.byBox[22]||0],[23,'Postage, packaging & office',pnl.byBox[23]||0],
    [24,'Advertising & marketing',pnl.byBox[24]||0],[25,'Loan interest',pnl.byBox[25]||0],
    [26,'Platform & payment fees',pnl.byBox[26]||0],[28,'Professional fees',pnl.byBox[28]||0],
    [30,'Returns & other expenses',pnl.byBox[30]||0]
  ].filter(function(r){return r[0]===17||r[2]!==0;});
  const money=function(n){return (n<0?'−':'')+fmt(Math.abs(n));};
  const signed=function(n){return (n>0?'+':'')+money(n);};
  const row=function(name,value,note,cls){return '<div class="tax-bridge-row '+(cls||'')+'"><span>'+name+(note?'<small>'+note+'</small>':'')+'</span><strong>'+value+'</strong></div>';};
  const details=function(id,title,body){return '<details class="tax-card tax-details" id="'+id+'"'+(openSections.has(id)?' open':'')+'><summary>'+title+'</summary><div class="tax-details-body">'+body+'</div></details>';};
  const kpi=function(name,value,note,accent){return '<div class="tax-kpi'+(accent?' tax-kpi-primary':'')+'"><span>'+name+'</span><strong>'+value+'</strong><small>'+note+'</small></div>';};
  const periods=_taxYearPeriods(year);
  const monthly=periods.map(function(p){
    const x=_buildTaxCashSummary(p.from,p.to,'');
    return {label:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][p.month]+' '+String(p.year).slice(2),
      range:p.from+' → '+p.to,income:x.totalBusinessIncome,costs:round(x.totalBusinessIncome-x.netProfit),profit:x.netProfit};
  }).filter(function(x){return x.income!==0||x.costs!==0;});
  const monthlyProfit=round(monthly.reduce(function(s,m){return s+m.profit;},0));
  if(Math.abs(monthlyProfit-pnl.netProfit)>0.01)console.warn('[RETRADE] Tax monthly reconciliation mismatch');
  const sumPositive=monthly.reduce(function(s,m){return s+Math.max(0,m.profit);},0);
  let allocatedPence=0,cumulativePositive=0;
  monthly.forEach(function(m){
    cumulativePositive+=Math.max(0,m.profit);
    const cumulativePence=sumPositive?Math.round(totalTax*100*cumulativePositive/sumPositive):0;
    m.setAside=(cumulativePence-allocatedPence)/100;allocatedPence=cumulativePence;
  });
  let options='';
  for(let y=Math.max(currentYear,year);y>=Math.min(currentYear-2,year);y--)options+='<option value="'+y+'"'+(y===year?' selected':'')+'>'+y+'/'+String(y+1).slice(2)+'</option>';
  let html='<div class="tax-workspace"><header class="tax-header"><div><h1>Tax & Universal Credit</h1><p>Clear figures for your reporting period, ready to download.</p></div>'
    +'<label class="tax-year-control"><span class="tax-year-caption">Tax year<small>6 Apr '+year+' – 5 Apr '+(year+1)+'</small></span><select id="tax-year" class="tax-year-select" onchange="DB._taxYear=Number(this.value);DB._taxMethod=null;saveDB();renderTax()">'+options+'</select></label></header>'
    +'<div class="tax-kpis tax-mobile-only">'+kpi(profit<0?'Business loss':'Taxable profit',money(profit),usingTA?'Trading allowance selected':'After allowable expenses',true)
    +kpi('Estimated tax & NI',money(totalTax),'Other income: '+money(otherIncome))+kpi('Yearly Sales net profit',money(salesNet),'April–March · after overheads')+'</div>'
    +'<div class="tax-kpis tax-desktop-only">'+kpi('Business income',money(income),'Cash received')+kpi('Allowable expenses',money(expenses),'Recorded deductions')+kpi(profit<0?'Business loss':'Business profit',money(profit),'After allowable expenses',true)+kpi('Estimated tax & NI',money(totalTax),'Based on income entered')+'</div>'
    +'<div class="tax-view-switch" role="group" aria-label="Tax sections"><button type="button" data-tax-view="reports" onclick="setTaxWorkspaceView(\'reports\')">Reports</button><button type="button" data-tax-view="overview" onclick="setTaxWorkspaceView(\'overview\')">Annual overview</button><button type="button" data-tax-view="filing" onclick="setTaxWorkspaceView(\'filing\')">Filing guide</button><button type="button" data-tax-view="monthly" onclick="setTaxWorkspaceView(\'monthly\')">Monthly breakdown</button></div>'
    +'<div class="tax-layout"><div class="tax-main"><section id="tax-period-reports" aria-label="Monthly and custom date reports"></section>';

  // Show the actual reasons for the difference instead of making two accounting
  // bases artificially equal. Calendar, motor rules and write-offs are separate.
  const dateAdjustment=round(management.netProfit+(management.archiveLoss||0)-(management.motorExcluded||0)-salesNet);
  const grossRow=row('Yearly Sales gross profit',money(salesGross),'April–March · after item costs and partner shares');
  const netRow=row('Yearly Sales net profit',money(salesNet),'After trips and logged overheads','tax-bridge-total');
  const adjustment=function(name,value,note){return value?row(name,signed(value),note):'';};
  const dateRows=adjustment('Tax-year dates',dateAdjustment,'Replace 1–5 April '+year+' with 1–5 April '+(year+1))
    +adjustment('Motor costs excluded',management.motorExcluded||0,'One motor expense method; no duplicate deduction')
    +adjustment('Removed stock / write-offs',-(management.archiveLoss||0),'Management profit adjustment');
  const cashRows=adjustment('Mileage allowance',-(pnl.motorMethod==='mileage'?pnl.mileage.cost:0),'HMRC deduction only; excluded from Sales profit')
    +adjustment('Actual vehicle costs excluded',pnl.motorMethod==='mileage'?pnl.motorActual:0,'Running costs are covered by the mileage allowance')
    +adjustment('Stock purchase timing',round(management.cogs-pnl.cashGoodsPaid),'Sale-matched stock and parts: '+money(management.cogs)+'; purchases paid: '+money(pnl.cashGoodsPaid))
    +adjustment('Partner payment timing',round(management.selling.partner-pnl.cashPartnerPaid),'Share recognised on sales: '+money(management.selling.partner)+'; paid: '+money(pnl.cashPartnerPaid))
    +adjustment('Write-off timing',management.archiveLoss||0,'Paid stock is already deducted when purchased')
    +adjustment('Supplier refunds received',pnl.otherBusinessIncome||0,'Recovery recorded on the removal / refund date');
  const profitRow=row('Profit on cash basis · actual expenses',money(pnl.netProfit),'Income received less allowable costs paid','tax-bridge-total');
  const bridge=grossRow+netRow+dateRows+row('Sales-basis profit · 6 Apr–5 Apr',money(management.netProfit),'Same tax-year dates','tax-bridge-total')+cashRows+profitRow;
  // Desktop uses the same adjustments once; mobile retains the full original bridge.
  const desktopBridge=netRow+dateRows+cashRows+profitRow;
  html+='<section class="tax-card" id="tax-comparison"><div class="tax-section-heading"><h2><span class="tax-mobile-only">How your profit compares</span><span class="tax-desktop-only">Why this differs from Sales</span></h2><p class="tax-mobile-only">Sales matches costs to sales. Tax uses payment timing and tax-year dates.</p></div>'
    +'<div class="tax-profit-bridge tax-mobile-only">'+row('Yearly Sales net profit',money(salesNet),'1 Apr '+year+' – 31 Mar '+(year+1))
    +row('Cash-basis profit',money(pnl.netProfit),'6 Apr '+year+' – 5 Apr '+(year+1),'tax-bridge-total')+'</div>'
    +details('tax-reconciliation','See the full reconciliation',bridge).replace('tax-card tax-details','tax-card tax-details tax-mobile-only')
    +'<div class="tax-desktop-only tax-desktop-reconciliation">'+desktopBridge+'</div>'
    +'<details id="tax-explain-adjustments" class="tax-desktop-only tax-explanation"'+(openSections.has('tax-explain-adjustments')?' open':'')+'><summary>Explain these adjustments</summary><p class="tax-note">Sales matches costs to the items sold. Tax uses the tax-year dates and the recorded timing of payments. The notes above explain each adjustment.</p></details></section>';
  const shortBoxes={17:11,20:12,21:14,22:15,23:18,24:19,25:17,26:17,28:16,30:19};
  const filingForm=window._taxFilingForm==='full'?'full':'short';
  const filingGroups=new Map();
  expenseLines.forEach(function(r){const box=filingForm==='full'?r[0]:shortBoxes[r[0]];if(!filingGroups.has(box))filingGroups.set(box,{amount:0,labels:[]});const g=filingGroups.get(box);g.amount+=r[2];g.labels.push(r[1]);});
  const filingRow=function(box,name,amount,note){return '<div class="tax-filing-row"><span><b>Box '+box+'</b> · '+name+'</span><strong>'+money(amount)+'</strong><small>'+note+'</small></div>';};
  const filingRows=filingRow(filingForm==='full'?15:9,'Turnover',pnl.revenue,'Sales receipts, including buyer-paid postage')
    +filingRow(filingForm==='full'?16:10,'Other business income',pnl.otherBusinessIncome||0,'Recorded supplier refunds and other business income')
    +Array.from(filingGroups.entries()).sort((a,b)=>a[0]-b[0]).map(function(entry){const [box,g]=entry;return filingRow(box,'Allowable costs',+g.amount.toFixed(2),g.labels.join(' + '));}).join('')
    +filingRow(filingForm==='full'?31:20,'Total allowable expenses',expenses,'Total of the expense boxes above; not an additional expense')
    +filingRow(filingForm==='full'?(profit<0?48:47):(profit<0?22:21),profit<0?'Net loss':'Net profit',Math.abs(profit),'Bookkeeping result before capital allowances, losses and other tax adjustments');
  html+='<section class="tax-card" id="tax-filing-guide"><div class="tax-section-heading"><h2>Prepare your tax return</h2><p>Actual expenses · cash basis. Match these recorded costs to your self-employment form.</p></div>'
    +'<label class="tax-filing-form" for="tax-filing-form">Your self-employment form<select id="tax-filing-form" onchange="window._taxFilingForm=this.value;renderTax();document.getElementById(\'tax-filing-form\').focus({preventScroll:true})"><option value="short"'+(filingForm==='short'?' selected':'')+'>Short · SA103S</option><option value="full"'+(filingForm==='full'?' selected':'')+'>Full · SA103F</option></select></label>'
    +'<p class="tax-note">Use the amount on the right for the matching box. Costs sharing a box are combined below. These are the boxes supported by your RETRADE records; complete any other applicable sections using your own records.</p>'
    +'<div class="tax-filing-lines">'+filingRows+'</div>'
    +'<p class="tax-note">Amounts sharing a box must be added together; do not claim the total again alongside its individual lines. Review category assignments and business-only use before filing. Partner means a stock supplier / consignor here, not a legal business partnership.</p>'
    +'<p class="tax-note">Box references use the published 2025/26 forms. Confirm the form for '+label+'. These are bookkeeping totals, before any capital allowances, losses or other tax adjustments. The Personal Allowance remains part of your tax estimate.</p>'
    +'<p class="tax-note"><a href="https://www.gov.uk/government/publications/self-assessment-self-employment-short-sa103s" target="_blank" rel="noopener">HMRC short form &amp; notes</a> · <a href="https://www.gov.uk/government/publications/self-assessment-self-employment-full-sa103f" target="_blank" rel="noopener">HMRC full form &amp; notes</a></p></section>';
  let breakdown=row('Sales receipts',money(pnl.revenue),'Short box 9 · Full box 15 · includes buyer-paid postage')
    +(pnl.otherBusinessIncome?row('Supplier refunds',money(pnl.otherBusinessIncome),'Short box 10 · Full box 16'):'')
    +row('Total business income',money(income),'','tax-bridge-total');
  if(usingTA)breakdown+=row('Trading allowance','−'+money(allowance));
  else breakdown+=expenseLines.map(function(r){return row(r[1],signed(-r[2]),'Short box '+shortBoxes[r[0]]+' · Full box '+r[0],'tax-exp-row');}).join('');
  breakdown+=row('Total deduction','−'+money(deduction),'Short box 20 · Full box 31','tax-bridge-total')+row(profit<0?'Business loss':'<span class="tax-mobile-only">Taxable profit</span><span class="tax-desktop-only">Business profit</span>',money(profit),profit<0?'Short box 22 · Full box 48 · before tax adjustments':'Short box 21 · Full box 47 · before tax adjustments','tax-bridge-total')
    +'<p class="tax-note">Box numbers: Short = SA103S · Full = SA103F. <button class="tax-inline-action" onclick="setTaxWorkspaceView(\'filing\')">See what to enter in each box →</button></p>';
  html+=details('tax-income-expenses','Income & deductions',breakdown);
  const paidDetail=row('Own / upfront stock purchases',money(cash.ownStockPaid))+row('Supplier purchases paid',money(cash.supplierStockPaid))
    +row('Parts & repairs paid',money(cash.partsPaid))+row('Partner shares paid',money(cash.partnerPaid))
    +'<p class="tax-note">Own and upfront stock uses its stock payment date, falling back to the sourced date as an estimate when the payment date is unverified. Parts use their recorded date, falling back to the source date. Supplier and partner payments use paid allocations.</p>'
    +(cash.assumptions.length?'<details class="tax-note tax-notice"><summary>'+cash.assumptions.length+' record(s) need review before filing</summary><ul>'+cash.assumptions.map(function(record){return '<li>'+esc(record.reason)+' '+esc(money(record.amount))+' &middot; '+esc(String(record.itemId||''))+'</li>';}).join('')+'</ul></details>':'');
  html+=details('tax-purchases','Stock & partner payment detail',paidDetail);
  if(monthly.length){
    html+='<section class="tax-card" id="tax-monthly-summary"><div class="tax-section-heading"><h2>Monthly cash-basis profit</h2><p>Actual expenses · includes 1–5 April '+(year+1)+'. Set-aside shares add up to the annual estimate.</p></div><div class="tax-months">';
    html+='<div class="tax-month-head"><span>Period</span><span>Income</span><span>Costs</span><span>Profit</span><span>Set aside</span></div>';
    monthly.forEach(function(m){html+='<div class="tax-month"><div class="tax-month-name"><strong>'+m.label+'</strong><small>'+m.range+'</small></div>'
      +'<div data-label="Income">'+money(m.income)+'</div><div data-label="Costs">'+money(m.costs)+'</div><div data-label="Profit" class="tax-month-profit">'+money(m.profit)+'</div><div data-label="Set aside">'+money(m.setAside)+'</div></div>';});
    html+='<div class="tax-month tax-month-total"><strong>Tax year total</strong><div data-label="Income">'+money(income)+'</div><div data-label="Costs">'+money(expenses)+'</div><div data-label="Profit">'+money(pnl.netProfit)+'</div><div data-label="Set aside">'+money(totalTax)+'</div></div></div></section>';
  }
  if(!monthly.length)html+='<section class="tax-card" id="tax-monthly-summary"><h2>Monthly cash-basis profit</h2><p>No activity recorded in this tax year.</p></section>';
  html+='</div><aside class="tax-aside"><details class="tax-card tax-details" id="tax-estimate"'+(openSections.has('tax-estimate')?' open':'')+'><summary><span class="tax-mobile-only">Tax settings & estimate</span><span class="tax-desktop-only">Estimate breakdown</span></summary><div class="tax-details-body"><details id="tax-estimate-settings" class="tax-settings-disclosure" data-desktop-open="'+Boolean(desktopSettingsOpen)+'" open><summary class="tax-desktop-only">Edit estimate settings</summary><div class="tax-section-heading"><p>Other income affects your tax band.</p></div><div class="tax-settings">'
    +'<label for="tax-region">Tax region<select id="tax-region" onchange="setTaxRegion(this.value)"><option value="rUK"'+(region==='rUK'?' selected':'')+'>England, Wales & Northern Ireland</option><option value="scotland"'+(region==='scotland'?' selected':'')+'>Scotland</option></select></label>'
    +'<label for="tax-other-income">Other taxable income (£)<small>Salary, pension etc. before Personal Allowance</small><input id="tax-other-income" type="number" inputmode="decimal" min="0" step="0.01" value="'+otherIncome+'" onchange="setTaxOtherIncome(this.value)"></label></div></details>'
    +'<div class="tax-estimate-values">'+row('Income Tax',money(incomeTax))+row('Class 2 NI',money(class2))+row('Class 4 NI',money(class4))+row('Estimated total',money(totalTax),'','tax-bridge-total')+'</div>'
    +'<div class="tax-desktop-only tax-estimate-basis"><strong>Other income · '+money(otherIncome)+'</strong><span>'+esc(region==='scotland'?'Scotland':'England, Wales & Northern Ireland')+'</span></div>'
    +'<p class="tax-note">'+(totalTax===0?'No estimated tax or self-employed NI on this profit at the figures entered.':'Payments on account may apply. This estimate is the extra tax on your business profit.')+'</p>';
  if(pnl.motorDoubleClaim)html+='<div class="tax-note"><label for="tax-motor">Motor deduction<select id="tax-motor" onchange="DB._motorMethod=this.value;saveDB();renderTax()"><option value="mileage"'+(pnl.motorMethod==='mileage'?' selected':'')+'>Simplified mileage</option><option value="actual"'+(pnl.motorMethod==='actual'?' selected':'')+'>Actual motor costs</option></select></label><p>'+money(pnl.motorExcluded)+' of '+esc(pnl.motorExcludedLabel)+' excluded to avoid claiming both.</p></div>';
  html+='</div></details>';
  const references=row('Turnover',money(pnl.revenue),'SA103F 15 / SA103S 9')
    +(pnl.otherBusinessIncome?row('Other business income',money(pnl.otherBusinessIncome),'SA103F 16 / SA103S 10'):'')
    +row(usingTA?'Trading allowance':'Allowable expenses',money(deduction),usingTA?'SA103F 16.1 / SA103S 10.1':'SA103F 31 / SA103S 20')
    +row(profit<0?'Net business loss':'Net business profit',money(Math.abs(profit)),profit<0?'SA103F 48 / SA103S 22 · before tax adjustments':'SA103F 47 / SA103S 21 · before tax adjustments');
  html+=details('tax-filing','Filing references',references+'<p class="tax-note">Latest published SA103 layout; confirm the form for '+label+' before filing.</p>');
  html+=details('tax-assumptions','How this estimate works','<p class="tax-note">Recorded sale dates stand in for receipt dates; expense dates stand in for payment dates. Keep these aligned with your records. Supplier refunds use the recorded removal / refund date. This is a working estimate; verify it before filing.</p>'
    +'<p class="tax-note">This workspace uses actual expenses, not the trading allowance. Sales and Tax can differ because of dates, unsold stock, unpaid partner costs and motor deductions.</p>');
  html+='</aside></div><button type="button" class="btn btn-primary tax-export-bottom" aria-haspopup="dialog" onclick="openTaxSummaryDownload()">Download tax summary</button></div>';
  window._taxExportData={year:label,method:usingTA?'Trading allowance (£1,000)':'Actual expenses',income:income,turnover:pnl.revenue,
    otherBusinessIncome:pnl.otherBusinessIncome||0,saleCount:pnl.events.filter(function(e){return !e.isReturnAdjustment;}).length,
    expenseLines:usingTA?[['Trading allowance',allowance]]:expenseLines.map(function(r){return [r[1],r[2]];}),sa103Rows:_buildSA103Rows(pnl),
    filingLines:expenseLines.map(function(r){return {label:r[1],amount:r[2],shortBox:shortBoxes[r[0]],fullBox:r[0]};}),
    totalExpenses:expenses,tradingAllowanceUsed:allowance,box15:pnl.revenue,box16:deduction,box23:profit,
    mileageMiles:pnl.mileage.miles,motorDoubleClaim:pnl.motorDoubleClaim,incomeTax:incomeTax,class2:class2,class4:class4,totalTax:totalTax,
    otherIncome:otherIncome,taxRegion:region,effectivePA:effectivePA};
  page.innerHTML=html;
  renderTaxPeriodReports();
  setTaxWorkspaceView(window._taxWorkspaceView||'reports');
  _syncTaxDesktopDetails();
  if(focusedSetting&&window.matchMedia('(min-width:1281px)').matches){const field=document.getElementById(focusedSetting);if(field)field.focus({preventScroll:true});}
},

"renderTaxPeriodReports": function(){
  const host=document.getElementById('tax-period-reports');if(!host)return;
  const state=_taxReportState(),openIds=new Set(Array.from(host.querySelectorAll('details[open]')).map(el=>el.id));
  const options={taxPaid:state.taxPaid,niPaid:state.niPaid,pensionPaid:state.pensionPaid};
  const hmrc=_buildPeriodReport('hmrc',state.from,state.to,options),uc=_buildPeriodReport('uc',state.from,state.to,options);
  window._taxPeriodReports={hmrc:hmrc,uc:uc};
  const money=n=>(Number(n)<0?'-':'')+fmt(Math.abs(Number(n)||0));
  const range=_taxReportDateLabel(state.from)+' - '+_taxReportDateLabel(state.to);
  const errors=[...new Set([...(hmrc.errors||[])])];
  const row=(label,value)=>'<div class="tax-report-line"><span>'+esc(label)+'</span><strong>'+value+'</strong></div>';
  const details=(id,title,body)=>'<details class="tax-report-details" id="'+id+'"'+(openIds.has(id)?' open':'')+'><summary>'+title+'</summary><div>'+body+'</div></details>';
  const monthFields='<div class="tax-report-month-picker"><button type="button" id="tax-report-previous" class="btn btn-secondary" aria-label="Previous month" onclick="shiftTaxReportMonth(-1)">&#8592;</button><label for="tax-report-month">Calendar month<input id="tax-report-month" type="month" value="'+esc(state.month)+'" onchange="setTaxReportSelection(\'month\',this.value)"></label><button type="button" id="tax-report-next" class="btn btn-secondary" aria-label="Next month" onclick="shiftTaxReportMonth(1)">&#8594;</button></div>';
  const customFields='<div class="tax-report-custom"><label for="tax-report-from">From<input id="tax-report-from" type="date" value="'+esc(state.from)+'" onchange="setTaxReportSelection(\'from\',this.value)"></label><label for="tax-report-to">To<input id="tax-report-to" type="date" value="'+esc(state.to)+'" onchange="setTaxReportSelection(\'to\',this.value)"></label></div>';
  let html='<section class="tax-period-toolbar" aria-label="Report period"><div class="tax-period-heading"><div><h2>Reporting period</h2><p>One set of dates. Two reporting bases.</p></div><div class="tax-period-switch" role="group" aria-label="Choose period type"><button type="button" id="tax-report-mode-month" aria-pressed="'+(state.mode==='month')+'" onclick="setTaxReportSelection(\'mode\',\'month\')">Monthly</button><button type="button" id="tax-report-mode-custom" aria-pressed="'+(state.mode==='custom')+'" onclick="setTaxReportSelection(\'mode\',\'custom\')">Custom dates</button></div></div>'
    +'<div class="tax-period-controls">'+(state.mode==='month'?monthFields:customFields)+'<div class="tax-period-caption"><strong>'+esc(hmrc.valid?range:'Choose valid dates')+'</strong><span>Start and end dates are included</span></div></div>'
    +(errors.length?'<p class="tax-report-error" role="alert">'+errors.map(esc).join(' ')+'</p>':'')+'</section>';
  function card(report,basis){
    const isUC=basis==='uc',valid=report.valid,ready=valid&&(!isUC||state.assessmentConfirmed);
    const result=isUC?report.reportableEarnings:report.profit;
    const deductions=(Number(report.taxPaid)||0)+(Number(report.niPaid)||0)+(Number(report.pensionPaid)||0);
    const lines=(report.expenseLines||[]).map(line=>row(Array.isArray(line)?line[0]:line.label,money(Array.isArray(line)?line[1]:line.amount))).join('');
    const title=isUC?'Universal Credit':'HMRC cash basis';
    const paidInputs=isUC?[['taxPaid','Income Tax paid'],['niPaid','National Insurance paid'],['pensionPaid','Pension contributions paid']].map(([key,label])=>'<label for="tax-report-'+key+'">'+label+' (£)<input id="tax-report-'+key+'" type="number" inputmode="decimal" min="0" step="0.01" value="'+esc(String(state[key]))+'" onchange="setTaxReportSelection(\''+key+'\',this.value)"></label>').join(''):'';
    const paidDetail=isUC?details('tax-report-uc-paid','Tax, NI & pension paid<strong>'+money(deductions)+'</strong>','<p>Enter eligible amounts actually paid in this period. Annual tax estimates are not payments. These worksheet entries stay in this session only.</p><div class="tax-report-paid-fields">'+paidInputs+'</div>'):'';
    let content='<article class="tax-report-card" data-report-basis="'+basis+'"><header><div><span class="tax-report-eyebrow">'+(isUC?'Monthly assessment':'Self Assessment')+'</span><h2>'+title+'</h2></div><span class="tax-report-badge">'+(isUC?'Worksheet':'Summary')+'</span></header>'
      +'<div class="tax-report-numbers"><div><span>Business income</span><strong data-report-number="income">'+(valid?money(report.income):'—')+'</strong></div><div><span>Business expenses</span><strong data-report-number="expenses">'+(valid?money(report.totalExpenses):'—')+'</strong></div></div>'
      +'<div class="tax-report-result"><span>'+(isUC?'Income less deductions':((Number(result)<0?'Business loss':'Business profit')))+'</span><strong data-report-number="profit">'+(valid?money(result):'—')+'</strong></div>'
      +'<div class="tax-report-support">'+row('Mileage allowance included',valid?money(report.mileageCost):'—')+row('Business miles',valid?Number(report.mileageMiles||0).toLocaleString('en-GB',{maximumFractionDigits:2}):'—')
      +(isUC?paidDetail:row('Accounting method','Cash basis'))+'</div>';
    if(valid){
      content+=details('tax-report-'+basis+'-expenses','Expense breakdown',lines||'<p>No business expenses recorded for these dates.</p>');
      if(isUC){
        content+='<label class="tax-assessment-check" for="tax-assessment-confirmed"><input id="tax-assessment-confirmed" type="checkbox"'+(state.assessmentConfirmed?' checked':'')+' onchange="setTaxReportSelection(\'assessmentConfirmed\',this.checked)"><span>These are my exact UC assessment dates.<small>A calendar month may differ from your assessment period.</small></span></label>';
      }else{
        content+='<p class="tax-report-context">Stock is deducted when paid, including unsold stock. Mileage follows the tax-year allowance.</p>';
      }
    }else{
      content+='<p class="tax-report-error" role="status">'+(report.errors||['Choose valid dates to prepare this report.']).map(esc).join(' ')+'</p>';
    }
    if(report.notes&&report.notes.length)content+=details('tax-report-'+basis+'-notes','Basis & review notes','<ul>'+report.notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>');
    content+='<footer><button type="button" class="btn '+(isUC?'btn-secondary':'btn-primary')+' tax-report-download" aria-haspopup="dialog" onclick="openTaxPeriodDownload(\''+basis+'\')"'+(ready?'':' disabled')+'>Download '+(isUC?'UC worksheet':'HMRC report')+'</button><span>PDF · CSV · Excel</span></footer></article>';
    return content;
  }
  html+='<div class="tax-report-grid">'+card(hmrc,'hmrc')+card(uc,'uc')+'</div>'
    +'<p class="tax-report-footnote">Working figures from your RETRADE records. Review receipt and payment dates before reporting. These downloads do not submit a return or calculate a Universal Credit award.</p>';
  host.innerHTML=html;
}
});
