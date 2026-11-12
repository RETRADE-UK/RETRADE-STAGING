/* costs view implementations. Shared state and stable public functions live in core. */
window.__rtRegisterView("costs", {
"renderExpenses": function(listOnly){
  if(COST_SELECTION_OWNER!==_currentUserId){COST_SELECTED.clear();COST_SEARCH='';COST_SELECTION_MODE=false;COST_SELECTION_OWNER=_currentUserId;}
  const trips=DB.trips||[];
  const expenses=DB.expenses||[];
  const tiered=calcTieredTrips(trips);
  const _tieredById={};
  trips.forEach(function(t,idx){ if(t&&t.id) _tieredById[t.id]=tiered[idx]; });

  // Period scope + category filter (V2)
  const _per=_costPeriodRange(COST_PERIOD);
  const _inR=function(d){return d&&d>=_per.from&&d<=_per.to;};
  const _brk=_costCategoryBreakdown(trips,expenses,_tieredById,_per.from,_per.to);
  // Category filter matchers. Trips carry their headline mileage under Motor,
  // so a trip shows under 'all' or the Motor filter; standalone expenses match
  // their own resolved category.
  const _catAll=(COST_CAT_FILTER==='all');
  const _tripMatch=function(t){return _inR(t.date)&&(_catAll||COST_CAT_FILTER==='Motor, van & travel')&&_costSearchMatch(t,'trip');};
  const _expMatch=function(e){return _inR(e.date)&&(_catAll||_resolveExpenseCat(e.category).label===COST_CAT_FILTER)&&_costSearchMatch(e,'exp');};

  const candidates=trips.filter(_tripMatch).map(record=>({kind:'trip',key:'trip:'+record.id,record}))
    .concat(expenses.filter(_expMatch).map(record=>({kind:'exp',key:'exp:'+record.id,record})));
  const keyCounts=new Map();
  trips.forEach(record=>keyCounts.set('trip:'+record.id,(keyCounts.get('trip:'+record.id)||0)+1));
  expenses.forEach(record=>keyCounts.set('exp:'+record.id,(keyCounts.get('exp:'+record.id)||0)+1));
  COST_VISIBLE=candidates.filter(row=>row.record.id&&keyCounts.get(row.key)===1);
  const visibleKeys=new Set(COST_VISIBLE.map(row=>row.key));
  for(const key of COST_SELECTED)if(!visibleKeys.has(key))COST_SELECTED.delete(key);
  const checkbox=(record,kind)=>COST_SELECTION_MODE?`<label class="cost-row-select" onclick="event.stopPropagation()"><input type="checkbox" data-cost-key="${esc(kind+':'+record.id)}" aria-label="Select ${esc(record.description||(kind==='trip'?'trip':'expense'))}" ${visibleKeys.has(kind+':'+record.id)?'':'disabled'} onchange="toggleCostSelected(this.dataset.costKey,this.checked)"></label>`:'';

  // Month grouping
  const _mKey=function(d){return d?(d.slice(0,7)):'0000-00';}
  const _ML={'01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec'};
  const _fmtMK=function(k){if(!k||k==='0000-00')return 'Undated';const[y,m]=k.split('-');return(_ML[m]||m)+' '+y;}
  const mMap={};
  trips.forEach(function(t,origIdx){if(!_tripMatch(t))return;const k=_mKey(t.date);if(!mMap[k])mMap[k]={trips:[],expenses:[]};mMap[k].trips.push({t,origIdx});});
  expenses.forEach(function(e,idx){if(!_expMatch(e))return;const k=_mKey(e.date);if(!mMap[k])mMap[k]={trips:[],expenses:[]};mMap[k].expenses.push({e,idx});});
  const sortedMonths=Object.keys(mMap).sort((a,b)=>b.localeCompare(a));
  const monthScope=JSON.stringify([_currentUserId,COST_PERIOD,COST_CAT_FILTER,_per.from,_per.to]);
  if(monthScope!==_costMonthScope){_costMonthScope=monthScope;_costMonthExpanded=Object.create(null);}
  // Single-month views need no disclosure. Never hide search results or rows
  // covered by Select all; restore browsing choices when those modes finish.
  const canCollapseMonths=sortedMonths.length>1&&!COST_SEARCH.trim()&&!COST_SELECTION_MODE;
  const _tripRow=function({t,origIdx}){
    const r=_tieredById[t.id]||{totalCost:0,mileageCost:0,expensesCost:0,isSplit:false,tier2Miles:0,ratePerMile:t.ratePerMile||0.45};
    const expCount=Array.isArray(t.expenses)?t.expenses.length:0;
    let rateLabel=r.isSplit?fmt(r.ratePerMile||0.45)+'+'+fmt(0.25):r.tier2Miles>0?fmt(0.25):fmt(r.ratePerMile||t.ratePerMile||0.45);
    const metaParts=[(t.mileage||0)+' mi @ '+rateLabel+'/mi'];
    if(r.isSplit)metaParts.push('<span style="color:var(--accent)">tiered</span>');
    else if(r.tier2Miles>0)metaParts.push('<span style="color:var(--accent)">tier 2</span>');
    if(expCount>0)metaParts.push(expCount+' extra'+(expCount!==1?'s':''));
    if(t.date)metaParts.push(t.date);
    const ddId='dd-trip-'+origIdx;
    return `<div class="expense-item clickable" onclick="showTripBreakdown(${origIdx})">
      ${checkbox(t,'trip')}<div class="exp-dot trip"></div>
      <div class="expense-main"><div class="expense-label">${esc(t.description||'Sourcing trip')}</div><div class="expense-meta">${metaParts.join('<span style="color:var(--border2)">&nbsp;·&nbsp;</span>')}</div></div>
      <div class="expense-right"><div class="expense-amount">${r.totalCost>0?fmt(r.totalCost):'<span style="color:var(--muted)">—</span>'}</div></div>
      <div class="expense-actions" onclick="event.stopPropagation()">
        <div class="ddwrap" id="${ddId}" style="position:relative">
          <button class="ddbtn" aria-label="Item actions" onclick="event.stopPropagation();toggleDD('${ddId}')" title="Actions">⋮</button>
          <div class="ddmenu">
            <button onclick="event.stopPropagation();toggleDD('${ddId}');showTripBreakdown(${origIdx})">${icon('chart',14)} View breakdown</button>
            <button onclick="event.stopPropagation();toggleDD('${ddId}');editTrip(${origIdx})">${icon('edit',14)} Edit</button>
            <button onclick="event.stopPropagation();toggleDD('${ddId}');duplicateTrip(${origIdx})">${icon('dupe',14)} Duplicate</button>
            <button class="danger" onclick="event.stopPropagation();toggleDD('${ddId}');deleteTrip(${origIdx})">${icon('trash',14)} Delete</button>
          </div>
        </div>
      </div></div>`;
  }
  const _expRow=function({e,idx}){
    const ddId='dd-exp-'+idx;
    return `<div class="expense-item">
      ${checkbox(e,'exp')}<div class="exp-dot expense"></div>
      <div class="expense-main"><div class="expense-label">${esc(e.description||'Expense')}</div><div class="expense-meta">${[e.date,e.category?esc(_expenseCanonLabel(e.category)):''].filter(Boolean).join('<span style="color:var(--border2)">&nbsp;·&nbsp;</span>')}</div></div>
      <div class="expense-right"><div class="expense-amount">${e.amount<0?'<span style="color:var(--green);font-weight:700">+'+fmt(-e.amount)+'</span>':((e.amount||0)>0?fmt(e.amount):'<span style="color:var(--muted)">—</span>')}</div></div>
      <div class="expense-actions" onclick="event.stopPropagation()">
        <div class="ddwrap" id="${ddId}" style="position:relative">
          <button class="ddbtn" aria-label="Item actions" onclick="event.stopPropagation();toggleDD('${ddId}')" title="Actions">⋮</button>
          <div class="ddmenu">
            <button onclick="event.stopPropagation();toggleDD('${ddId}');editExpense(${idx})">${icon('edit',14)} Edit</button>
            <button onclick="event.stopPropagation();toggleDD('${ddId}');duplicateExpense(${idx})">${icon('dupe',14)} Duplicate</button>
            ${(e.amount>0&&!e.isRefund)?`<button onclick="event.stopPropagation();toggleDD('${ddId}');recordRefund(${idx})">${icon('undo',14)} Record refund</button>`:''}
            <button class="danger" onclick="event.stopPropagation();toggleDD('${ddId}');deleteExpense(${idx})">${icon('trash',14)} Delete</button>
          </div>
        </div>
      </div></div>`;
  }
  const monthSections=sortedMonths.map(mk=>{
    const{trips:mT,expenses:mE}=mMap[mk];
    const mTC=mT.reduce((s,{t})=>{const r=_tieredById[t.id]||{totalCost:0};return s+r.totalCost;},0);
    const mEC=mE.reduce((s,{e})=>s+(e.amount||0),0);
    const mTot=+(mTC+mEC).toFixed(2);
    const rc=mT.length+mE.length;
    // Interleave trips + expenses by date (newest first) into one ledger stream
    const items=mT.map(x=>({date:x.t.date||'',kind:'trip',x}))
      .concat(mE.map(x=>({date:x.e.date||'',kind:'exp',x})))
      .sort((a,b)=>b.date.localeCompare(a.date));
    const rows=items.map(it=>it.kind==='trip'?_tripRow(it.x):_expRow(it.x)).join('');
    const expanded=!canCollapseMonths||(_costMonthExpanded[mk]!==undefined?_costMonthExpanded[mk]:mk===sortedMonths[0]);
    const rowsId='cost-month-rows-'+mk;
    const heading=`<span class="cost-month-heading">${_fmtMK(mk)} <span class="lm-count">${rc} item${rc!==1?'s':''}</span></span>
        <span class="lm-total">${mTot>0?'−'+fmt(mTot):'—'}</span>`;
    const header=canCollapseMonths
      ?`<button type="button" class="ledger-month-label cost-month-toggle" aria-expanded="${expanded}" aria-controls="${rowsId}" onclick="toggleCostMonth('${mk}')">${heading}<span class="cost-month-chevron" aria-hidden="true">▾</span></button>`
      :`<div class="ledger-month-label">${heading}</div>`;
    return `<div class="ledger-month" data-cost-month="${mk}">
      ${header}
      <div id="${rowsId}" class="cost-month-rows"${expanded?'':' hidden'}>${rows}</div>
    </div>`;
  }).join('');

  const _periods=[['taxyear','Tax year'],['mtd','This month'],['lastMonth','Last month'],['last30','30 days'],['last90','90 days'],['all','All time']];
  const periodRow=_periods.map(function(p){
    return '<button data-cost-period="'+p[0]+'" class="cost-period-pill'+(COST_PERIOD===p[0]?' active':'')+'" onclick="setCostPeriod(\''+p[0]+'\')">'+p[1]+'</button>';
  }).join('');

  // Category filter cards (tap to filter, tap active to clear). Leading "All".
  const allActive=(COST_CAT_FILTER==='all')?' active':'';
  const allCard='<div data-cost-category="all" class="cost-cat-card'+allActive+'" onclick="setCostCatFilter(\'all\')">'
    +'<div class="ccc-dot" style="background:var(--muted)"></div>'
    +'<div class="ccc-label">All categories</div>'
    +'<div class="ccc-amt">'+fmt(_brk.total)+'</div>'
    +'<div class="ccc-count">'+_brk.count+' item'+(_brk.count!==1?'s':'')+'</div></div>';
  const catCards=_brk.cats.map(function(c){
    const act=(COST_CAT_FILTER===c.label)?' active':'';
    return '<div data-cost-category="'+esc(c.label)+'" class="cost-cat-card'+act+'" onclick="setCostCatFilter(\''+c.label.replace(/'/g,"\\'")+'\')">'
      +'<div class="ccc-box">Box '+c.box+'</div>'
      +'<div class="ccc-dot" style="background:'+_costCatDot(c.bucket)+'"></div>'
      +'<div class="ccc-label" title="'+esc(c.label)+'">'+esc(_expenseShort(c.label))+'</div>'
      +'<div class="ccc-amt">'+fmt(c.amount)+'</div>'
      +'<div class="ccc-count">'+c.count+' item'+(c.count!==1?'s':'')+'</div></div>';
  }).join('');

  const selectionHTML=COST_SELECTION_MODE?`<button id="cost-select-all" class="sel-check" role="checkbox" aria-label="Select all shown" aria-checked="false" onclick="selectAllCosts(COST_SELECTED.size!==COST_VISIBLE.length)"><span class="sel-check-box" aria-hidden="true"></span><span id="cost-selected-count" role="status">Select all</span></button>
    <button id="cost-delete-selected" class="bulk-ctrl is-danger" onclick="deleteSelectedCosts()" hidden>${icon('trash',14)} Delete</button>
    <button class="sel-exit" onclick="toggleCostSelection()">✕ Done</button>`:`<button class="select-toggle" aria-pressed="false" onclick="toggleCostSelection()">Select</button>`;
  const resultLabel=candidates.length+' '+(COST_SEARCH.trim()?'matching ':'')+'entr'+(candidates.length===1?'y':'ies');
  const ledgerHTML=sortedMonths.length?monthSections:`<div class="empty-state"><div class="empty-state-text">${COST_SEARCH.trim()?'No matching trips or expenses':'Nothing in this view'}</div><div class="empty-state-sub">${COST_SEARCH.trim()?'Try another description, date or category.':'Try a wider period or clear the category filter.'}</div></div>`;
  const page=document.getElementById('p-expenses');
  if(listOnly&&page.querySelector('#cost-ledger')){
    page.querySelector('#cost-ledger').innerHTML=ledgerHTML;
    page.querySelector('#cost-selection-controls').innerHTML=selectionHTML;
    page.querySelector('#cost-result-count').textContent=resultLabel;
    _paintCostSelection();return;
  }
  const filterNote=_catAll?'':' · '+esc(COST_CAT_FILTER);
  const html=`
    <div class="page-header">
      <div>
        <div class="page-title">Trips &amp; Expenses</div>
        <div class="page-subtitle">Log mileage, sourcing runs and business spend</div>
      </div>
      <div class="ddwrap" id="dd-exp-add" style="position:relative;flex-shrink:0">
        <button class="btn btn-primary" style="gap:6px;padding:9px 14px;font-size:13px" onclick="toggleDD('dd-exp-add')">Add ▾</button>
        <div class="ddmenu" style="right:0;min-width:160px">
          <button onclick="toggleDD('dd-exp-add');addTrip()">${icon('trip',14)} Log Trip</button>
          <button onclick="toggleDD('dd-exp-add');addExpense()">${icon('expense',14)} Add Expense</button>
        </div>
      </div>
    </div>

    <div class="cost-period-row">${periodRow}</div>

    <div class="cost-total-banner">
      <div class="cost-total-left">
        <div class="cost-total-label">Deductions${filterNote}</div>
        <div class="cost-total-val">${_brk.total>0?'−'+fmt(_brk.total):fmt(0)}</div>
        <div class="cost-total-sub">${_per.label} · ${_brk.count} item${_brk.count!==1?'s':''}</div>
      </div>
      <button class="cost-taxlink" onclick="goToTab('tax')">Tax return ready <span style="font-size:15px;line-height:1">&rarr;</span></button>
    </div>

    ${_brk.cats.length>0?`<div class="cost-cat-row">${allCard}${catCards}</div>`:''}

    <div class="cost-list-controls">
      <div class="inlist-search">${_selSearchIco(15)}<input id="cost-search" type="search" class="inlist-search-input" placeholder="Search trips &amp; expenses" aria-label="Search trips and expenses" value="${esc(COST_SEARCH)}" oninput="searchCosts(this.value)"></div>
      <div id="cost-selection-controls" class="list-toolbar">${selectionHTML}</div>
      <div id="cost-result-count" role="status">${resultLabel}</div>
    </div>
    <div id="cost-ledger">${ledgerHTML}</div>
  `;
  page.innerHTML=html;
  _paintCostSelection();
},

"renderCash": function(){
  const el=document.getElementById('p-cash');if(!el)return;
  const c=calcCashSummary();
  const led=_cashflowSortedEvents(c);
  _cashflowViewEvents=led;
  const state=_cashflowFilterState(led);
  const filtered=state.filtered,filteredIn=state.filteredIn,filteredOut=state.filteredOut,filtersActive=state.filtersActive;
  const kpi=function(label,val,foot,col){return '<div class="card kpi"><div class="kpi-label">'+esc(label)+'</div><div class="kpi-value num"'+(col?' style="color:'+col+'"':'')+'>'+fmt(val)+'</div>'+(foot?'<div class="kpi-foot">'+foot+'</div>':'')+'</div>';};
  const types=Array.from(new Set(led.map(function(m){return String(m.type||'cash');}))).sort(function(a,b){return a.localeCompare(b);});

  let html='<div class="page-header"><div><div class="page-title">Cashflow</div><div class="page-subtitle">Every real cash movement across stock, sales, returns, expenses, settlements and owner money.</div></div>'
    +'<div style="display:flex;gap:8px;flex-shrink:0;"><button class="btn btn-secondary" onclick="openReconcile()">Reconcile</button><button class="btn btn-primary" onclick="addCashMove()">'+icon('expense',15)+' Add</button></div></div>';
  html+='<div class="card" style="padding:20px 22px;margin-bottom:18px;"><div class="kpi-label">Business cash available</div>'
    +'<div class="num" style="font-size:clamp(28px,7vw,40px);font-weight:800;line-height:1.05;margin-top:4px;'+(c.cashAvailable<0?'color:var(--red);':'')+'">'+fmt(c.cashAvailable)+'</div>'
    +'<div class="kpi-foot" style="margin-top:8px;line-height:1.5;">'+fmt(c.inflows)+' cash in − '+fmt(c.outflows)+' cash out. Includes platform balances as business cash; moving eBay/Vinted money to bank is an internal transfer, not new income.</div></div>';
  html+='<details class="card" style="padding:0;margin:-6px 0 18px;overflow:hidden;"><summary style="cursor:pointer;padding:12px 15px;font-size:12px;font-weight:700;color:var(--text-secondary);list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px;"><span>Cash calculation audit</span><span class="num" style="color:var(--text);">'+fmt(c.cashAvailable)+'</span></summary>'
    +'<div style="padding:0 15px 13px;border-top:1px solid var(--border);"><div class="pnl-row"><span>Opening balance</span><strong>+'+fmt(c.opening)+'</strong></div>'
    +'<div class="pnl-row"><span>Trading / operating cash movements</span><strong>'+(c.operatingCash<0?'−':'+')+fmt(Math.abs(c.operatingCash))+'</strong></div>'
    +'<div class="pnl-row"><span>Owner contributions</span><strong>+'+fmt(c.contrib)+'</strong></div><div class="pnl-row"><span>Owner withdrawals</span><strong>−'+fmt(c.draw)+'</strong></div>'
    +'<div class="pnl-row"><span>Manual / reconcile adjustments</span><strong>'+(c.adjust<0?'−':'+')+fmt(Math.abs(c.adjust))+'</strong></div><div class="pnl-row total"><span>Business cash available</span><strong>'+fmt(c.cashAvailable)+'</strong></div>'
    +'<div style="font-size:11px;color:var(--text-secondary);line-height:1.45;margin-top:8px;">This total is event-ledger based: stock purchases and parts leave cash when bought; sales add cash; fees/shipping/refunds/expenses/settlements remove it; supplier refunds add it back. COGS restoration and HMRC mileage allowance do not move cash.</div></div></details>';
  html+='<div class="sl" style="margin:20px 0 10px;">Cash</div><div class="kgrid">'
    +kpi('Cash in',c.inflows,'All recorded inflows','#3b82f6')+kpi('Cash out',c.outflows,'All recorded outflows','var(--warn)')+kpi('Cash tied up in stock',c.stockTied,'Paid acquisition + parts still held')+kpi('Gross profit (all-time)',c.grossProfit,'Accounting profit — shown for comparison only')+'</div>';
  if(c.unpaidLiabilities.total>0)html+='<div class="card" style="padding:13px 15px;margin-top:-6px;margin-bottom:16px;border-style:dashed;"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><div><div style="font-size:12px;font-weight:700;color:var(--text);">Still to be paid</div><div style="font-size:11px;color:var(--text-secondary);margin-top:3px;line-height:1.45;">Supplier '+fmt(c.unpaidLiabilities.supplier)+' · partner shares '+fmt(c.unpaidLiabilities.partner)+'. These do not leave cash until a paid settlement exists.</div></div><strong class="num" style="white-space:nowrap;color:var(--accent);">'+fmt(c.unpaidLiabilities.total)+'</strong></div></div>';
  html+='<div class="sl" style="margin:22px 0 10px;">Owner</div><div class="kgrid">'+kpi('You took out',c.draw,'This tax year '+fmt(c.drawFY),c.draw>0?'var(--warn)':'')+kpi('You added',c.contrib,'This tax year '+fmt(c.contribFY),c.contrib>0?'#3b82f6':'')+kpi('Net taken by you',c.netOwner,c.netOwner>=0?'More out than in':'More in than out')+kpi('Profit kept in business',c.profitRetained,'Accounting net profit − drawings + added')+'</div>';

  html+='<div class="cashflow-list-heading"><div><div class="sl">All cash movements</div><div id="cashflow-result-count" class="cashflow-result-count">'+filtered.length+' of '+led.length+' movements</div></div></div>';
  html+='<div class="cashflow-manager">'
    +'<div class="cashflow-toolbar">'
      +'<label class="cashflow-search-field"><span class="cashflow-control-label">Search</span><input id="cashflow-search" class="cashflow-control cashflow-search" type="search" inputmode="search" autocomplete="off" placeholder="Description, type, source…" value="'+esc(_cashflowSearch)+'" oninput="cashflowSearchInput(this)"></label>'
      +'<label><span class="cashflow-control-label">Direction</span><select id="cashflow-direction" class="cashflow-control" onchange="setCashflowFilter(\'direction\',this.value)"><option value="all"'+(_cashflowDirection==='all'?' selected':'')+'>All directions</option><option value="in"'+(_cashflowDirection==='in'?' selected':'')+'>Money in</option><option value="out"'+(_cashflowDirection==='out'?' selected':'')+'>Money out</option></select></label>'
      +'<label><span class="cashflow-control-label">Type</span><select id="cashflow-type" class="cashflow-control" onchange="setCashflowFilter(\'type\',this.value)"><option value="all"'+(_cashflowType==='all'?' selected':'')+'>All types</option>'+types.map(function(t){return '<option value="'+esc(t)+'"'+(_cashflowType===t?' selected':'')+'>'+esc(t.replace(/_/g,' '))+'</option>';}).join('')+'</select></label>'
      +'<label><span class="cashflow-control-label">Period</span><select id="cashflow-range" class="cashflow-control" onchange="setCashflowFilter(\'range\',this.value)"><option value="all"'+(_cashflowRange==='all'?' selected':'')+'>All time</option><option value="30"'+(_cashflowRange==='30'?' selected':'')+'>Last 30 days</option><option value="90"'+(_cashflowRange==='90'?' selected':'')+'>Last 90 days</option><option value="year"'+(_cashflowRange==='year'?' selected':'')+'>This year</option></select></label>'
    +'</div>'
    +'<div class="cashflow-manager-footer"><div class="cashflow-filter-totals"><span>In <b id="cashflow-filter-in" style="color:#3b82f6">'+fmt(filteredIn)+'</b></span><span>Out <b id="cashflow-filter-out" style="color:var(--warn)">'+fmt(filteredOut)+'</b></span><span>Net <b id="cashflow-filter-net" style="color:'+(filteredIn-filteredOut>=0?'#3b82f6':'var(--warn)')+'">'+fmt(filteredIn-filteredOut)+'</b></span></div>'
      +'<div class="cashflow-actions"><div id="cashflow-clear-slot" style="display:contents">'+(filtersActive?'<button class="cashflow-action-btn" onclick="clearCashflowFilters()">Clear filters</button>':'')+'</div><button class="cashflow-action-btn" onclick="printCashflow()">Print</button><button class="cashflow-action-btn cashflow-action-primary" onclick="exportCashflowExcel()">Excel</button></div></div>'
    +'</div>';
  html+='<div id="cashflow-results">'+_cashflowLedgerHTML(led,filtered)+'</div>';
  el.innerHTML=html;
},

"renderReturns": function(){
  const el=document.getElementById('p-returns');if(!el)return;
  // Flatten every return entry across all items
  const rows=[];
  const seenMulti={}; let multiCycle=0;
  (typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(k){
    (DB[k]||[]).forEach(function(i){
      const rh=(i.returnHistory||[]);
      if(!rh.length)return;
      const fullN=rh.filter(function(r){return r.type==='full_seller'||r.type==='full_ebay';}).length;
      if(fullN>1 && !seenMulti[i.id]){seenMulti[i.id]=1;multiCycle++;}
      rh.forEach(function(r){
        const isFull=(r.type==='full_seller'||r.type==='full_ebay');
        rows.push({m:k,id:i.id,name:i.item||'Untitled',date:_returnEventDate(r)||'',
          type:r.type,isFull:isFull,refund:Number(r.refundAmount)||0,
          postage:Number(r.returnPostage)||0,saleNo:r.saleNo||1,item:i,fullN:fullN});
      });
    });
  });
  const fyR=_periodDateRange('current_fy');
  const inPeriod=function(d){return _returnsPeriod==='all'||(d&&d>=fyR.from&&d<=fyR.to);};
  // KPI stats scoped to the selected PERIOD (type filter doesn't move the headline)
  const periodRows=rows.filter(function(x){return inPeriod(x.date);});
  let fullCount=0,partialCount=0,totalRefund=0,totalRetPost=0;
  periodRows.forEach(function(x){
    if(x.isFull)fullCount++; else partialCount++;
    totalRefund+=x.refund; totalRetPost+=x.postage;
  });
  const _saleEvents=getSaleEventsInRange(_returnsPeriod==='all'?null:fyR.from,_returnsPeriod==='all'?null:fyR.to).filter(function(ev){return !ev.isReturned;});
  const soldCount=_saleEvents.length;
  const returnedSaleNos=new Set(periodRows.filter(function(x){return x.isFull;}).map(function(x){return x.id+':'+x.saleNo;}));
  const retItems=returnedSaleNos.size;
  const rate=soldCount>0?(retItems/soldCount*100):0;
  let _periodRev=0;
  _saleEvents.forEach(function(ev){const b=_saleBreakdown(ev);_periodRev+=(Number(b.salePrice)||0)+(Number(b.postage)||0);});
  const refundPctRev=_periodRev>0?(totalRefund/_periodRev*100):null;
  // Rows to list — period + type filter, newest first
  const filtered=periodRows.filter(function(x){
    if(_returnsType==='full')return x.isFull;
    if(_returnsType==='partial')return !x.isFull;
    return true;
  }).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});

  const kpi=function(label,val,foot,col){
    return '<div class="card kpi"><div class="kpi-label">'+esc(label)+'</div>'
      +'<div class="kpi-value num"'+(col?' style="color:'+col+'"':'')+'>'+val+'</div>'
      +(foot?'<div class="kpi-foot">'+foot+'</div>':'')+'</div>';
  };
  const seg=function(kind,val,label,active){
    return '<button class="rtn-seg'+(active?' on':'')+'" onclick="_setReturnsFilter(\''+kind+'\',\''+val+'\')">'+esc(label)+'</button>';
  };
  let html=''
    +'<div class="page-header"><div>'
      +'<div class="page-title">Returns</div>'
      +'<div class="page-subtitle">Every refund logged across your stock — the postage and fees you can\u2019t always get back</div>'
    +'</div></div>';
  html+='<div class="kgrid" style="margin-bottom:16px;">'
    +kpi('Refunds logged',String(periodRows.length),fullCount+' full · '+partialCount+' partial')
    +kpi('Return rate',rate.toFixed(1)+'%',retItems+' of '+soldCount+' sales came back')
    +kpi('Total refunded',fmt(totalRefund),(refundPctRev!=null?refundPctRev.toFixed(1)+'% of revenue':'Money sent back to buyers'))
    +kpi('Return postage',fmt(totalRetPost),'Sunk cost — rarely recoverable',totalRetPost>0?'var(--warn)':'')
  +'</div>';
  if(multiCycle>0 && _returnsPeriod==='all'){
    html+='<div class="card" style="padding:12px 14px;margin-bottom:16px;border-left:3px solid var(--warn);font-size:13px;color:var(--text-secondary);line-height:1.5;">'
      +'<strong style="color:var(--text)">'+multiCycle+' item'+(multiCycle>1?'s':'')+' returned more than once.</strong> '
      +'These went through multiple sale\u2192refund cycles. Lifetime P&amp;L and statement events are reconciled by sale cycle. Each completed sale cycle is kept separately, including Sale 3 and beyond. Data Integrity will flag any missing or duplicated cycle links.</div>';
  }
  html+='<div class="rtn-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">'
    +'<div class="rtn-segbar">'+seg('period','all','All time',_returnsPeriod==='all')+seg('period','fy','This tax year',_returnsPeriod==='fy')+'</div>'
    +'<div class="rtn-segbar">'+seg('type','all','All',_returnsType==='all')+seg('type','full','Full',_returnsType==='full')+seg('type','partial','Partial',_returnsType==='partial')+'</div>'
  +'</div>';
  if(!filtered.length){
    html+='<div class="card" style="padding:20px;text-align:center;color:var(--text-secondary);line-height:1.5;">No returns'+(_returnsPeriod==='fy'?' this tax year':'')+(_returnsType!=='all'?' of that type':'')+'. '+(rows.length?'Try widening the filters.':'When you log a return on an item it\u2019ll show here.')+'</div>';
  }else{
    html+='<div class="section-card" style="padding:0;overflow:hidden;">';
    filtered.forEach(function(x){
      const meta=_returnTypeMeta(x.type);
      const badgeCol=x.isFull?'var(--red)':'var(--accent)';
      // A partial refund leaves the item WITH the buyer — the sale stands, it was never returned/relisted.
      // Only full refunds bring the item back, so the returned/resold/relisted disposition applies to those.
      let disp = x.item.scrappedAt?(x.item.scrapReason==='donated'?'Donated':'Scrapped'):(!x.isFull?'Kept (sold)':(x.item.isReturned?'In stock (returned)':(x.item.resaleSalePrice?'Resold':'Relisted')));
      html+='<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openItemPage(\''+x.m+'\',\''+x.id+'\',\'p-returns\')">'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(x.name)+'</div>'
          +'<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">'
            +'<span style="color:'+badgeCol+';font-weight:600;">'+esc(meta.label)+'</span>'
            +' · '+esc(x.date||'—')
            +(x.fullN>1?' · Sale '+x.saleNo:'')
            +' · '+disp
          +'</div>'
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0;">'
          +'<div class="num" style="font-weight:700;color:'+badgeCol+';">\u2212'+fmt(x.refund)+'</div>'
          +(x.postage>0?'<div style="font-size:11px;color:var(--text-secondary);">+ '+fmt(x.postage)+' postage</div>':'')
        +'</div>'
      +'</div>';
    });
    html+='</div>';
  }
  el.innerHTML=html;
},

"renderScrapped": function(){
  const el=document.getElementById('p-scrapped');if(!el)return;
  el.innerHTML='<div style="margin-bottom:12px"><button class="btn btn-secondary" onclick="goToTab(\'stock\',null)">← Inventory</button></div>'
    +'<div class="page-header"><div><div class="page-title">Archive</div><div class="page-subtitle">Items no longer in inventory — scrapped, donated, recycled or returned to a supplier.</div></div></div>'
    +_removedBodyHTML(_scrappedItems(),'p-scrapped'); return;
  /* legacy body below (unreached) */
  const rows=_scrappedItems();
  let capScrapped=0,capDonated=0;const byReason={scrapped:0,donated:0,recycled:0,other:0};
  rows.forEach(function(r){
    const c=(Number(r.item.costPrice)||0)+((typeof calcPartsCost==='function')?(Number(calcPartsCost(r.item))||0):0);
    const rk=(r.item.scrapReason||'scrapped');byReason[rk]=(byReason[rk]||0)+1;
    if(rk==='donated')capDonated+=c; else capScrapped+=c;
  });
  const kpi=function(label,val,foot,col){
    return '<div class="card kpi"><div class="kpi-label">'+esc(label)+'</div>'
      +'<div class="kpi-value num"'+(col?' style="color:'+col+'"':'')+'>'+val+'</div>'
      +(foot?'<div class="kpi-foot">'+foot+'</div>':'')+'</div>';
  };
  const _reasonLabel={scrapped:'Scrapped',donated:'Donated',recycled:'Recycled',other:'Other'};
  let html=''
    +'<div class="page-header"><div>'
      +'<div class="page-title">Scrapped / Donated</div>'
      +'<div class="page-subtitle">Items that have left your stock \u2014 scrapped, recycled, or given away. Your record of what you\u2019ve lost or donated.</div>'
    +'</div></div>';
  html+='<div class="kgrid" style="margin-bottom:16px;">'
    +kpi('Capital scrapped',fmt(capScrapped),((byReason.scrapped||0)+(byReason.recycled||0)+(byReason.other||0))+' item(s) \u00b7 faulty / binned / recycled',capScrapped>0?'var(--warn)':'')
    +kpi('Capital donated',fmt(capDonated),(byReason.donated||0)+' item(s) given away',capDonated>0?'var(--accent)':'')
  +'</div>';
  if(!rows.length){
    html+='<div class="card" style="padding:20px;text-align:center;color:var(--text-secondary);line-height:1.5;">Nothing removed yet. When you scrap or donate an item it\u2019ll show here.</div>';
  }else{
    html+='<div class="section-card" style="padding:0;overflow:hidden;">';
    rows.forEach(function(r){
      const i=r.item;
      const c=(Number(i.costPrice)||0)+((typeof calcPartsCost==='function')?(Number(calcPartsCost(i))||0):0);
      const when=String(i.scrappedAt||'').slice(0,10);
      html+='<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openItemPage(\''+r.m+'\',\''+i.id+'\',\'p-scrapped\')">'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
          +'<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">'
            +'<span style="color:var(--muted);font-weight:600;">'+esc(_reasonLabel[i.scrapReason]||'Scrapped')+'</span>'
            +' \u00b7 '+esc(when||'\u2014')
            +(i.scrapNote?' \u00b7 '+esc(i.scrapNote):'')
          +'</div>'
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0;">'
          +'<div class="num" style="font-weight:700;color:var(--warn);">\u2212'+fmt(c)+'</div>'
          +'<div style="font-size:11px;color:var(--muted);">written off</div>'
        +'</div>'
      +'</div>';
    });
    html+='</div>';
  }
  el.innerHTML=html;
},

"renderActivity": function(){
  const el=document.getElementById('p-activity'); if(!el) return;
  const allRows=(DB.activityLog||[]).slice().sort(function(a,b){return (Number(b.ts)||0)-(Number(a.ts)||0);});
  const latestActive={};
  allRows.forEach(function(r){ if(!r.undone && r.itemId && latestActive[r.itemId]===undefined) latestActive[r.itemId]=r.id; });
  const q=ACTIVITY_SEARCH.trim().toLowerCase();
  const matchesFilter=function(r){
    if(ACTIVITY_FILTER==='all')return true;
    if(ACTIVITY_FILTER==='undo')return _activityUndoState(r,latestActive).ok;
    return _activityCategory(r)===ACTIVITY_FILTER;
  };
  const rows=allRows.filter(function(r){
    if(!matchesFilter(r))return false;
    if(!q)return true;
    const hay=[r.itemName,r.action,r.fromState,r.toState,r.after,r.afterSummary,r.month,r.origin].filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q)!==-1;
  });
  const now=new Date(),todayKey=now.toDateString();
  const todayCount=allRows.filter(function(r){return new Date(Number(r.ts)||0).toDateString()===todayKey;}).length;
  const reviewCount=allRows.filter(function(r){return _activityCategory(r)==='review'&&!r.undone;}).length;
  const undoCount=allRows.filter(function(r){return _activityUndoState(r,latestActive).ok;}).length;
  const activeCount=allRows.filter(function(r){return !r.undone;}).length;
  const filters=[['all','All'],['undo','Can undo'],['sales','Sales'],['stock','Stock'],['returns','Returns'],['joblot','Job Lots'],['disposals','Disposed'],['review','Review']];
  const filterHTML=filters.map(function(f){
    let n=0;
    if(f[0]==='all')n=allRows.length;
    else if(f[0]==='undo')n=undoCount;
    else n=allRows.filter(function(r){return _activityCategory(r)===f[0];}).length;
    return '<button data-activity-filter="'+f[0]+'" class="act-filter'+(ACTIVITY_FILTER===f[0]?' active':'')+'" onclick="setActivityFilter(\''+f[0]+'\')"><span>'+f[1]+'</span><b>'+n+'</b></button>';
  }).join('');
  let body='';
  if(!rows.length){
    body='<div class="act-empty"><div class="act-empty-icon">'+(typeof icon==='function'?icon('undo',17):'↩')+'</div>'
      +'<div class="act-empty-title">'+(allRows.length?'No matching activity':'No activity yet')+'</div>'
      +'<div class="act-empty-copy">'+(allRows.length?'Try another filter or search term.':'RETRADE will record recoverable item changes here as you work.')+'</div></div>';
  }else{
    let lastDay='';
    rows.forEach(function(r){
      const d=new Date(Number(r.ts)||Date.now()),dayKey=d.toDateString();
      if(dayKey!==lastDay){lastDay=dayKey;body+='<div class="act-day">'+_actDayLabel(d)+'</div>';}
      const hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0');
      const undo=_activityUndoState(r,latestActive);
      const needsReview=_activityCategory(r)==='review'||/needs review/i.test(String(r.after||r.afterSummary||''));
      const detail=String(r.after||r.afterSummary||'').trim();
      const genericDetail=(r.itemName?String(r.itemName)+' — ':'')+String(r.action||'');
      const showDetail=detail&&detail!==genericDetail?detail:'';
      const transition=(r.fromState||r.toState)?'<span class="act-transition">'+esc(_activityStateLabel(r.fromState))+' <span>→</span> '+esc(_activityStateLabel(r.toState))+'</span>':'';
      const itemExists=!!_findItemMonth(r.itemId);
      body+='<div class="act-entry'+(r.undone?' act-undone':'')+(needsReview?' act-review':'')+'">'
        +'<div class="act-rail"><div class="act-node act-node-'+_activityNodeClass(r)+'">'+_activityNodeIcon(r)+'</div></div>'
        +'<div class="act-card"><div class="act-card-top"><div class="act-title-wrap"><span class="act-title">'+esc(r.action||'Change')+'</span>'
        +(r.itemName?'<button class="act-item-link" '+(itemExists?'onclick="_actGoItem(\''+esc(r.itemId||'')+'\')"':'disabled')+'>'+esc(r.itemName)+'</button>':'')
        +'</div><span class="act-time">'+hh+':'+mm+'</span></div>'
        +(showDetail?'<div class="act-detail">'+esc(showDetail)+'</div>':'')
        +'<div class="act-meta">'+transition
        +(needsReview?'<span class="act-review-tag">Needs review</span>':'')
        +(r.undone?'<span class="act-reversed-tag">Reversed</span>':'')+'</div>'
        +'<div class="act-actions">'
        +(undo.ok?'<button class="btn btn-secondary act-undo" onclick="undoActivity(\''+esc(r.id)+'\')">'+_UNDO_SVG+'Undo change</button>'
          :(!r.undone&&r.undoable&&undo.reason?'<span class="act-undo-note" title="'+esc(undo.reason)+'">'+(typeof icon==='function'?icon('lock',11):'')+esc(undo.reason)+'</span>':''))
        +'</div></div></div>';
    });
  }
  const searchIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const activityHTML='<div class="act-shell"><div class="page-header act-page-header"><div><div class="page-title">Activity &amp; Undo</div>'
    +'<div class="page-subtitle">Review what changed and safely reverse the latest eligible item action.</div></div>'
    +'<div class="act-overview"><span><strong>'+todayCount+'</strong> today</span><i></i><span><strong>'+activeCount+'</strong> active records</span><i></i><span><strong>'+undoCount+'</strong> undoable</span>'
    +(reviewCount?'<i></i><span class="act-overview-review"><strong>'+reviewCount+'</strong> review</span>':'')+'</div></div>'
    +'<div class="act-toolbar"><div class="act-filters">'+filterHTML+'</div><div class="act-search">'+searchIcon+'<input type="search" value="'+esc(ACTIVITY_SEARCH)+'" placeholder="Search item, action, amount…" oninput="setActivitySearch(this.value)">'
    +'<button class="act-search-clear'+(ACTIVITY_SEARCH?' show':'')+'" onclick="clearActivitySearch()" aria-label="Clear search">×</button></div></div>'
    +'<div class="act-feed">'+body+'</div></div>';

  const existing=el.querySelector('.act-shell');
  if(!existing){
    el.innerHTML=activityHTML;
    return;
  }

  /* v1.5.46 — keep the toolbar and search input alive while the result set
     changes. Replacing the focused input on each keystroke was unnecessary DOM
     churn and could interrupt mobile keyboard/caret behaviour. */
  const tmp=document.createElement('div');
  tmp.innerHTML=activityHTML;
  const next=tmp.firstElementChild;
  const currentOverview=existing.querySelector('.act-overview');
  const nextOverview=next&&next.querySelector('.act-overview');
  const currentFilters=existing.querySelector('.act-filters');
  const nextFilters=next&&next.querySelector('.act-filters');
  const currentFeed=existing.querySelector('.act-feed');
  const nextFeed=next&&next.querySelector('.act-feed');
  if(currentOverview&&nextOverview)currentOverview.innerHTML=nextOverview.innerHTML;
  if(currentFilters&&nextFilters)currentFilters.innerHTML=nextFilters.innerHTML;
  if(currentFeed&&nextFeed)currentFeed.innerHTML=nextFeed.innerHTML;

  const input=existing.querySelector('.act-search input');
  if(input&&document.activeElement!==input&&input.value!==ACTIVITY_SEARCH)input.value=ACTIVITY_SEARCH;
  const clear=existing.querySelector('.act-search-clear');
  if(clear)clear.classList.toggle('show',!!ACTIVITY_SEARCH);
}
});
