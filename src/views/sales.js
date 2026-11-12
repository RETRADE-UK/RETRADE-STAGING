/* sales view implementations. Shared state and stable public functions live in core. */
window.__rtRegisterView("sales", {
"renderMonth": function(){
  _syncFabVisibility();
  // Old stored routes and item-save paths used the retired listing-date key.
  if(!['date-sold','profit','price','margin'].includes(MONTH_SORT))MONTH_SORT='date-sold';
  const routeHost=document.getElementById('p-monthly');if(routeHost)routeHost.dataset.rtSalesView='detail';
  const m=SELECTED_MONTH;
  if(routeHost)routeHost.dataset.rtSalesMonth=m;
  // Session B: Monthly = sales-history view. KPIs and items list are driven by
  // sale-event attribution (dateSold / resaleDateSold), NOT by listing month.
  const stats=_performanceMonthStats(m);
  const events=getSaleEventsInMonth(m);

  // Counts for chips — sale events landing in this month.
  const cSold=events.filter(e=>!e.isReturnAdjustment).length;
  const cReturned=events.filter(e=>e.isReturnAdjustment).length;
  const cAll=events.length;

  // Filter
  let visible=events;
  if(MONTH_FILTER==='sold')visible=events.filter(e=>!e.isReturnAdjustment);
  else if(MONTH_FILTER==='returned')visible=events.filter(e=>e.isReturnAdjustment);
  // 'all' = everything

  // Sort
  visible=[...visible].sort((a,b)=>{
    if(MONTH_SORT==='profit')return (b.profit||0)-(a.profit||0);
    if(MONTH_SORT==='price')return (b.salePrice||0)-(a.salePrice||0);
    if(MONTH_SORT==='margin'){
      // null margin sinks to bottom
      const ra=a.margin==null?-Infinity:a.margin, rb=b.margin==null?-Infinity:b.margin;
      return rb-ra;
    }
    // default: date-sold desc
    const da=a.saleDate||'0', db=b.saleDate||'0';
    return db<da?-1:db>da?1:0;
  });

  window.__monthAll=visible;                                 // pre-search (v2.21.18)
  if(MONTH_SEARCH){visible=visible.filter(function(e){return _selItemMatchesSearch(e.item,MONTH_SEARCH);});}
  window.__monthItems=visible;
  const backLabel=(_monthOrigin==='grid'||_monthOrigin==='calendar-top')?'← Performance':_monthOrigin==='p-summary'?'← Dashboard':'← Back';
  const backAction=_monthOrigin==='grid'
    ?`backToMonthlyGrid(true)`
    :_monthOrigin==='calendar-top'
      ?`backToMonthlyGrid(false)`
    :_monthOrigin==='p-summary'
        ?`goToTab('summary',document.querySelector('[data-tab="summary"]'))`
      :`goToTab('${(_monthOrigin||'p-summary').replace('p-','')}',document.querySelector('[data-tab="${(_monthOrigin||'p-summary').replace('p-','')}"]'))`;

  // Refund rate display — items-based, sale-month attributed.
  // Sub-text shows 'N full · N partial' breakdown rather than 'X of Y sold'
  // (which would duplicate the sold count from the Revenue card).
  const totalRefundEvents=stats.refundedItemCount||0;
  const refundLabel=stats.refundDenom===0?'—'
    :totalRefundEvents===0?'0%'
    :stats.refundItemRate.toFixed(0)+'%';
  const refundSub=stats.refundDenom===0
    ?((stats.refundedItemCount||0)>0?((stats.refundedItemCount||0)+' return'+((stats.refundedItemCount||0)===1?'':'s')+' this month · no sales denominator'):'No sales')
    :(stats.fullRefundCount||0)+' full · '+(stats.partialOnlyCount||0)+' partial · '+stats.refundDenom+' sale'+(stats.refundDenom===1?'':'s');

  // Auto-reset stale filter: if no returns this period but filter is sold/returned, drop to 'all'
  if(cReturned===0&&(MONTH_FILTER==='sold'||MONTH_FILTER==='returned'))MONTH_FILTER='all';

  const html=`
    <div class="page-header rt-month-header">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:nowrap;min-width:0;">
        <button class="btn btn-secondary" style="padding:7px 14px;font-size:13px;flex-shrink:0;" onclick="${backAction}" aria-label="${esc(backLabel.replace('← ','Back to '))}"><span class="rt-month-back-label">${backLabel}</span><span class="rt-month-back-icon" aria-hidden="true">←</span></button>
        <div class="month-picker-wrap" id="month-picker" style="min-width:0;">
          <button type="button" class="month-picker-title" onclick="toggleMonthPicker()" aria-label="Choose sales month" aria-expanded="false" aria-controls="month-picker-list" onkeydown="if(event.key==='Escape'&amp;&amp;this.closest('.month-picker-wrap').classList.contains('open')){event.stopPropagation();toggleMonthPicker();}">
            ${keyName(m)}
            <span class="month-picker-chevron">▾</span>
          </button>
          <div class="month-picker-backdrop" onclick="toggleMonthPicker()"></div>
          <div class="month-picker-dropdown" id="month-picker-list">
            ${(()=>{
              // Session E1 — only show months that have ANY activity (sold,
              // listed, or returned events). Always include the currently
              // selected month (so users see where they are) and the live
              // current calendar month (so they can jump there even if empty).
              // Empty FYs collapse out entirely.
              const curFY=_currentFYStart();
              const liveMonthKey=currentMonthKey();
              const fySet=new Set();
              const _pickerActivity=new Map();
              const _pickerSlot=function(k){
                if(!_pickerActivity.has(k))_pickerActivity.set(k,{soldCount:0,eventCount:0});
                return _pickerActivity.get(k);
              };
              // One lightweight history pass: no fees, P&L, trip tiers or expense
              // aggregation are needed just to label the month picker.
              allDBKeys().forEach(function(src){
                const code=keyCode(src),yr=keyYear(src),mo=MONTHS.indexOf(code);
                if(mo>=0)fySet.add(mo>=3?yr:yr-1);
                (DB[src]||[]).forEach(function(i){
                  if((i.item||'').trim().toUpperCase()==='MONTH END')return;
                  _saleCycleNumbers(i).forEach(function(n){
                    const c=_saleCycleSnapshot(i,n),mk=c&&c.date?_monthKeyFromDate(c.date):null;
                    if(!mk)return;const a=_pickerSlot(mk);a.soldCount++;a.eventCount++;
                  });
                  (i.returnHistory||[]).forEach(function(r){
                    const d=_returnEventDate(r),mk=d?_monthKeyFromDate(d):null;
                    if(mk)_pickerSlot(mk).eventCount++;
                  });
                });
              });
              const fyYears=Array.from(fySet).sort((a,b)=>b-a);
              let out='';
              fyYears.forEach(fy=>{
                const keys=_fyKeys(fy);
                const isCur=fy===curFY;
                // Pre-filter the keys for this FY so we can skip empty FYs.
                const visibleEntries=keys.map(k=>{
                  const a=_pickerActivity.get(k)||{soldCount:0,eventCount:0};
                  const listedCount=(DB[k]||[]).filter(function(i){
                    return (i.item||'').trim().toUpperCase()!=='MONTH END'&&!i.scrappedAt&&!i.isReturned&&!i.dateSold&&!i.resaleSalePrice;
                  }).length;
                  const hasActivity=a.soldCount>0||listedCount>0||a.eventCount>0;
                  const isActiveSel=k===m;        // currently viewing this month
                  const isLiveMonth=k===liveMonthKey;
                  if(!hasActivity&&!isActiveSel&&!isLiveMonth)return null;
                  return {k,soldCount:a.soldCount,listedCount,hasActivity,isLiveMonth};
                }).filter(Boolean);
                if(visibleEntries.length===0)return; // skip empty FYs
                out+='<div class="month-picker-fy-header">FY '+_getFYLabelHTML(fy)+(isCur?' · Current':'')+'</div>';
                visibleEntries.forEach(({k,soldCount,listedCount,hasActivity,isLiveMonth})=>{
                  const sub=hasActivity
                    ?'<span class="month-picker-option-sub">'+soldCount+' sold · '+listedCount+' active</span>'
                    :'<span class="month-picker-option-sub" style="opacity:0.4">'+(isLiveMonth?'this month':'no activity')+'</span>';
                  out+='<div class="month-picker-option'+(k===m?' active':'')+'" onclick="pickMonth(\''+k+'\')">'
                    +MONTH_NAMES[keyCode(k)]+sub+'</div>';
                });
              });
              return out||'<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">No months yet</div>';
            })()}
          </div>
        </div>
      </div>
    </div>

    <div class="sales-kpis-v2 rt-overview">
      <div class="card kpi">
        <div class="kpi-label">Net Revenue</div>
        <div class="kpi-value num">${fmtK(stats.totalRev)}</div>
        ${stats.returnsAmt>0?`<div class="kpi-foot revenue-breakdown">${fmt(stats.grossRev)} gross − ${fmt(stats.returnsAmt)} refunds</div>`:''}
        <div class="kpi-foot">${stats.soldCount} sale${stats.soldCount!==1?'s':''}${stats.returnedCount>0?' · '+stats.returnedCount+' returned':''}</div>
      </div>
      <div class="rt-overview-side">
      <div class="card kpi kpi-realised rt-overview-primary">
        <div class="kpi-label">Net Profit</div>
        <div class="kpi-value num ${stats.netProfit<0?'negative':''}">${fmtK(stats.netProfit)}</div>
        <div class="kpi-foot">${fmtK(stats.grossProfit)} gross · ${fmtK(stats.overheads)} overheads</div>
      </div>
      <div class="card kpi">
        <div class="kpi-label">Net Margin</div>
        <div class="kpi-value num">${stats.totalRev>0?(stats.netProfit/stats.totalRev*100).toFixed(1)+'%':'—'}</div>
        <div class="kpi-foot">${stats.avgROI!==null&&stats.avgROI!==undefined?Math.round(stats.avgROI)+'% ROI'+(stats.avgDays!==null&&stats.avgDays!==undefined?' · '+stats.avgDays+'d to sell':''):(stats.avgDays!==null?stats.avgDays+'d avg to sell':stats.soldCount===0?'No sales':'—')}</div>
      </div>
      <div class="card kpi">
        <div class="kpi-label">Refund rate</div>
        <div class="kpi-value num">${refundLabel}</div>
        <div class="kpi-foot">${refundSub}</div>
      </div>
      </div>
    </div>

    <div class="rt-list-controls">
    ${cAll>0?_inlistSearchHTML('month'): ''}
    <div class="filter-row" style="gap:8px;">
      <div class="filter-chips">
        <button data-month-filter="all" class="chip chip-all ${MONTH_FILTER==='all'?'active':''}" onclick="setMonthFilter('all')">All <span class="chip-count">${cAll}</span></button>
        ${cReturned>0?`<button data-month-filter="sold" class="chip chip-sold ${MONTH_FILTER==='sold'?'active':''}" onclick="setMonthFilter('sold')">Sold <span class="chip-count">${cSold}</span></button>`:''}
        ${cReturned>0?`<button data-month-filter="returned" class="chip chip-returned ${MONTH_FILTER==='returned'?'active':''}" onclick="setMonthFilter('returned')">Returned <span class="chip-count">${cReturned}</span></button>`:''}
      </div>
      ${(()=>{
        // Mobile-only custom dropdown (replaces the native select). Coloured
        // dot per option matches the desktop chip pills' colour scheme.
        const opts=[{k:'all',l:'All',c:cAll,dot:'var(--muted)'}];
        if(cReturned>0){
          opts.push({k:'sold',l:'Sold',c:cSold,dot:'var(--green)'});
          opts.push({k:'returned',l:'Returned',c:cReturned,dot:'var(--red)'});
        }
        const cur=opts.find(o=>o.k===MONTH_FILTER)||opts[0];
        const optsHTML=opts.map(o=>`<button data-month-filter="${o.k}" class="filter-pill-dd-opt${o.k===MONTH_FILTER?' active':''}" onclick="setMonthFilter('${o.k}');closeFilterPill('mfp-filter')"><span class="filter-pill-dd-opt-dot" style="background:${o.dot}"></span>${o.l}<span class="filter-pill-dd-opt-count">${o.c}</span></button>`).join('');
        return `
          <div class="filter-pill-dd" id="mfp-filter">
            <div class="filter-pill-dd-backdrop" onclick="closeFilterPill('mfp-filter')"></div>
            <button class="filter-pill-dd-btn" onclick="event.stopPropagation();toggleFilterPill('mfp-filter')">
              <span class="fpdd-label"><span class="filter-pill-dd-opt-dot" style="background:${cur.dot}"></span>${cur.l} (${cur.c})</span>
              <span class="fpdd-chev">▾</span>
            </button>
            <div class="filter-pill-dd-menu" onclick="event.stopPropagation()">${optsHTML}</div>
          </div>`;
      })()}
      <select aria-label="Sort sales" class="sort-select" onchange="setMonthSort(this.value)">
        <option value="date-sold" ${MONTH_SORT==='date-sold'?'selected':''}>Newest sales</option>
        <option value="profit" ${MONTH_SORT==='profit'?'selected':''}>Highest profit</option>
        <option value="price" ${MONTH_SORT==='price'?'selected':''}>Highest price</option>
        <option value="margin" ${MONTH_SORT==='margin'?'selected':''}>Highest margin</option>
      </select>
    </div>

      <div class="list-toolbar${SELECTION_MODE?' bulk-selection-toolbar month-selection-toolbar':''}">
        ${SELECTION_MODE?_bulkSelectionToolbarHTML('month'):`<button class="select-toggle" ${visible.length?'':'disabled'} onclick="toggleSelectionMode()">Select</button>`}
      </div>
    </div>
    ${cAll===0?`
      <div class="empty-state">
        <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div>
        <div class="empty-state-text">No sales in ${keyName(m)}</div>
        <div class="empty-state-sub">${stats.listedCount>0?stats.listedCount+' item'+(stats.listedCount!==1?'s':'')+' listed in this month — view in <span style="color:var(--accent);cursor:pointer;font-weight:600" onclick="goToTab(\'stock\',document.querySelector(\'[data-tab=stock]\'))">Stock</span>':'Switch month or add new sales'}</div>
      </div>
    `:(visible.length===0&&!MONTH_SEARCH)?`
      <div class="empty-state">
        <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        <div class="empty-state-text">No ${MONTH_FILTER} sales</div>
        <div class="empty-state-sub"><span style="color:var(--accent);cursor:pointer;font-weight:600" onclick="setMonthFilter('all')">Show all ${cAll}</span></div>
      </div>
    `:`
      <div class="item-table" id="month-list">
        ${(()=>{window.__monthItems=visible;return visible.length?_renderMonthList(visible):(MONTH_SEARCH?'<div class="inlist-empty">No sales match \u201c'+esc(MONTH_SEARCH)+'\u201d</div>':'');})()}
      </div>
    `}
  `;
  document.getElementById('p-monthly').innerHTML=html;
  _refreshMonthSelection();
  _paintSelBar('month');
},

"renderMonthlyGrid": function(){
  const routeHost=document.getElementById('p-monthly');if(routeHost)routeHost.dataset.rtSalesView='grid';
  const now=new Date();
  const curMonthKey=currentMonthKey(); // e.g. 'APR-26'
  const currentFY=_currentFYStart();

  // Per-render analytics index. getSaleEventsInMonth() scans every item, so
  // doing that independently for every FY rollup/card/chart was quadratic-ish
  // as history grew. Build the canonical Sale-N event set once, group by month,
  // and share it with calcMonthStatsBySale() for this render.
  const _calendarAllEvents=getSaleEventsInRange(null,null);
  const _calendarEventsByMonth=new Map();
  _calendarAllEvents.forEach(function(ev){
    const mk=_monthKeyFromDate(ev.saleDate);if(!mk)return;
    if(!_calendarEventsByMonth.has(mk))_calendarEventsByMonth.set(mk,[]);
    _calendarEventsByMonth.get(mk).push(ev);
  });
  const _calendarStatsCtx={eventsByMonth:_calendarEventsByMonth,tieredTrips:calcTieredTrips(DB.trips||[])};
  const _monthStatsCache=new Map();
  const monthStats=function(k){
    if(!_monthStatsCache.has(k))_monthStatsCache.set(k,_performanceMonthStats(k,_calendarStatsCtx));
    return _monthStatsCache.get(k);
  };

  // Build set of FYs to show: previous, current, next + any FY with data
  const fySet=new Set([currentFY-1, currentFY]);
  allDBKeys().forEach(function(k){
    const code=keyCode(k); const yr=keyYear(k);
    const mo=MONTHS.indexOf(code);
    if(mo<0)return;
    const fy=mo>=3?yr:yr-1;
    if(fy<=currentFY)fySet.add(fy);
  });
  // Fix B (B1): also cover the FY of every SALE/RETURN event month, so a sale
  // dated in an FY no purchase touched is not dropped from the rollups.
  _saleEventMonthKeys().forEach(function(mk){
    const mo=MONTHS.indexOf(keyCode(mk)); if(mo<0)return;
    const yr=keyYear(mk),fy=mo>=3?yr:yr-1;
    if(fy<=currentFY)fySet.add(fy);
  });
  (DB.expenses||[]).concat(DB.trips||[],allItems().map(function(i){return {date:i.scrappedAt};})).forEach(function(e){
    const k=e.date&&_monthKeyFromDate(String(e.date).slice(0,10));if(!k)return;
    const year=keyYear(k)-(MONTHS.indexOf(keyCode(k))<3?1:0);if(year<=currentFY)fySet.add(year);
  });
  const fyYears=Array.from(fySet).sort(function(a,b){return b-a;}).filter(function(fy){
    if(fy===currentFY)return true;
    return _fyKeys(fy).some(function(k){
      const ms=monthStats(k);
      return ms.soldCount>0||ms.eventCount>0||ms.hasCosts;
    });
  }); // newest first, data-bearing years only

  let html='<div style="padding-bottom:80px;">';
  // Period selector lives in the page header (right side), mirroring the
  // Dashboard. .page-header is flex/space-between, so it right-aligns.
  html+='<div class="page-header rt-inline-header rt-performance-header"><div><div class="page-title">Performance</div><div class="page-subtitle">Sales performance, returns and monthly history.</div></div>'
    +'<div class="page-actions"><button class="btn btn-secondary" style="padding:7px 10px;font-size:12px;white-space:nowrap" onclick="goToTab(\'returns\')">Returns</button>'+_monthlyPeriodSelectHTML()+'</div>'
    +'</div>';
  html+=_monthlyNetProfitChartHTML();

  fyYears.forEach(function(fy){
    const months=_fyKeys(fy); // full Apr-Mar ordered list of 'MMM-YY' keys
    const isCurrentFY=fy===currentFY;
    // One owner for disclosure defaults: current FY open, history closed.
    const defaultCollapsed=fy!==currentFY;
    const isCollapsed=_fyCollapsed[fy]!==undefined?_fyCollapsed[fy]:defaultCollapsed;

    const fyRange=_monthlyPeriodResolve('fy:'+fy);
    monthStats(months[0]);
    const fySummary=_calendarStatsCtx.performanceFYs.get(fy).summary;
    const fyProfit=fySummary.netProfit,fySold=fySummary.pnl.soldCount||0;
    const fyNetMargin=fySummary.netMargin;
    const fyLabel=_getFYLabelHTML(fy);
    const profitColor=fyProfit>0?'var(--green)':fyProfit<0?'var(--red)':'var(--muted)';
    const chevronRot=isCollapsed?'-90deg':'0deg';
    const borderCol='var(--border)';
    const labelCol=isCurrentFY?'var(--accent)':'var(--text)';
    const currentBadge=isCurrentFY?'<span class="fy-current-badge" style="font-size:10px;font-weight:700;background:var(--accent);color:#000;border-radius:4px;padding:2px 7px;letter-spacing:0.5px;flex-shrink:0;">CURRENT</span>':'';
    const netMarginSpan=fyNetMargin!==null?'<span data-fy-net-margin style="color:var(--text-secondary)" title="Net profit divided by net revenue, after refunds and all costs">'+fyNetMargin.toFixed(1)+'% net margin</span>':'';

    let gridHTML='';
    {
      // Past FYs: show most-recent month first (MAR→APR). Current FY: chronological (APR→now).
      const displayMonths=isCurrentFY?months:[...months].reverse();
      // Keep the current month visible for orientation; omit empty months
      // so the Yearly view stays compact on mobile and desktop.
      const visibleMonths=displayMonths.filter(function(k){
        const ms=monthStats(k);
        const hasSales=ms.soldCount>0||ms.eventCount>0;
        return k===curMonthKey||hasSales||ms.hasCosts;
      });
      const cards=visibleMonths.map(function(k){
        // Session B: card profit and sold count come from sale-attribution,
        // but listedCount stays as listing-month inventory (kept in the bySale
        // helper for this exact use).
        const ms=monthStats(k);
        const hasItems=(DB[k]||[]).length>0||ms.soldCount>0||ms.eventCount>0||ms.hasCosts;
        const hasActivity=ms.soldCount>0||ms.listedCount>0||ms.eventCount>0;
        const isCurrent=k===curMonthKey;
        // Truly empty: no items at all AND no sale events AND not current month
        const trulyEmpty=!hasItems&&!isCurrent;
        // Has activity but 0 net sold (could still have returned events)
        const hasListedOnly=hasItems&&ms.eventCount===0&&!ms.hasCosts;
        const borderStyle=isCurrent?'border-color:var(--accent);':'';
        let cardContent;
        if(trulyEmpty){
          cardContent='<div class="mval nil" style="font-size:16px;">—</div>';
        } else if(hasListedOnly){
          cardContent='<div class="mval nil">—</div>';
        } else {
          const profVal=ms.netProfit>0?'pos':ms.netProfit<0?'neg':'nil';
          cardContent='<div class="mval '+profVal+'" data-month-net-profit="'+k+'" title="Net profit after all costs">'+fmt(ms.netProfit)+'</div>';
        }
        const monthLabel=MONTH_NAMES[keyCode(k)]; // e.g. 'April'
        return '<div class="mcard'+(trulyEmpty?' mcard-empty':'')+'"'+(isCurrent?' aria-current="date"':'')+' style="'+borderStyle+'" onclick="goToMonth(\''+k+'\')">'
          +'<div class="mcard-body-left">'
          +'<div style="display:flex;align-items:center;gap:6px;">'
          +'<div class="mname" style="margin-bottom:0">'+monthLabel+'</div></div>'
          +'<div class="msub">'+
            (trulyEmpty?'No items yet · tap to add':
             hasListedOnly?'0 sold · '+ms.listedCount+' active':
             ms.soldCount+' sold · '+ms.listedCount+' active'+(ms.avgDays!==null?' · '+ms.avgDays+'d avg':''))
          +'</div>'
          +'</div>'
          +'<div class="mcard-body-right">'
          +cardContent
          +'</div>'
          +'</div>';
      }).join('');
      // Keep cards mounted even while collapsed. Opening a year must not
      // replace the page/chart and let the browser clamp the document scroll.
      gridHTML='<div class="mgrid" data-fy-grid="'+fy+'" style="margin-top:10px;'+(isCollapsed?'display:none;':'')+'">'+cards+'</div>';
    }

    html+='<div class="fy-section" data-fy-section="'+fy+'" style="margin-bottom:'+(isCollapsed?'12px':'20px')+'">'
      +'<div role="button" tabindex="0" aria-expanded="'+(!isCollapsed)+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();toggleFYSection('+fy+');}" onclick="toggleFYSection('+fy+')" style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:var(--surface);border:1.5px solid '+borderCol+';border-radius:10px;cursor:pointer;user-select:none;transition:border-color 0.15s;">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;min-width:0;">'
      +'<span style="font-size:13px;font-weight:700;letter-spacing:0.02em;color:'+labelCol+';white-space:nowrap;">FY '+fyLabel+'</span>'
      +currentBadge+'</div>'
      +'<div style="display:flex;align-items:center;gap:20px;">'
      +'<div style="display:flex;gap:16px;align-items:center;font-size:13px;">'
      +'<span class="fy-stat-hide" style="color:var(--text-secondary)">'+fySold+' sold</span>'
      +(netMarginSpan?netMarginSpan.replace('<span ','<span class="fy-stat-hide" '):'')
      +'<span data-fy-net-profit title="Net profit after all costs" style="font-weight:700;color:'+profitColor+'">'+fmt(fyProfit)+'</span>'
      +'</div>'
      +'<span data-fy-chevron="'+fy+'" style="font-size:14px;color:var(--muted);transition:transform 0.2s;display:inline-block;transform:rotate('+chevronRot+');">▾</span>'
      +'</div></div>'
      +gridHTML
      +'</div>';
  });

  html+='</div>';
  document.getElementById('p-monthly').innerHTML=html;
  // Render with the exact same SVG engine, axes, grid, spacing, typography,
  // scrub tooltip and responsive geometry as the dashboard chart.
  renderMonthlyProfitabilityChart(monthStats);
  // Scroll ONLY when an explicit target month was requested (i.e. returning
  // from that month's detail view). Everything else — period changes, FY
  // collapse toggles — leaves the page exactly where the user left it.
  // Instant, not smooth: smooth made the page visibly travel from the top.
  const _target=_monthlyScrollToKey;
  _monthlyScrollToKey=null;
  if(_target){
    requestAnimationFrame(function(){
      const el=document.querySelector('#p-monthly .mcard[onclick*="\''+_target+'\'"]');
      if(el)el.scrollIntoView({block:'center',behavior:'auto'});
    });
  }
},

"renderMonthlyMoneyFlow": function(){
  const host=document.getElementById('monthly-money-flow');
  if(!host)return;
  const r=_monthlyPeriodResolve(MONTHLY_PERIOD);
  let summary;
  try{ summary=_performancePeriodSummary(r.from,r.to,r.label); }
  catch(e){ host.innerHTML='<div class="mf-foot">Unable to build P&amp;L summary.</div>'; return; }

  const p=summary.pnl;
  const grossRevenue=summary.grossRevenue;
  const customerRefunds=summary.customerRefunds;
  const netRevenue=summary.netRevenue;
  const cogs=Number(p.cogs)||0;
  const selling=Number((p.selling&&p.selling.total))||0;
  // p.selling.total includes the customer refund itself plus any return postage.
  // Pull only the customer refund out here so it is not double-counted; return
  // postage and all other selling costs remain in this line and reconciliation.
  const otherSelling=+(selling-customerRefunds).toFixed(2);
  const overheads=Number((p.overheads&&p.overheads.total))||0;
  const net=summary.netProfit;

  if(grossRevenue===0&&customerRefunds===0&&cogs===0&&otherSelling===0&&overheads===0&&net===0){
    host.innerHTML='<div class="mf-foot">No sales in '+esc(r.label)+'. Once you log sales, this will bridge gross revenue to net profit.</div>';
    return;
  }
  const pct=function(v){return grossRevenue>0?Math.max(0,Math.min(100,(Math.abs(v)/grossRevenue)*100)):0;};
  const row=function(label,val,colour,cls){
    return '<div class="mf-row'+(cls?' '+cls:'')+'">'
      +'<div class="mf-top"><span class="mf-label">'+esc(label)+'</span><span class="mf-val">'+fmt(val)+'</span></div>'
      +'<div class="mf-bar"><span class="mf-fill" style="width:'+pct(val).toFixed(1)+'%;background:'+colour+'"></span></div>'
      +'</div>';
  };
  const netColour=net>=0?'var(--green)':'var(--red)';
  const margin=summary.netMargin;
  host.innerHTML=
     row('Gross revenue',grossRevenue,'var(--state-listed)','mf-key')
    +(customerRefunds>0?row('− Refunds',customerRefunds,'var(--red)','mf-deduction'):'')
    +row('= Net revenue',netRevenue,'var(--state-listed)','mf-key mf-net-revenue')
    +row('− Cost of goods',cogs,'var(--red)','mf-deduction')
    +row('− Selling costs',otherSelling,'var(--red)','mf-deduction')
    +row('− Overheads',overheads,'var(--warn)','mf-deduction')
    +'<div class="mf-row mf-net">'
      +'<div class="mf-top"><span class="mf-label">Net profit</span><span class="mf-val" style="color:'+netColour+'">'+fmt(net)+'</span></div>'
      +'<div class="mf-bar"><span class="mf-fill" style="width:'+pct(net).toFixed(1)+'%;background:'+netColour+'"></span></div>'
    +'</div>'
    +'<div class="mf-foot">'+esc(r.label)+' · '+(p.soldCount||0)+' sold'+(margin!==null?' · '+margin.toFixed(1)+'% net margin':'')+(grossRevenue>0?'. Bars are % of gross revenue.':'. No gross sales in this period.')+'</div>';
},

"renderMonthlyProfitabilityChart": function(statsForMonth){
  const svg=document.getElementById('monthly-profitability-svg');
  if(!svg)return;
  // The breakdown determines the shared card height; measure after it is populated.
  renderMonthlyMoneyFlow();
  const _box=svg.getBoundingClientRect();
  const _W=Math.max(320,Math.round(_box.width)||800);
  const _H=Math.max(200,Math.round(_box.height)||360);
  const per=_monthlyPeriodResolve(MONTHLY_PERIOD);
  const now=new Date(),curStart=new Date(now.getFullYear(),now.getMonth(),1);
  let keys=per.keys.filter(function(k){
    const mo=MONTHS.indexOf(keyCode(k));
    return mo>=0&&new Date(keyYear(k),mo,1)<=curStart;
  });
  if(!keys.length){
    svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" font-size="13" fill="var(--text-tertiary)" font-family="var(--font-body)">No completed months in this period yet</text>';
    return;
  }
  const showYear=keys.length>12;
  const labels=[],netRevenue=[],grossProfit=[],netProfit=[],refunds=[],refundCounts=[];
  const monthContext={};
  keys.forEach(function(k){
    const ms=(typeof statsForMonth==='function')?statsForMonth(k):_performanceMonthStats(k,monthContext);
    const short=MONTH_NAMES[keyCode(k)].slice(0,3);
    labels.push(showYear?short+' '+String(keyYear(k)).slice(-2):short);
    netRevenue.push(Number(ms.totalRev)||0);
    grossProfit.push(Number(ms.grossProfit)||0);
    netProfit.push(Number(ms.netProfit)||0);
    refunds.push(Number(ms.returnsAmt)||0);
    refundCounts.push(Number(ms.returnedCount)||0);
  });
  const currentIsLast=keys[keys.length-1]===currentMonthKey();
  const hasRefunds=refunds.some(function(v){return Number(v)>0;});
  const refundLegend=document.getElementById('monthly-refund-legend');
  if(refundLegend){
    refundLegend.style.display=hasRefunds?'inline-flex':'none';
    if(hasRefunds)refundLegend.innerHTML='<span class="monthly-legend-refund-line"></span>Refunds';
  }

  _renderChartInto(svg,labels,netRevenue,netProfit,[],{
    W:_W,H:_H,
    pad:{t:18,r:16,b:44,l:60},
    fontSize:13,
    yTicks:4,
    maxXLabels:_W<520?6:(keys.length>18?12:keys.length),
    profitDotR:_W<520?2.8:2.6,revDotR:_W<520?3.0:2.8,
    profitStroke:_W<520?2.4:2.1,revStroke:_W<520?2.4:2.1,scrubDotR:_W<520?5:4.5,
    maxDotsN:14,
    primaryColor:'var(--state-listed)',
    secondaryColor:'var(--profit)',
    primaryLabel:'Net Revenue',
    secondaryLabel:'Net Profit',
    primaryBars:false,
    primaryBarMaxW:_W<520?24:34,
    showArea:true,
    fillData:netProfit,
    fillColor:'var(--profit)',
    fillOpacity:0.24,
    extraTooltipData:grossProfit,
    extraTooltipLabel:'Gross Profit',
    extraTooltipColor:'var(--text-secondary)',
    tertiaryData:hasRefunds?refunds:null,
    tertiaryCounts:hasRefunds?refundCounts:null,
    tertiaryColor:'var(--red)',
    tertiaryLabel:'Refunds',
    tertiaryStroke:1.45,
    tertiaryLineOpacity:0.58,
    tertiaryDotR:_W<520?2.6:2.4,
    tertiaryDotOpacity:0.78,
    tertiaryMarkersOnly:false,
    tertiaryAlwaysDots:true,
    tertiaryEvents:false,
    drawKey:'monthly:'+MONTHLY_PERIOD,
    gradientId:'rt-monthly-profit-fill',
    partialLast:currentIsLast
  });
}
});
