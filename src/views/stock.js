/* stock view implementations. Shared state and stable public functions live in core. */
window.__rtRegisterView("stock", {
"_renderStockCore": function(){
  const today=new Date().toISOString().split('T')[0];
  // v1.01 — Inventory means physical stock on hand. A returned unit is its own
  // operational queue; it is never silently folded back into Unlisted.
  // Active Job Lot members have exactly one operational owner: the Job Lot.
  // They remain auditable as child items but are hidden from individual queues.
  const _activeLotsNow=_jobLotSchemaAvailable?_activeJobLots():[];
  const _activeLotMemberIds=new Set();
  _activeLotsNow.forEach(function(l){_jobLotMembers(l.id,false).forEach(function(x){_activeLotMemberIds.add(x.item.id);});});
  let allListed=[], allStock=[], allReturned=[], allRemoved=[];
  allDBKeys().forEach(k=>(DB[k]||[]).forEach(i=>{
    if((i.item||'').trim().toUpperCase()==='MONTH END')return;
    const row={...i,month:k};
    if(i.scrappedAt){ allRemoved.push(row); return; }
    if(_activeLotMemberIds.has(i.id))return;
    if(i.isReturned||i.state==='returned'){ allReturned.push(row); return; }
    if(i.state==='sourced'&&!i.dateSold&&!i.resaleSalePrice){ allStock.push(row); return; }
    if(!i.dateSold&&!i.resaleSalePrice){ allListed.push(row); }
  }));
  const _listedLots=_activeLotsNow.filter(function(l){return l.status==='listed';});
  const _buildingLots=_activeLotsNow.filter(function(l){return l.status==='building';});
  const allOnHand=[...allListed,...allStock,...allReturned];
  const isAllView=STOCK_STATE_FILTER==='all';
  const isStockOnly=STOCK_STATE_FILTER==='sourced'; // UI label: Unlisted
  const isListedOnly=STOCK_STATE_FILTER==='listed';
  const isReturnedOnly=STOCK_STATE_FILTER==='returned';
  let pop=isAllView?allOnHand:(isStockOnly?allStock:(isReturnedOnly?allReturned:allListed));
  let visibleLots=isAllView?_activeLotsNow:(isStockOnly?_buildingLots:(isListedOnly?_listedLots:[]));
  const cAll=pop.length+visibleLots.length;
  const _listedAgeEntities=allListed.concat(_listedLots.map(_jobLotPseudo));
  const _unlistedAgeEntities=allStock.concat(_buildingLots.map(_jobLotPseudo));
  const cAllListed=_listedAgeEntities.length, cAllStock=_unlistedAgeEntities.length, cAllReturned=allReturned.length;
  const cAllRemoved=allRemoved.length;
  const _stockSeg=(function(){
    const bk=[
      {key:'all',label:'All',count:allOnHand.length+_activeLotsNow.length},
      {key:'listed',label:'Listed',count:cAllListed},
      {key:'sourced',label:'Unlisted',count:cAllStock},
      {key:'returned',label:'Returned',count:cAllReturned}
    ];
    return '<div class="segmented stock-state-seg">'+bk.map(function(b){return '<button data-stock-state="'+b.key+'" class="'+(STOCK_STATE_FILTER===b.key?'is-active':'')+'" onclick="setStockStateFilter(\''+b.key+'\')">'+b.label+'<span class="count">'+b.count+'</span></button>';}).join('')+'</div>';
  })();
  const cStale=_listedAgeEntities.filter(i=>{const d=i.dateListed;return d&&daysBetween(d,today)>=90;}).length;

  // Sourced age buckets: New 0–3d · List soon 4–7d · Overdue 8–14d · Stagnant 15d+
  // Used for both the filter chips and the per-row colour dot.
  const _sourcedBucket=function(i){
    const d=_daysInStock(i);
    if(d===null)return 'new';
    if(d<=3)return 'new';
    if(d<=7)return 'soon';
    if(d<=14)return 'overdue';
    return 'stagnant';
  }
  const _sourcedBucketCol={new:'var(--green)',soon:'var(--blue)',overdue:'var(--warn)',stagnant:'var(--red)'};
  const _sourcedBucketLabel={new:'New',soon:'List soon',overdue:'Overdue',stagnant:'Stagnant'};

  let items=pop;
  if(isStockOnly){
    // Unlisted-age filter (backend state remains `sourced`).
    if(STOCK_SOURCED_FILTER!=='all') items=pop.filter(i=>_sourcedBucket(i)===STOCK_SOURCED_FILTER);
  } else if(isListedOnly) {
    // E3 P2 #10 — guard against missing dateListed
    if(STOCK_FILTER==='stale')items=pop.filter(i=>{const d=i.dateListed;return d&&daysBetween(d,today)>=90;});
    else if(STOCK_FILTER==='slow')items=pop.filter(i=>{const d=i.dateListed;if(!d)return false;const n=daysBetween(d,today);return n>60&&n<90;});
    else if(STOCK_FILTER==='maturing')items=pop.filter(i=>{if(!i.dateListed)return false;const d=daysBetween(i.dateListed,today);return d>30&&d<=60;});
    else if(STOCK_FILTER==='fresh')items=pop.filter(i=>i.dateListed&&daysBetween(i.dateListed,today)<=30);
  }
  // Apply the same operational age/search filters to Job Lots. A lot counts as
  // one saleable inventory unit while its card shows the physical child count.
  if(isStockOnly&&STOCK_SOURCED_FILTER!=='all'){
    visibleLots=visibleLots.filter(function(l){return _sourcedBucket(_jobLotPseudo(l))===STOCK_SOURCED_FILTER;});
  }else if(isListedOnly&&STOCK_FILTER!=='all'){
    visibleLots=visibleLots.filter(function(l){
      if(!l.dateListed)return false;const n=daysBetween(l.dateListed,today);
      if(STOCK_FILTER==='fresh')return n<=30;
      if(STOCK_FILTER==='maturing')return n>30&&n<=60;
      if(STOCK_FILTER==='slow')return n>60&&n<90;
      if(STOCK_FILTER==='stale')return n>=90;
      return true;
    });
  }
  if(STOCK_SEARCH){
    const _jq=String(STOCK_SEARCH).trim().toLowerCase();
    if(_jq)visibleLots=visibleLots.filter(function(l){return _jobLotSearchText(l).indexOf(_jq)!==-1;});
  }
  // Sort comparator — profit/roi/price for listed; cost-desc/days for sourced.
  const sortCmp=(a,b)=>{
    if(STOCK_SORT==='profit')return(calcEstProfit(b)||0)-(calcEstProfit(a)||0);
    if(STOCK_SORT==='roi'){
      const investA=(a.costPrice||0)+(a.shippingCost||0)+(a.packagingCost||0)+calcPartsCost(a);
      const investB=(b.costPrice||0)+(b.shippingCost||0)+(b.packagingCost||0)+calcPartsCost(b);
      const roiA=investA>0?((calcEstProfit(a)||0)/investA)*100:-Infinity;
      const roiB=investB>0?((calcEstProfit(b)||0)/investB)*100:-Infinity;
      return roiB-roiA;
    }
    if(STOCK_SORT==='price')return(b.salePrice||0)-(a.salePrice||0);
    if(STOCK_SORT==='cost-desc')return(b.costPrice||0)-(a.costPrice||0); // highest cost first
    // day sorts use the meaningful date for the active queue: latest full-return
    // date for Returned, listing-cycle date for Listed, sourcing date for Unlisted.
    const _sortDate=function(x){
      if(x.isReturned||x.state==='returned'){
        const r=(x.returnHistory||[]).slice().reverse().find(function(y){return y.type==='full_seller'||y.type==='full_ebay';});
        return (r&&r.loggedAt)||x.dateSold||x.dateSourced||x.dateListed;
      }
      return _effectiveListDate(x)||x.dateSourced||x.dateListed;
    };
    const aDate=_sortDate(a), bDate=_sortDate(b);
    if(STOCK_SORT==='days-asc')return daysBetween(aDate,today)>daysBetween(bDate,today)?1:-1;
    return daysBetween(aDate,today)<daysBetween(bDate,today)?1:-1; // days-desc / legacy
  };
  items=[...items].sort(sortCmp);
  // v2.21.18 — in-list search feeds the same totals engine as selection.
  window.__stockAll=items;                                   // pre-search filtered+sorted
  if(STOCK_SEARCH){items=items.filter(function(i){return _selItemMatchesSearch(i,STOCK_SEARCH);});}
  window.__stockItems=items;
  const _useGroup=STOCK_GROUPED&&!STOCK_SEARCH&&isListedOnly;              // search flattens the grouped view
  // Build listing-month groups when grouped mode is on. Iterate FY keys in
  // chronological-newest-first order so users see latest stock first.
  let groupedHTML='';
  if(_useGroup){
    // Use the same FY ordering as Monthly grid (newest FY first, within FY: most recent month first).
    const monthOrder=allDBKeys();
    const monthSet=new Set(items.map(i=>i.month));
    const orderedKeys=monthOrder.filter(k=>monthSet.has(k));
    // Sort orderedKeys by listing date descending (most recent month first)
    orderedKeys.sort((a,b)=>{
      const ya=keyYear(a), yb=keyYear(b);
      if(ya!==yb)return yb-ya;
      const ma=MONTHS.indexOf(keyCode(a)), mb=MONTHS.indexOf(keyCode(b));
      return mb-ma;
    });
    orderedKeys.forEach(k=>{
      const groupItems=items.filter(i=>i.month===k).sort(sortCmp);
      if(groupItems.length===0)return;
      const groupValue=groupItems.reduce((s,i)=>s+(i.salePrice||0),0);
      // E3 — use calcEstProfit not calcGrossProfit so grouped stock totals
      // match the row-level "est. profit" semantics (lifetime-if-sold for
      // relisted items, ordinary gross for everything else).
      const groupProfit=groupItems.reduce((s,i)=>s+(calcEstProfit(i)||0),0);
      const groupStale=groupItems.filter(i=>i.dateListed&&daysBetween(i.dateListed,today)>=90).length;
      const isCollapsed=STOCK_COLLAPSED.has(k);
      groupedHTML+='<div class="stock-group'+(isCollapsed?' collapsed':'')+'" id="stock-group-'+k+'" style="margin-bottom:18px;">'
        +'<div class="stock-group-header" onclick="toggleStockGroup(\''+k+'\')" style="padding:10px 12px;background:var(--surface2);border-radius:'+(isCollapsed?'8px':'8px 8px 0 0')+';border:1px solid var(--border);'+(isCollapsed?'':'border-bottom:none;')+'cursor:pointer;">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">'
        +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;">'
        +'<span class="stock-group-toggle" style="font-size:12px;color:var(--muted);transition:transform 0.2s;display:inline-block;'+(isCollapsed?'transform:rotate(-90deg)':'')+'">&#9662;</span>'
        +'<span style="font-size:12px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;">'+keyName(k)+'</span>'
        +'<span style="font-size:12px;color:var(--text-secondary);white-space:nowrap;">'+groupItems.length+' active</span>'
        +'</div>'
        +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
        +'<span style="font-size:12px;color:var(--text-secondary);">'+fmt(groupValue)+' asking</span>'
        +'<span style="font-size:12px;color:var(--green);font-weight:600;">'+fmt(groupProfit)+' profit</span>'
        +(groupStale>0?'<span style="font-size:11px;font-weight:600;color:var(--warn);">'+groupStale+' slow</span>':'')
        +'</div>'
        +'</div>'
        +'</div>'
        +'<div class="item-table stock-group-body'+(isCollapsed?' is-collapsed':'')+'" style="border-radius:0 0 8px 8px;border:1px solid var(--border);border-top:none;">'
        +groupItems.map(i=>renderStockRow(i.month,i)).join('')
        +'</div></div>';
    });
  }

  // Avg listing age (listed items only — sourced items have no dateListed)
  const _datedListedAgeEntities=_listedAgeEntities.filter(function(i){return !!i.dateListed;});
  const avgListingAge=_datedListedAgeEntities.length?Math.round(_datedListedAgeEntities.reduce((s,i)=>s+daysBetween(i.dateListed,today),0)/_datedListedAgeEntities.length):0;
  // Capital tied up in 90d+ listings, including listed Job Lots as one unit.
  const capitalStale=_datedListedAgeEntities.filter(i=>daysBetween(i.dateListed,today)>=90).reduce((s,i)=>s+(i.salePrice||0),0);
  // Avg days to list — rolling historical avg across items that have transitioned
  const ttlValues=[];
  allDBKeys().forEach(k=>(DB[k]||[]).forEach(i=>{
    if((i.item||'').trim().toUpperCase()==='MONTH END')return;
    if(i.state==='sourced')return;
    const t=_timeToList(i);
    if(t!==null) ttlValues.push(t);
  }));
  const avgDaysToList=ttlValues.length?Math.round(ttlValues.reduce((s,v)=>s+v,0)/ttlValues.length):null;
  // Longest sitting sourced item
  let longestSittingDays=null,longestSittingName='';
  _unlistedAgeEntities.forEach(i=>{
    const d=_daysInStock(i);
    if(d!==null&&(longestSittingDays===null||d>longestSittingDays)){longestSittingDays=d;longestSittingName=(i.item||'Untitled').trim();}
  });
  const longestTrunc=longestSittingName.length>18?longestSittingName.slice(0,17)+'…':longestSittingName;
  // Aging buckets — always from allListed; chips hidden on sourced-only filter
  const ageBuckets={fresh:0,maturing:0,slow:0,stale:0};
  const ageBucketsValue={fresh:0,maturing:0,slow:0,stale:0};
  _listedAgeEntities.forEach(i=>{
    if(!i.dateListed)return;
    const d=daysBetween(i.dateListed,today);
    const v=i.salePrice||0;
    if(d<=30){ageBuckets.fresh++;ageBucketsValue.fresh+=v;}
    else if(d<=60){ageBuckets.maturing++;ageBucketsValue.maturing+=v;}
    else if(d<90){ageBuckets.slow++;ageBucketsValue.slow+=v;}
    else{ageBuckets.stale++;ageBucketsValue.stale+=v;}
  });
  const cMaturing=ageBuckets.maturing,cSlow=ageBuckets.slow;

  // Est. potential — sum of real net (est − fee − cost − parts − median fulfilment drag) for sourced items with an estimate
  let estPotential=0;
  let cWithEstimate=0;
  allStock.forEach(function(i){ const _n=_estPotentialNet(i); if(_n!=null){estPotential+=_n;cWithEstimate++;} });
  _buildingLots.forEach(function(l){const _n=_jobLotEstimatedNetProfit(l);if(_n!=null){estPotential+=_n;cWithEstimate++;}});

  // Value KPI: sourced items contribute cost; listed items contribute asking price
  let totalValue=0;
  pop.forEach(i=>{ if(i.state==='sourced'||i.isReturned)totalValue+=(i.costPrice||0); else totalValue+=(i.salePrice||0); }); // returned-and-back valued at COST (matches _cashStockTied)
  const potentialProfit=pop.reduce((s,i)=>s+(calcEstProfit(i)||0),0);
  const avgAsking=allListed.length?(allListed.reduce((s,i)=>s+(i.salePrice||0),0)/allListed.length):0;

  // v2.20.5 — companion numbers so each KPI card carries a second metric (cost / ROI / velocity)
  const _capCost=function(i){return (Number(i.costPrice)||0)+(typeof calcPartsCost==='function'?(Number(calcPartsCost(i))||0):0);};
  const listedCost=+(allListed.reduce(function(s,i){return s+_capCost(i);},0)+_listedLots.reduce(function(s,l){return s+_jobLotCost(l.id,false);},0)).toFixed(2);
  const sourcedCost=+(allStock.reduce(function(s,i){return s+_capCost(i);},0)+_buildingLots.reduce(function(s,l){return s+_jobLotCost(l.id,false);},0)).toFixed(2);
  const returnedCost=+allReturned.reduce(function(s,i){return s+_capCost(i);},0).toFixed(2);
  const listedAsking=+(allListed.reduce(function(s,i){return s+(Number(i.salePrice)||0);},0)+_listedLots.reduce(function(s,l){return s+(Number(l.salePrice)||0);},0)).toFixed(2);
  const listedPotentialProfit=+(allListed.reduce(function(s,i){return s+(calcEstProfit(i)||0);},0)+_listedLots.reduce(function(s,l){return s+(_jobLotEstimatedNetProfit(l)||0);},0)).toFixed(2);
  const allPotentialProfit=+(listedPotentialProfit+estPotential).toFixed(2);
  const listedMarkup=listedCost>0?Math.round((listedAsking/listedCost-1)*100):0;
  const listedROI=listedCost>0?Math.round(listedPotentialProfit/listedCost*100):null;
  const sourcedROI=sourcedCost>0?Math.round(estPotential/sourcedCost*100):null;
  const _agedListed=allListed.filter(function(i){const d=i.dateListed;return d&&daysBetween(d,today)>=90;});
  const _agedListedLots=_listedLots.filter(l=>l.dateListed&&daysBetween(l.dateListed,today)>=90);
  const agedCost=+(_agedListed.reduce(function(s,i){return s+_capCost(i);},0)+_agedListedLots.reduce((sum,l)=>sum+_jobLotCost(l.id),0)).toFixed(2);
  const agedCount=_agedListed.length+_agedListedLots.length;
  let _stStats={}; try{ _stStats=calcYearlyStats('all')||{}; }catch(e){}
  const stSellThrough=(_stStats.sellThrough!=null)?Math.round(_stStats.sellThrough):null;
  const stAvgDays=(_stStats.avgDays!=null)?_stStats.avgDays:null;
  let oldestReturnDays=null,oldestReturnName='';
  allReturned.forEach(function(i){
    const r=(i.returnHistory||[]).slice().reverse().find(function(x){return x.type==='full_seller'||x.type==='full_ebay';});
    const d=r&&r.loggedAt?daysBetween(r.loggedAt,today):null;
    if(d!==null&&(oldestReturnDays===null||d>oldestReturnDays)){oldestReturnDays=d;oldestReturnName=(i.item||'Untitled').trim();}
  });
  const oldestReturnTrunc=oldestReturnName.length>18?oldestReturnName.slice(0,17)+'…':oldestReturnName;

  // Build 4 KPI cards based on active filter
  let kpis;
  if(isStockOnly){
    kpis=[
      {cls:'b',label:'Capital tied up',  val:fmt(sourcedCost), sub:'Cost of unlisted stock on hand'},
      {cls:'', label:'Items to list',    val:cAllStock?String(cAllStock):'—', sub:cAllStock+' inventory unit'+(cAllStock===1?'':'s')+' waiting'},
      {cls:'g',label:'Est. potential',   val:cWithEstimate?fmt(estPotential):'—', sub:cWithEstimate?((sourcedROI!=null?sourcedROI+'% ROI · ':'')+cWithEstimate+' with estimate'):'No estimates set yet'},
      {cls:'p',label:'Longest sitting',  val:longestSittingDays!==null?longestSittingDays+'d':'—', sub:longestSittingDays!==null?longestTrunc:'Nothing unlisted'}
    ];
  } else if(isReturnedOnly){
    kpis=[
      {cls:'r',label:'Returned items',   val:String(allReturned.length), sub:'Back in hand · action needed'},
      {cls:'b',label:'Capital tied up',  val:fmt(returnedCost), sub:'Cost basis currently in returned stock'},
      {cls:'p',label:'Oldest return',    val:oldestReturnDays!==null?oldestReturnDays+'d':'—', sub:oldestReturnDays!==null?oldestReturnTrunc:'No returned stock'},
      {cls:'', label:'Next action',      val:allReturned.length?'Review':'—', sub:allReturned.length?'Relist, job lot, supplier return or dispose':'Nothing waiting'}
    ];
  } else if(isListedOnly){
    kpis=[
      {cls:'b',label:'Capital in<br>listings', val:fmtK(listedCost), sub:fmtK(listedAsking)+' asking'+(listedMarkup>0?' · '+listedMarkup+'% markup':'')},
      {cls:'g',label:'Estimated<br>profit',    val:fmtK(listedPotentialProfit), sub:listedROI!=null?listedROI+'% ROI if sold':'If every item sells'},
      {cls:'p',label:'Aged<br>capital',        val:agedCount>0?fmtK(agedCost):'£0', sub:agedCount>0?agedCount+' of '+cAllListed+' stale (90d+)':(cAllListed?'None stale — all moving':'—'), click:cStale>0?"openDashboardStock('stale')":''},
      {cls:'', label:'Sell-<br>through',       val:stSellThrough!=null?stSellThrough+'%':'—', sub:stAvgDays!=null?stAvgDays+'d avg to sell':'Listed that sold'}
    ];
  } else {
    const totalCapital=listedCost+sourcedCost+returnedCost;
    const attentionCapital=sourcedCost+returnedCost+agedCost;
    kpis=[
      {cls:'b',label:'Capital tied up',  val:fmtK(totalCapital), sub:'Purchase and parts costs across all stock'},
      {cls:'g',label:'Potential profit', val:fmtK(allPotentialProfit), sub:'Listed + estimated unlisted · after partner shares'},
      {cls:'', label:'Listed asking',    val:fmtK(listedAsking), sub:'Asking value currently on sale'},
      {cls:'p',label:'Needs attention',  val:fmtK(attentionCapital), sub:'Capital in unlisted, returned or 90d+ listings'}
    ];
  }
  const primaryKpi=isListedOnly||isAllView?1:0;
  const kpiCards=kpis.map((k,n)=>'<div class="card kpi'+(n===primaryKpi?' rt-overview-primary':'')+(k.click?' clickable':'')+'"'+(k.click?' role="button" tabindex="0" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click();}" onclick="'+k.click+'"':'')+'>'+
    '<div class="kpi-label">'+String(k.label).replace(/<br>/g,' ')+'</div><div class="kpi-value num'+(k.cls==='g'&&((isListedOnly&&listedPotentialProfit<0)||(isStockOnly&&estPotential<0)||(isAllView&&allPotentialProfit<0))?' negative':'')+'">'+k.val+'</div><div class="kpi-foot">'+k.sub+'</div>'+
  '</div>');
  const supportingKpis=kpiCards.filter((_,n)=>n!==primaryKpi);
  const kpiHTML=supportingKpis[0]+'<div class="rt-overview-side">'+kpiCards[primaryKpi]+supportingKpis.slice(1).join('')+'</div>';


  const html=`
    <div class="page-header">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;">
        <div style="min-width:0;flex:1;">
          ${_stockFromSummary?`<button class="btn btn-secondary" onclick="goToTab('summary',document.querySelector('[data-tab=\\'summary\\']'));_stockFromSummary=false;" style="margin-bottom:10px;font-size:13px">← Dashboard</button>`:''}
          <div class="page-title">Stock</div>
          <div class="page-subtitle">Listed, unlisted and returned stock — everything physically on hand.</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <button class="btn btn-secondary" style="padding:7px 9px;font-size:12px;white-space:nowrap;" onclick="goToTab('scrapped',null)" title="Open archive">${icon('inbox',13)}<span class="btn-label-hide-xs"> Archive</span>${cAllRemoved?` <span style="font-size:10px;color:var(--muted)">${cAllRemoved}</span>`:''}</button>
          <button class="btn btn-secondary${STOCK_GROUPED?' active':''}" style="padding:7px 10px;font-size:12px;white-space:nowrap;display:${isListedOnly?'inline-flex':'none'};" onclick="toggleStockGrouped()" title="Group listed items by listing month">
            <svg width="13" height="13" viewBox="0 0 15 15" fill="none" style="vertical-align:-1px;flex-shrink:0"><rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.3"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.3"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.3"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" stroke-width="1.3"/></svg><span class="btn-label-hide-xs"> By month</span>
          </button>
          <div class="ddwrap" id="dd-stock-add" style="position:relative;">
            <button class="btn btn-primary" style="padding:7px 12px;font-size:12px;gap:5px;" onclick="toggleDD('dd-stock-add')">Add ▾</button>
            <div class="ddmenu" style="right:0;min-width:160px;">
              <button onclick="toggleDD('dd-stock-add');openQuickAdd()">${icon('list',14)} List Item</button>
              <button onclick="toggleDD('dd-stock-add');openStockQuickAdd()">${icon('cat_other',14)} Add to Stock</button>
              <button onclick="toggleDD('dd-stock-add');openNewPurchase()">One purchase · multiple items</button>
              <button onclick="toggleDD('dd-stock-add');openNewJobLot()" style="color:var(--purple)">${icon('joblot',14)} New Job Lot</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="stock-kpis-v2 stock-kpis rt-overview">${kpiHTML}</div>
    ${_stockSeg}
    ${cAll===0?`<div class="empty-state">
      <div class="empty-state-text">${isStockOnly?'No unlisted items':isReturnedOnly?'No returned items':isAllView?'No stock on hand':'No active listings'}</div>
      <div class="empty-state-sub">${isStockOnly?'Add stock or withdraw a listing to place it here.':isReturnedOnly?'Customer returns that come back into your possession appear here.':isAllView?'Add your first item to start tracking inventory.':'Use Add to create your first listing.'}</div>
    </div>`:`
      <div class="rt-list-controls">
      ${((window.__stockAll&&window.__stockAll.length)||STOCK_SEARCH)?_inlistSearchHTML('stock'):''}
      ${isStockOnly?(()=>{
        // ── Sourced view: age distribution bar + bucket chips + sort ──────
        // Buckets: New 0–3d · List soon 4–7d · Overdue 8–14d · Stagnant 15d+
        const sBuckets=[
          {key:'new',      label:'New',       sub:'0–3d',   col:'var(--green)', cls:'sourced-new'},
          {key:'soon',     label:'List soon', sub:'4–7d',   col:'var(--blue)',  cls:'sourced-soon'},
          {key:'overdue',  label:'Overdue',   sub:'8–14d',  col:'var(--warn)',  cls:'sourced-overdue'},
          {key:'stagnant', label:'Stagnant',  sub:'15d+',   col:'var(--red)',   cls:'sourced-stagnant'}
        ];
        const sCounts={new:0,soon:0,overdue:0,stagnant:0};
        const sCostVal={new:0,soon:0,overdue:0,stagnant:0};
        _unlistedAgeEntities.forEach(i=>{
          const b=_sourcedBucket(i);
          sCounts[b]++;
          sCostVal[b]+=(i.costPrice||0);
        });
        const tot=_unlistedAgeEntities.length||1;
        const barHTML=sBuckets.map(s=>{
          const pct=(sCounts[s.key]/tot)*100;
          if(pct===0)return '';
          const isAct=STOCK_SOURCED_FILTER===s.key;
          return `<div data-stock-sourced-filter="${s.key}" class="age-bar-seg ${s.cls}${isAct?' active':''}" style="width:${pct}%;background:${s.col};" title="${s.label} (${s.sub}): ${sCounts[s.key]} item${sCounts[s.key]!==1?'s':''} · ${fmt(sCostVal[s.key])}" onclick="setStockSourcedFilter('${s.key}')"></div>`;
        }).join('');
        const chips=sBuckets.map(b=>{
          const isAct=STOCK_SOURCED_FILTER===b.key;
          const isEmpty=sCounts[b.key]===0;
          const cls='chip chip-'+b.cls+(isAct?' active':'')+(isEmpty?' chip-empty':'');
          return `<button data-stock-sourced-filter="${b.key}" class="${cls}" ${isEmpty?'disabled':''} onclick="${isEmpty?'':("setStockSourcedFilter('"+b.key+"')")}">${b.label} <span class="chip-count">${sCounts[b.key]}</span></button>`;
        }).join('');
        // Mobile dropdown for sourced filter
        const curBucket=sBuckets.find(b=>STOCK_SOURCED_FILTER===b.key)||{key:'all',label:'All',col:'var(--muted)'};
        const ddOpts=['all',...sBuckets.map(b=>b.key)].map(k=>{
          const meta=k==='all'?{label:'All',col:'var(--muted)'}:sBuckets.find(b=>b.key===k);
          const isAct=STOCK_SOURCED_FILTER===k;
          const cnt=k==='all'?_unlistedAgeEntities.length:(sCounts[k]||0);
          const isEmpty=k!=='all'&&cnt===0;
          return `<button data-stock-sourced-filter="${k}" class="filter-pill-dd-opt${isAct?' active':''}${isEmpty?' filter-pill-dd-opt-empty':''}" ${isEmpty?'disabled':''} onclick="${isEmpty?'':("setStockSourcedFilter('"+k+"');closeFilterPill('sfp-sourced')")}"><span class="filter-pill-dd-opt-dot" style="background:${meta.col||'var(--muted)'}"></span>${meta.label}<span class="filter-pill-dd-opt-count">${cnt}</span></button>`;
        }).join('');
        const sortOpts=[
          {v:'cost-desc', label:'Highest cost first'},
          {v:'days-desc', label:'Oldest first'},
          {v:'days-asc',  label:'Newest first'}
        ];
        const sortHTML=sortOpts.map(o=>`<option value="${o.v}" ${STOCK_SORT===o.v?'selected':''}>${o.label}</option>`).join('');
        return `<div class="age-bar-wrap"><div class="age-bar">${barHTML}</div></div>
          <div class="filter-row stock-filter-row" style="margin-bottom:14px;gap:8px;flex-wrap:nowrap;align-items:center;">
            <div class="filter-chips">
              <button data-stock-sourced-filter="all" class="chip${STOCK_SOURCED_FILTER==='all'?' active':''}" onclick="setStockSourcedFilter('all')">All <span class="chip-count">${_unlistedAgeEntities.length}</span></button>${chips}
            </div>
            <div class="filter-pill-dd" id="sfp-sourced">
              <div class="filter-pill-dd-backdrop" onclick="closeFilterPill('sfp-sourced')"></div>
              <button class="filter-pill-dd-btn" onclick="event.stopPropagation();toggleFilterPill('sfp-sourced')">
                <span class="fpdd-label"><span class="filter-pill-dd-opt-dot" style="background:${curBucket.col||'var(--muted)'}"></span>${curBucket.label}</span>
                <span class="fpdd-chev">▾</span>
              </button>
              <div class="filter-pill-dd-menu" onclick="event.stopPropagation()">${ddOpts}</div>
            </div>
            <select aria-label="Sort stock" class="sort-select" onchange="setStockSort(this.value)">${sortHTML}</select>
          </div>`;
      })():isListedOnly?(()=>{
        // ── Listed view: aging bar + chips + sort ──────────────────────────
        const segsBar=[
          {key:'fresh',  label:'Fresh',    sub:'0–30d',  count:ageBuckets.fresh,    val:ageBucketsValue.fresh,    col:'var(--green)'},
          {key:'maturing',label:'Maturing',sub:'31–60d', count:ageBuckets.maturing, val:ageBucketsValue.maturing, col:'var(--text-secondary)'},
          {key:'slow',   label:'Slow',     sub:'61–90d', count:ageBuckets.slow,     val:ageBucketsValue.slow,     col:'var(--warn)'},
          {key:'stale',  label:'Stale',    sub:'90d+',   count:ageBuckets.stale,    val:ageBucketsValue.stale,    col:'var(--red)'}
        ];
        const barSegs=segsBar.map(s=>{
          const pct=cAllListed?(s.count/cAllListed)*100:0; if(pct===0)return '';
          const isAct=STOCK_FILTER===s.key;
          return `<div data-stock-filter="${s.key}" class="age-bar-seg ${s.key}${isAct?' active':''}" style="width:${pct}%;background:${s.col};" title="${s.label} (${s.sub}): ${s.count} · ${fmt(s.val)}" onclick="setStockFilter('${s.key}')"></div>`;
        }).join('');
        const buckets=[
          {key:'all',     label:'All',      count:cAllListed,       dot:'var(--muted)'},
          {key:'fresh',   label:'Fresh',    count:ageBuckets.fresh, dot:'var(--green)'},
          {key:'maturing',label:'Maturing', count:cMaturing,        dot:'var(--text-secondary)'},
          {key:'slow',    label:'Slow',     count:cSlow,            dot:'var(--warn)'},
          {key:'stale',   label:'Stale',    count:cStale,           dot:'var(--red)'}
        ];
        const chips=buckets.map(b=>{
          const isAct=STOCK_FILTER===b.key; const isEmpty=b.count===0&&b.key!=='all';
          return `<button data-stock-filter="${b.key}" class="chip chip-${b.key}${isAct?' active':''}${isEmpty?' chip-empty':''}" ${isEmpty?'disabled':''} onclick="${isEmpty?'':("setStockFilter('"+b.key+"')")}">
            ${b.label} <span class="chip-count">${b.count}</span></button>`;
        }).join('');
        const cur=buckets.find(b=>b.key===STOCK_FILTER)||buckets[0];
        const ddOpts=buckets.map(b=>{
          const isAct=STOCK_FILTER===b.key; const isEmpty=b.count===0&&b.key!=='all';
          return `<button data-stock-filter="${b.key}" class="filter-pill-dd-opt${isAct?' active':''}${isEmpty?' filter-pill-dd-opt-empty':''}" ${isEmpty?'disabled':''} onclick="${isEmpty?'':("setStockFilter('"+b.key+"');closeFilterPill('sfp-filter')")}">
            <span class="filter-pill-dd-opt-dot" style="background:${b.dot}"></span>${b.label}<span class="filter-pill-dd-opt-count">${b.count}</span></button>`;
        }).join('');
        const sortOpts=[
          {v:'profit',   label:'Highest est. profit'},
          {v:'roi',      label:'Highest ROI %'},
          {v:'price',    label:'Highest ask price'},
          {v:'days-desc',label:'Oldest first'},
          {v:'days-asc', label:'Newest first'}
        ];
        const sortHTML=sortOpts.map(o=>`<option value="${o.v}" ${STOCK_SORT===o.v?'selected':''}>${o.label}</option>`).join('');
        return `<div class="age-bar-wrap"><div class="age-bar">${barSegs}</div></div>
          <div class="filter-row stock-filter-row" style="margin-bottom:14px;gap:8px;flex-wrap:nowrap;align-items:center;">
            <div class="filter-chips">${chips}</div>
            <div class="filter-pill-dd" id="sfp-filter">
              <div class="filter-pill-dd-backdrop" onclick="closeFilterPill('sfp-filter')"></div>
              <button class="filter-pill-dd-btn" onclick="event.stopPropagation();toggleFilterPill('sfp-filter')">
                <span class="fpdd-label"><span class="filter-pill-dd-opt-dot" style="background:${cur.dot}"></span>${cur.label} (${cur.count})</span>
                <span class="fpdd-chev">▾</span>
              </button>
              <div class="filter-pill-dd-menu" onclick="event.stopPropagation()">${ddOpts}</div>
            </div>
            <select aria-label="Sort stock" class="sort-select" onchange="setStockSort(this.value)">${sortHTML}</select>
          </div>`;
      })():''}
      <div class="list-toolbar${STOCK_SELECTION_MODE?' stock-selection-toolbar bulk-selection-toolbar':''}">
        ${STOCK_SELECTION_MODE?_stockSelectionToolbarHTML():`<button class="select-toggle" onclick="toggleStockSelection()">Select</button>`}
      </div>
      </div>
      ${visibleLots.length?`<div class="sl" style="margin-top:14px">${icon('joblot',13)} Job Lots</div><div class="item-table" style="margin-bottom:14px">${visibleLots.map(function(l){return renderJobLotCard(l);}).join('')}</div>`:''}
      ${_useGroup
        ?`${(()=>{window.__stockItems=items;return groupedHTML;})()}`
        :`<div class="item-table" id="stock-list">${(()=>{window.__stockItems=items;return items.length?items.map(i=>renderStockRow(i.month,i)).join(''):(STOCK_SEARCH?'<div class="inlist-empty">No stock matches \u201c'+esc(STOCK_SEARCH)+'\u201d</div>':'');})()}</div>`}`}`;
  const stockPage=document.getElementById('p-stock');
  stockPage.innerHTML=html;
  // Keep the existing age distribution immediately below the state filters.
  const ageBar=stockPage.querySelector('.age-bar-wrap');
  const stateFilters=stockPage.querySelector('.stock-state-seg');
  if(ageBar&&stateFilters)stateFilters.after(ageBar);
  _refreshStockSelection();
  _paintSelBar('stock');
}
});
