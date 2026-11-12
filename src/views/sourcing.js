/* sourcing view implementations. Shared state and stable public functions live in core. */
window.__rtRegisterView("sourcing", {
"renderActiveRunPage": function(){
  const page=document.getElementById('p-active-run');
  if(!page) return;
  const run=_activeSourcingRun;
  if(!run){
    page.classList.remove('active');
    goToTab('stock',document.querySelector('[data-tab="stock"]'),{stockState:'sourced'});
    toast('No active run','error');
    return;
  }
  const runItems=[];
  allDBKeys().forEach(function(k){
    (DB[k]||[]).forEach(function(i){
      if(i.sourcingRunId===run.id) runItems.push(Object.assign({},i,{_month:k}));
    });
  });
  runItems.sort(function(a,b){
    const da=a.dateSourced||'',db=b.dateSourced||'';
    if(da!==db) return da<db?1:-1;
    return a.id<b.id?1:-1;
  });
  const itemCount=runItems.length;
  const spent=runItems.reduce(function(s,i){return s+(i.costPrice||0)+calcPartsCost(i);},0);
  const estItems=runItems.filter(function(i){return i.estSalePrice!=null;});
  const estProfit=estItems.reduce(function(s,i){return s+(_estPotentialNet(i)||0);},0);
  // Seed session start time — use stored startedAtIso if available (survives reload)
  if(!window._runSessionStartMs||window._runActiveId!==run.id){
    window._runSessionStartMs=run.startedAtIso?new Date(run.startedAtIso).getTime():Date.now();
    window._runActiveId=run.id;
  }
  const _elapsed=function(){
    const diff=Date.now()-window._runSessionStartMs;
    const s=Math.floor(diff/1000);
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;
    if(s<5) return 'just started';
    if(h>0) return h+'h '+String(m).padStart(2,'0')+'m '+String(ss).padStart(2,'0')+'s';
    if(m>0) return m+'m '+String(ss).padStart(2,'0')+'s';
    return ss+'s';
  }
  const kc=function(label,val,sub,cls){
    // cls g/r -> semantic green/red on the value (P&L signal); b/'' -> neutral.
    const vc=cls==='g'?' style="color:var(--green);"':cls==='r'?' style="color:var(--red);"':'';
    return '<div class="card kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value num"'+vc+'>'+val+'</div><div class="kpi-foot">'+sub+'</div></div>';
  }
  const kpiHTML='<div class="runs-kpis-v2" style="margin-bottom:20px;">'
    +kc('ITEMS',String(itemCount),itemCount===1?'1 item sourced':itemCount+' items sourced','')
    +kc('SPENT',fmt(spent),'Cost + parts','b')
    +kc('EST. PROFIT',estItems.length?fmt(estProfit):'\u2014',estItems.length?estItems.length+' with estimate':(itemCount>0?'Tap items to add estimates':'No estimates yet'),estItems.length&&estProfit>=0?'g':estItems.length?'r':'')
    +'</div>';
  const _arRow=function(i){
    const _ep=_estPotentialNet(i); // real net (fee + median fulfilment drag), matches detail page
    const _estStr=i.estSalePrice!=null?' \u00b7 est '+fmt(i.estSalePrice):'';
    const _profStr=_ep!=null?' \u00b7 <span style="color:'+(_ep>=0?'var(--green)':'var(--red)')+';">'+(_ep>=0?'+':'')+fmt(_ep)+'</span>':'';
    const bdr=runItems.indexOf(i)>0?'border-top:1px solid var(--border)':'';
    const qm=i._month.replace(/'/g,"\\'"), qid=i.id.replace(/'/g,"\\'");
    const _isSel=RUN_SELECTED.has(i.id);
    // Always-visible inline estimate input when estSalePrice is null and not
    // in selection mode. Direct tap → keyboard opens → type → Enter/blur
    // commits. First-class treatment because estimating IS the run's primary
    // insight — no chip-to-input dance. onclick stopPropagation stops the
    // row-open handler from firing when the input is tapped.
    const _estInput=(i.estSalePrice==null&&!RUN_SELECTION_MODE)
      ?' <input type="number" step="0.01" min="0" inputmode="decimal" placeholder="add est \u00a3" onclick="event.stopPropagation()" onblur="_arCommitEst(this,\''+qm+'\',\''+qid+'\')" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}else if(event.key===\'Escape\'){this.value=\'\';this.blur();}" style="border:1px solid rgba(212,136,10,0.28);background:var(--accent-dim);color:var(--accent);font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;outline:none;-webkit-appearance:none;width:84px;margin-left:6px;line-height:1.3;vertical-align:1px;">'
      :'';
    // In selection mode the whole row toggles the checkbox; in normal mode
    // the body opens the item page. The per-row \u22EE dropdown is kept in
    // both modes (single-item actions still work) — event.stopPropagation
    // keeps the dropdown clicks from bubbling to the row click.
    const rowBg='';  // selected styling handled by .ar-item-row.selected (v2.11.1)
    const rowClick=RUN_SELECTION_MODE
      ?'onclick="toggleRunSelect(\''+qid+'\')"'
      :'';
    const leftSlot=RUN_SELECTION_MODE
      ?'<label class="item-checkbox-left" onclick="event.stopPropagation()" style="display:flex;align-items:center;flex-shrink:0;"><input type="checkbox" '+(_isSel?'checked':'')+' onchange="toggleRunSelect(\''+qid+'\')" style="width:18px;height:18px;accent-color:var(--brand);cursor:pointer;"></label>'
      :'';
    const bodyClick=RUN_SELECTION_MODE
      ?''
      :'cursor:pointer;" onclick="openItemPage(\''+qm+'\',\''+qid+'\',\'p-active-run\')';
    return '<div class="ar-item-row'+(_isSel?' selected':'')+'" style="display:flex;align-items:center;gap:10px;padding:11px 14px;'+bdr+';'+rowBg+'" '+rowClick+'>'
      +leftSlot
      +'<div style="flex:1;min-width:0;'+bodyClick+'">'
        +'<div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
        +'<div style="font-size:12px;color:var(--text-secondary);">'+fmt(i.costPrice||0)+'<span style="color:var(--text-tertiary)"> cost</span>'+_estStr+_profStr+_estInput+'</div>'
      +'</div>'
      +'<div class="ddwrap" id="ardd-'+i.id+'">'
        +'<button class="ddbtn" aria-label="Item actions" onclick="event.stopPropagation();toggleDD(\'ardd-'+qid+'\')" title="Actions" style="width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);font-size:16px;cursor:pointer;transition:background var(--dur-fast,150ms) var(--ease-out,ease-out),border-color var(--dur-fast,150ms) var(--ease-out,ease-out);-webkit-tap-highlight-color:transparent;">\u22EE</button>'
        +'<div class="ddmenu">'
          +'<button onclick="openItemPage(\''+qm+'\',\''+qid+'\',\'p-active-run\')">Open</button>'
          +'<button onclick="editItem(\''+qm+'\',\''+qid+'\')">Edit</button>'
          +'<button onclick="_removeFromActiveRun(\''+qm+'\',\''+qid+'\')">Remove from run</button>'
          +'<button class="danger" onclick="deleteItem(\''+qm+'\',\''+qid+'\')">Delete</button>'
        +'</div>'
      +'</div>'
      +'</div>';
  }
  const emptyState='<div style="padding:36px 24px;text-align:center;color:var(--text-secondary);">'
    +'<div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px;">Nothing sourced yet</div>'
    +'<div style="font-size:13px;line-height:1.5;">Tap the <strong style="color:var(--accent);">+</strong> button to log your first find.<br>'
    +'The clock\u2019s ticking \u2014 happy hunting.</div>'
    +'</div>';
  // Bulk-select toolbar above the list. Mirrors the Monthly + Stock pattern:
  //   - Idle: the "Edit" button lives inline with the section header (see the
  //     header render below — this branch returns '' so no toolbar row shows)
  //   - Selection mode: shows a select-all check, count, bulk actions, Done
  //   - Bulk actions: Remove from run (untag, items stay in stock) and Delete
  const _runToolbar=runItems.length===0?'':(!RUN_SELECTION_MODE?'':(
    '<div class="list-toolbar" style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">'
    +'<button class="sel-check" onclick="selectAllRunItems()" style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:6px 8px;color:var(--text);">'
      +'<span class="sel-check-box '+(RUN_SELECTED.size===runItems.length?'all':RUN_SELECTED.size>0?'some':'')+'" style="width:18px;height:18px;border:1.5px solid var(--border-strong);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;background:'+(RUN_SELECTED.size===runItems.length?'var(--brand)':'transparent')+';color:'+(RUN_SELECTED.size===runItems.length?'#1a1205':'transparent')+';font-size:12px;font-weight:700;">'
        +(RUN_SELECTED.size===runItems.length?'\u2713':RUN_SELECTED.size>0?'\u2212':'')
      +'</span>'
      +'<span style="color:'+(RUN_SELECTED.size>0?'var(--text)':'var(--text-secondary)')+';font-weight:600;font-size:13px;">'
        +(RUN_SELECTED.size>0?RUN_SELECTED.size+' selected':'Select all')
      +'</span>'
    +'</button>'
    +(RUN_SELECTED.size>0
      ?(
        '<button class="bulk-ctrl" onclick="runBulkAction(\'remove\')" style="margin-left:auto;font-size:13px;padding:7px 12px;border:1px solid var(--border);background:var(--surface2);border-radius:8px;color:var(--text);cursor:pointer;font-weight:600;">'
          +'Remove from run'
        +'</button>'
        +'<button class="bulk-ctrl" onclick="runBulkAction(\'move\')" style="font-size:13px;padding:7px 12px;border:1px solid var(--border);background:var(--surface2);border-radius:8px;color:var(--text);cursor:pointer;font-weight:600;">'
          +'Move to run'
        +'</button>'
        +'<button class="bulk-ctrl is-danger" onclick="runBulkAction(\'delete\')" style="font-size:13px;padding:7px 12px;border:1px solid rgba(220,55,55,0.4);background:rgba(220,55,55,0.08);border-radius:8px;color:var(--red);cursor:pointer;font-weight:600;display:flex;align-items:center;gap:5px;">'
          +icon('trash',13)+'Delete'
        +'</button>'
      )
      :'')
    +'<button class="sel-exit" onclick="toggleRunSelection()" style="'+(RUN_SELECTED.size===0?'margin-left:auto;':'')+'background:none;border:none;color:var(--text-secondary);font-size:13px;cursor:pointer;padding:7px 10px;font-weight:500;">'
      +'\u2715 Done'
    +'</button>'
    +'</div>'
  ));
  const listHTML=runItems.length
    ?_runToolbar+'<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">'+runItems.map(_arRow).join('')+'</div>'
    :emptyState;
  page.innerHTML=''
    +'<div style="max-width:560px;margin:0 auto;padding:18px 16px 100px;">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:20px;">'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">'
            +'<span style="width:10px;height:10px;border-radius:50%;background:var(--accent);display:inline-block;flex-shrink:0;animation:_arPulse 1.4s ease-in-out infinite;"></span>'
            +'<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent);">Sourcing</span>'
          +'</div>'
          +'<h1 style="font-family:var(--font-display);font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:4px 0 2px;">'+esc(run.name)+'</h1>'
          +(run.location?'<div style="font-size:13px;color:var(--text-secondary);margin-bottom:2px;">'+esc(run.location)+'</div>':'')
          +'<div style="font-size:12px;color:var(--muted);"><span id="run-elapsed-live">'+_elapsed()+'</span></div>'
        +'</div>'
        +'<button onclick="endSourcingRun()" style="flex-shrink:0;background:rgba(220,55,55,0.08);color:var(--red);border:1px solid rgba(220,55,55,0.3);border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;-webkit-tap-highlight-color:transparent;transition:background var(--dur-fast,150ms) var(--ease-out,ease-out);white-space:nowrap;" onmouseover="this.style.background=\'rgba(220,55,55,0.14)\'" onmouseout="this.style.background=\'rgba(220,55,55,0.08)\'" title="End this run">'
          +'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>'
          +'End Run'
        +'</button>'
      +'</div>'
      +kpiHTML
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);">Items sourced this run</div>'
        +(runItems.length>0&&!RUN_SELECTION_MODE
          ?'<button onclick="toggleRunSelection()" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:6px 11px;border:1px solid var(--border);background:var(--surface-2);border-radius:6px;color:var(--text-secondary);cursor:pointer;font-weight:600;-webkit-tap-highlight-color:transparent;transition:color var(--dur-fast,150ms) var(--ease-out,ease-out),border-color var(--dur-fast,150ms) var(--ease-out,ease-out);" onmouseover="this.style.color=\'var(--text)\';this.style.borderColor=\'var(--border-strong)\';" onmouseout="this.style.color=\'var(--text-secondary)\';this.style.borderColor=\'var(--border)\';" title="Select items to remove or delete">'
            +'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>'
            +'Edit'
          +'</button>'
          :'')
      +'</div>'
      +listHTML
    +'</div>';
  // Live tick — updates elapsed every second while run is active
  if(_runTimerInterval) clearInterval(_runTimerInterval);
  _runTimerInterval=setInterval(function(){
    const el=document.getElementById('run-elapsed-live');
    if(el&&_activeSourcingRun) el.textContent=_elapsed();
    else{ clearInterval(_runTimerInterval); _runTimerInterval=null; }
  },1000);
},

"_renderRunPage": function(run){
  const page=document.getElementById('p-item');
  if(!page)return;
  const items=_runItems(run.id);
  const runTrips=(DB.trips||[]).filter(function(t){return t.sourcingRunId===run.id;});
  const runExps=(DB.expenses||[]).filter(function(e){return e.sourcingRunId===run.id;});

  // ── Costs ──────────────────────────────────────────────────────────────────
  const itemCost=items.reduce(function(s,i){return s+(i.costPrice||0)+calcPartsCost(i);},0);
  const tripCost=runTrips.reduce(function(s,t){
    return s+(t.mileage||0)*(t.ratePerMile||0.45)+((Array.isArray(t.expenses)?t.expenses:[]).reduce(function(a,e){return a+(e.amount||0);},0));
  },0);
  const expCost=runExps.reduce(function(s,e){return s+(e.amount||0);},0);
  const totalSpent=itemCost+tripCost+expCost;
  const totalMiles=runTrips.reduce(function(s,t){return s+(t.mileage||0);},0);

  // ── Item state buckets ─────────────────────────────────────────────────────
  const sourcedItems=items.filter(function(i){return i.state==='sourced'&&!i.scrappedAt;});
  const listedItems=items.filter(function(i){return i.state==='listed'&&!i.dateSold&&!i.resaleSalePrice&&!i.scrappedAt;});
  const soldItems=items.filter(function(i){return i.state==='sold'||!!i.resaleSalePrice;});
  const returnedItems=items.filter(function(i){return !!i.isReturned;});

  // ── Realised ──────────────────────────────────────────────────────────────
  const revenue=soldItems.reduce(function(s,i){return s+calcItemRevenue(i);},0);
  const realisedProfit=soldItems.reduce(function(s,i){return s+(calcNetProfit(i)||0);},0);

  // ── Potential ─────────────────────────────────────────────────────────────
  const unsoldItems=[...sourcedItems,...listedItems];
  // v2.21.36 — use the app-wide realistic estimator (_estPotentialNet: real
  // asking price for LISTED items, estSalePrice for SOURCED, real fees+promo+
  // fulfilment drag) so the run P&L matches the Stock Room + item page, and a
  // stale whole-lot estSalePrice inherited by a listed duplicate no longer
  // inflates it (both copies read their own per-unit asking price once listed).
  const estItems=unsoldItems.filter(function(i){return _estPotentialNet(i)!=null;});
  const estPotential=estItems.reduce(function(s,i){return s+(_estPotentialNet(i)||0);},0);
  const hasEst=estItems.length>0;
  const overhead=tripCost+expCost;
  const netBestCase=realisedProfit+estPotential-overhead;
  const totalROI=totalSpent>0?((netBestCase/totalSpent)*100):null;

  // ── Efficiency metrics ────────────────────────────────────────────────────
  // Time spent on this run (use duration if ended, else session time)
  // E32 fix — endedAtIso (set by the manual duration-edit flow in
  // submitEditRun) takes priority over dateEnded (set only when a LIVE run
  // is ended via the "End Run" flow). The old code read dateEnded only, so
  // editing a run's duration never updated "profit per hour" — it kept
  // showing "No time logged" for any run that hadn't also been live-ended,
  // or silently used a stale dateEnded that had nothing to do with the
  // edited duration. This mirrors the fallback _fmtRunDuration already uses
  // correctly for the header's duration display, just below.
  let runHours=null;
  const _runEndMs=run.endedAtIso?new Date(run.endedAtIso).getTime():(run.dateEnded?new Date(run.dateEnded).getTime():null);
  if(run.startedAtIso&&_runEndMs){
    const ms=_runEndMs-new Date(run.startedAtIso).getTime();
    if(ms>0){
      runHours=ms/(1000*60*60);
      if(runHours<0.1)runHours=0.1; // floor at 6min to avoid divide weirdness
    }
  }
  const profitPerHour=runHours?(netBestCase/runHours):null;
  const profitPerMile=totalMiles>0?(netBestCase/totalMiles):null;

  // Avg days unsold (for live items only)
  const today=new Date().toISOString().split('T')[0];
  const avgDaysUnsold=unsoldItems.length?Math.round(unsoldItems.reduce(function(s,i){
    const since=i.dateSourced||i.dateListed;
    return s+(since?daysBetween(since,today):0);
  },0)/unsoldItems.length):0;

  // ── Status pill ───────────────────────────────────────────────────────────
  const isActive=run.status==='active';
  const statusPill='<span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;'
    +(isActive?'background:rgba(34,197,94,0.15);color:var(--green)':'background:var(--surface2);color:var(--text-secondary)')+';">'
    +(isActive?'\u25cf\u00a0Active':'Ended')+'</span>';

  // ── HERO P&L CARD ─────────────────────────────────────────────────────────
  // The one number that answers "was this worth it?"
  const heroLabel=soldItems.length===items.length&&items.length>0?'Run profit (closed)':soldItems.length>0||hasEst?'Run P&L (best case)':'Run P&L (potential)';
  const heroSubBits=[];
  if(soldItems.length)heroSubBits.push(soldItems.length+' sold \u00b7 \u00a3'+realisedProfit.toFixed(2)+' realised');
  if(hasEst)heroSubBits.push('+ \u00a3'+estPotential.toFixed(2)+' potential');
  if(overhead>0)heroSubBits.push('\u2212 \u00a3'+overhead.toFixed(2)+' overhead');
  const heroSub=heroSubBits.join(' \u00b7 ')||'No sales or estimates yet';
  const heroColor=netBestCase>=0?'var(--green)':'var(--red)';
  const hero='<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px 20px;margin-bottom:10px;">'
    +'<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:6px;">'+heroLabel+'</div>'
    +'<div style="font-size:32px;font-weight:800;letter-spacing:-0.04em;color:'+heroColor+';line-height:1.1;">\u00a3'+netBestCase.toFixed(2)+'</div>'
    +'<div style="font-size:11px;color:var(--text-secondary);margin-top:5px;line-height:1.5;">'+heroSub+'</div>'
    +(totalROI!==null?'<div style="display:inline-block;margin-top:8px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;background:var(--surface2);color:var(--text-secondary);">'+totalROI.toFixed(1)+'% ROI on \u00a3'+totalSpent.toFixed(2)+'</div>':'')
  +'</div>';

  // ── EFFICIENCY ROW — was this worth my time? ──────────────────────────────
  const effStat=function(label,val,sub){
    return '<div style="flex:1;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">'
      +'<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:4px;">'+label+'</div>'
      +'<div style="font-size:16px;font-weight:700;letter-spacing:-0.02em;">'+val+'</div>'
      +'<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">'+sub+'</div>'
    +'</div>';
  }
  const eff='<div style="display:flex;gap:8px;margin-bottom:10px;">'
    +effStat('Per hour',profitPerHour!==null?'\u00a3'+profitPerHour.toFixed(0):'\u2014',runHours?runHours.toFixed(1)+'h on run':'No time logged')
    +effStat('Per mile',profitPerMile!==null?'\u00a3'+profitPerMile.toFixed(2):'\u2014',totalMiles?totalMiles+' mi driven':'No miles logged')
    +effStat('Avg age',unsoldItems.length?avgDaysUnsold+'d':'\u2014',unsoldItems.length?unsoldItems.length+' unsold':'All sold')
  +'</div>';

  // ── CAPITAL RECOVERY BAR — visual P&L recovery ────────────────────────────
  // Shows: how much of capital deployed has been recovered (revenue) vs still locked up
  const recoveryBar=(function(){
    if(totalSpent===0)return '';
    const recovered=revenue;
    const recoveredPct=Math.min(100,Math.round((recovered/totalSpent)*100));
    const locked=Math.max(0,totalSpent-recovered);
    const lockedPct=100-recoveredPct;
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:10px;">'
      +'<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">'
        +'<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);">Capital recovered</div>'
        +'<div style="font-size:13px;font-weight:700;color:'+(recoveredPct>=100?'var(--green)':'var(--text)')+';">\u00a3'+recovered.toFixed(0)+' / \u00a3'+totalSpent.toFixed(0)+'</div>'
      +'</div>'
      +'<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--surface2);">'
        +(recoveredPct>0?'<div style="width:'+recoveredPct+'%;background:var(--green);"></div>':'')
        +(lockedPct>0?'<div style="width:'+lockedPct+'%;background:var(--surface2);border-left:'+(recoveredPct>0?'1px dashed var(--border2)':'none')+';"></div>':'')
      +'</div>'
      +'<div style="display:flex;gap:14px;font-size:11px;color:var(--text-secondary);margin-top:6px;">'
        +'<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--green);"></span>'+recoveredPct+'% back</span>'
        +(locked>0?'<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:50%;background:var(--surface2);border:1px solid var(--border2);"></span>\u00a3'+locked.toFixed(0)+' still tied up</span>':'')
      +'</div>'
    +'</div>';
  })();

  // ── PIPELINE BAR — what's left to do ──────────────────────────────────────
  const pipeSection=(function(){
    const tot=items.length||1;
    const segs=[];
    if(soldItems.length)segs.push({w:soldItems.length/tot,col:'var(--green)',label:soldItems.length+' sold'});
    if(listedItems.length)segs.push({w:listedItems.length/tot,col:'var(--blue)',label:listedItems.length+' listed'});
    if(sourcedItems.length)segs.push({w:sourcedItems.length/tot,col:'var(--accent)',label:sourcedItems.length+' in stock'});
    if(returnedItems.length)segs.push({w:returnedItems.length/tot,col:'var(--red)',label:returnedItems.length+' returned'});
    if(!segs.length)return '';
    const barHTML=segs.map(function(s,i){
      return '<div style="flex:'+s.w+';background:'+s.col+';height:100%;'+(i===0?'border-radius:4px 0 0 4px;':'')+(i===segs.length-1?'border-radius:0 4px 4px 0;':'')+'"></div>';
    }).join('');
    const legendHTML=segs.map(function(s){
      return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);">'
        +'<span style="width:7px;height:7px;border-radius:50%;background:'+s.col+';"></span>'+s.label+'</span>';
    }).join('');
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:18px;">'
      +'<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px;">Pipeline</div>'
      +'<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--surface2);gap:2px;margin-bottom:8px;">'+barHTML+'</div>'
      +'<div style="display:flex;gap:14px;flex-wrap:wrap;">'+legendHTML+'</div>'
    +'</div>';
  })();

  // ── Items list (grouped) ──────────────────────────────────────────────────
  const groups=[
    {key:'sourced', label:'Sourced',  items:sourcedItems,  col:'var(--accent)'},
    {key:'listed',  label:'Listed',   items:listedItems,   col:'var(--blue)'},
    {key:'sold',    label:'Sold',     items:soldItems,     col:'var(--green)'},
    {key:'returned',label:'Returned', items:returnedItems, col:'var(--red)'},
  ];
  let itemsHTML='';
  groups.forEach(function(g){
    if(g.items.length===0)return;
    itemsHTML+='<div style="margin-bottom:14px;">'
      +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:6px;display:flex;align-items:center;gap:6px;">'
      +'<span style="width:7px;height:7px;border-radius:50%;background:'+g.col+';"></span>'
      +g.label+' ('+g.items.length+')</div>'
      +'<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">';
    g.items.forEach(function(i,idx){
      const isItemSold=g.key==='sold';
      const gp=isItemSold?calcGrossProfit(i):null;
      const ep=(!isItemSold)?_estPotentialNet(i):null; // v2.21.36 — live estimator (was estSalePrice*0.88; inherited whole-lot est on duplicates)
      const valStr=isItemSold
        ?(gp!==null?'<span style="font-size:13px;font-weight:700;color:'+(gp>=0?'var(--green)':'var(--red)')+';">\u00a3'+gp.toFixed(2)+'</span>':'')
        :(ep!==null?'<span style="font-size:12px;color:var(--muted);">est <span style="color:'+(ep>=0?'var(--green)':'var(--red)')+';">\u00a3'+ep.toFixed(2)+'</span></span>':'<span style="font-size:11px;color:var(--muted);">\u00a3'+(i.costPrice||0).toFixed(2)+' cost</span>');
      const qm=i._month.replace(/'/g,"\\'"), qid=i.id.replace(/'/g,"\\'");
      // v2.19.26 — select mode. The row's click target swaps between "open the
      // item" and "toggle the checkbox"; the box is a span, not an <input>, so
      // the row's single handler owns the whole hit area and there is no
      // nested-control click to fight with.
      const _rdSel=RUN_SELECTED.has(i.id);
      const _rdClick=RUN_SELECTION_MODE
        ?'toggleRunSelect(\''+qid+'\')'
        :'_openItemFromRun(\''+qm+'\',\''+qid+'\',\''+run.id+'\')';
      const _rdBox=RUN_SELECTION_MODE
        ?'<span style="width:18px;height:18px;flex-shrink:0;border:1.5px solid '+(_rdSel?'var(--brand)':'var(--border-strong)')+';border-radius:4px;display:inline-flex;align-items:center;justify-content:center;background:'+(_rdSel?'var(--brand)':'transparent')+';color:'+(_rdSel?'#1a1205':'transparent')+';font-size:12px;font-weight:700;">\u2713</span>'
        :'';
      itemsHTML+='<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;'+(_rdSel?'background:var(--accent-dim);':'')+(idx>0?'border-top:1px solid var(--border)':'')+'" onclick="'+_rdClick+'">'
        +_rdBox
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
          +'<div style="font-size:11px;color:var(--text-secondary);">\u00a3'+(i.costPrice||0).toFixed(2)+' cost'+(i.salePrice&&isItemSold?' \u00b7 sold \u00a3'+i.salePrice.toFixed(2):'')+((!isItemSold&&i.salePrice)?' \u00b7 list \u00a3'+i.salePrice.toFixed(2):(i.estSalePrice&&!isItemSold?' \u00b7 est \u00a3'+i.estSalePrice.toFixed(2):''))+'</div>'
        +'</div>'
        +valStr
        +'</div>';
    });
    itemsHTML+='</div></div>';
  });
  if(items.length===0){
    itemsHTML='<div class="empty-state"><div class="empty-state-text">No items in this run</div><div class="empty-state-sub">Items added while this run was active appear here.</div></div>';
  }
  // v2.19.26 — run-detail bulk bar. Same actions and same wording as the
  // active-run bar so the two surfaces cannot drift apart in behaviour.
  const _rdSelCount=RUN_SELECTED.size;
  const _rdToolbar=(items.length===0||!RUN_SELECTION_MODE)?'':(
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;">'
    +'<button onclick="selectAllRunItems()" style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:4px 6px;color:var(--text);">'
      +'<span style="width:18px;height:18px;border:1.5px solid var(--border-strong);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;background:'+(_rdSelCount===items.length?'var(--brand)':'transparent')+';color:'+(_rdSelCount===items.length?'#1a1205':'transparent')+';font-size:12px;font-weight:700;">'
        +(_rdSelCount===items.length?'\u2713':_rdSelCount>0?'\u2212':'')
      +'</span>'
      +'<span style="color:'+(_rdSelCount>0?'var(--text)':'var(--text-secondary)')+';font-weight:600;font-size:13px;">'
        +(_rdSelCount>0?_rdSelCount+' selected':'Select all')
      +'</span>'
    +'</button>'
    +(_rdSelCount>0
      ?(
        '<button onclick="runBulkAction(\'remove\')" style="margin-left:auto;font-size:12px;padding:6px 10px;border:1px solid var(--border);background:var(--surface);border-radius:8px;color:var(--text);cursor:pointer;font-weight:600;">Remove from run</button>'
        +'<button onclick="runBulkAction(\'move\')" style="font-size:12px;padding:6px 10px;border:1px solid var(--border);background:var(--surface);border-radius:8px;color:var(--text);cursor:pointer;font-weight:600;">Move to run</button>'
        +'<button onclick="runBulkAction(\'delete\')" style="font-size:12px;padding:6px 10px;border:1px solid rgba(220,55,55,0.4);background:rgba(220,55,55,0.08);border-radius:8px;color:var(--red);cursor:pointer;font-weight:600;">Delete</button>'
      )
      :'')
    +'<button onclick="toggleRunSelection()" style="'+(_rdSelCount===0?'margin-left:auto;':'')+'background:none;border:none;color:var(--text-secondary);font-size:12px;cursor:pointer;padding:6px 8px;font-weight:500;">\u2715 Done</button>'
    +'</div>'
  );

  // ── Cost breakdown (collapsed, compact) ──────────────────────────────────
  let costsHTML='';
  if(runTrips.length||runExps.length){
    costsHTML='<div style="margin-bottom:16px;">'
      +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:8px;">Run overhead</div>';
    if(runTrips.length){
      costsHTML+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:8px;">';
      runTrips.forEach(function(t,idx){
        const mc=(t.mileage||0)*(t.ratePerMile||0.45);
        const ec=(Array.isArray(t.expenses)?t.expenses:[]).reduce(function(a,e){return a+(e.amount||0);},0);
        // E34 fix — these rows were pure display with no tap target at all,
        // so there was no way to view or edit a trip/expense from the run
        // page. Index must be looked up in the FULL DB.trips array (editTrip
        // takes a global index, not a position within this run's filtered
        // subset), found by matching the stable trip id.
        const fullIdx=(DB.trips||[]).findIndex(function(x){return x.id===t.id;});
        costsHTML+='<div class="clickable" data-trip-idx="'+fullIdx+'" onclick="_openRunOverheadTrip(this.dataset.tripIdx)" style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;'+(idx?'border-top:1px solid var(--border)':'')+'">'
          +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(t.description||'Trip')+'</div>'
          +'<div style="font-size:11px;color:var(--text-secondary);">'+(t.date||'')+' \u00b7 '+(t.mileage||0)+' mi</div></div>'
          +'<span style="font-size:13px;font-weight:600;">\u00a3'+(mc+ec).toFixed(2)+'</span>'
          +'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--muted);"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        +'</div>';
      });
      costsHTML+='</div>';
    }
    if(runExps.length){
      costsHTML+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">';
      runExps.forEach(function(e,idx){
        const fullIdx=(DB.expenses||[]).findIndex(function(x){return x.id===e.id;});
        costsHTML+='<div class="clickable" data-exp-idx="'+fullIdx+'" onclick="_openRunOverheadExpense(this.dataset.expIdx)" style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;'+(idx?'border-top:1px solid var(--border)':'')+'">'
          +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(e.description||'Expense')+'</div>'
          +'<div style="font-size:11px;color:var(--text-secondary);">'+(e.date||'')+(e.category?' \u00b7 '+esc(e.category):'')+'</div></div>'
          +'<span style="font-size:13px;font-weight:600;">\u00a3'+(e.amount||0).toFixed(2)+'</span>'
          +'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--muted);"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        +'</div>';
      });
      costsHTML+='</div>';
    }
    costsHTML+='</div>';
  }

  // ── Date / duration header ────────────────────────────────────────────────
  const _fmtRunDuration=function(startIso,startDate,endIso,endedAtIso){
    const s=startIso?new Date(startIso).getTime():new Date((startDate||'')+'T09:00:00').getTime();
    const e=endedAtIso?new Date(endedAtIso).getTime():(endIso?new Date(endIso).getTime():null);
    if(!e)return null;
    const ms=e-s;
    if(ms<=0)return null;
    const totalSecs=Math.floor(ms/1000);
    const h=Math.floor(totalSecs/3600),m=Math.floor((totalSecs%3600)/60);
    if(h>0)return h+'h '+m+'m';
    if(m>0)return m+'m';
    return '<1m';
  };
  const dateStr=(run.dateStarted||'').slice(0,10);
  const endedStr=run.dateEnded?' \u2014 ended '+(run.dateEnded||'').slice(0,10):'';
  const dur=_fmtRunDuration(run.startedAtIso,run.dateStarted,run.dateEnded,run.endedAtIso);

  const html=`
    <div class="item-full-page">
      <button class="btn btn-secondary" onclick="goToTab('runs',document.querySelector('[data-tab=\\'runs\\']'))" style="margin-bottom:14px;font-size:13px;">\u2190 Sourcing</button>
      <div class="page-header" style="margin-bottom:6px;">
        <div>
          <div class="page-title" style="font-size:24px;">${esc(run.name)}</div>
          <div class="page-subtitle" style="font-size:12px;margin-top:4px;">${run.location?esc(run.location)+' \u00b7 ':''}${dateStr}${endedStr}${dur?' \u00b7 '+dur:''}${!run.dateEnded?' \u00b7 <span style="color:var(--green);font-weight:600;">\u25cf Live</span>':''}</div>
        </div>
        ${statusPill}
      </div>
      ${run.notes?`<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;">${esc(run.notes)}</div>`:''}
      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        ${isActive?'<button class="btn btn-primary" style="font-size:13px;" onclick="endSourcingRun(\''+run.id+'\')"  >End run</button>':''}
        <button class="btn btn-secondary" style="font-size:13px;" onclick="openEditRun('${run.id}')">Edit</button>
        <button class="btn btn-secondary" style="font-size:13px;" onclick="addRunExpense('${run.id}')">+ Expense</button>
        <button class="btn btn-secondary" style="font-size:13px;" onclick="addRunTrip('${run.id}')">+ Trip</button>
        ${!isActive?'<button class="btn btn-secondary danger" style="font-size:13px;" onclick="deleteRun(\''+run.id+'\')"  >Delete</button>':''}
      </div>
      <div class="run-detail-layout">
        <div class="run-detail-left">
          ${hero}
          ${eff}
          ${recoveryBar}
          ${pipeSection}
          ${costsHTML}
        </div>
        <div class="run-detail-right">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px;flex-wrap:wrap;">
            <div style="font-size:13px;font-weight:600;">Items sourced</div>
            <div style="display:flex;gap:6px;">
              ${items.length>0&&!RUN_SELECTION_MODE?`<button class="btn btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="toggleRunSelection()" title="Select items to remove, move or delete">Select</button>`:''}
              ${RUN_SELECTION_MODE?'':`<button class="btn btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="openBulkAssignModal('${run.id}')">+ Add existing</button>`}
            </div>
          </div>
          ${_rdToolbar}
          ${itemsHTML}
        </div>
      </div>
    </div>`;
  page.innerHTML=html;
  // E34 — remember which run is currently shown so a trip/expense edit
  // opened from the overhead list knows which run page to refresh back to.
  _lastOpenedRunId=run.id;
},

"renderRunsPage": function(){
  const page=document.getElementById('p-runs');
  if(!page)return;

  const ended=_sourcingRuns.filter(function(r){return r.status==='ended';});
  const hasRuns=_sourcingRuns.length>0;
  let RUNS_SORT=window._RUNS_SORT||'newest';



  // One directly sorted collection: month grouping must not override ranking.
  const runStats=new Map(ended.map(function(run){
    const items=_runItems(run.id),cost=_runCost(run.id),profit=_runProfit(run.id);
    return [run.id,{items:items.length,sold:items.filter(function(i){return i.state==='sold'||i.resaleSalePrice;}).length,cost:cost,profit:profit,roi:cost>0?profit/cost*100:null}];
  }));
  const dateKey=function(r){return String(r.dateEnded||r.dateStarted||'').slice(0,10);};
  const sorted=ended.slice().sort(function(a,b){
    const x=runStats.get(a.id),y=runStats.get(b.id);
    let diff=0;
    if(RUNS_SORT==='items')diff=y.items-x.items;
    else if(RUNS_SORT==='profit')diff=y.profit-x.profit;
    else if(RUNS_SORT==='spend')diff=y.cost-x.cost;
    else if(RUNS_SORT==='roi')diff=(y.roi===null?-Infinity:y.roi)-(x.roi===null?-Infinity:x.roi);
    else if(RUNS_SORT==='oldest')diff=(dateKey(a)||'9999').localeCompare(dateKey(b)||'9999');
    return diff||dateKey(b).localeCompare(dateKey(a))||String(a.id).localeCompare(String(b.id));
  });

  // Build active run card if run is active
  let activeCardHTML='';
  if(_activeSourcingRun){
    const run=_activeSourcingRun;
    const items=_runItems(run.id);
    const spent=items.reduce(function(s,i){return s+(i.costPrice||0)+calcPartsCost(i);},0);
    const estPot=items.reduce(function(s,i){return s+(i.estSalePrice!=null?i.estSalePrice:0);},0);
    const startedMs=run.dateStarted?new Date(run.dateStarted+'T00:00:00').getTime():0;
    const nowMs=Date.now();
    const minAgo=startedMs?Math.round((nowMs-startedMs)/60000):0;
    const timeStr=minAgo<60?(minAgo<=1?'Just started':(minAgo+' minutes ago')):(Math.round(minAgo/60)+'h ago');
    const loc=run.location?(' · '+esc(run.location)):'';
    activeCardHTML=
      '<div style="background:rgba(34,197,94,0.07);border:1.5px solid rgba(34,197,94,0.3);border-radius:12px;padding:14px 16px;margin-bottom:18px;">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'+
          '<div style="width:9px;height:9px;border-radius:50%;background:var(--green);flex-shrink:0;animation:run-pulse 2s ease-in-out infinite;"></div>'+
          '<div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(run.name)+loc+'</div>'+
        '</div>'+
        '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">'+
          items.length+' item'+(items.length!==1?'s':'')+' · £'+spent.toFixed(2)+' spent'+(estPot>0?' · est £'+estPot.toFixed(2):'')+
          '<br><span style="color:var(--text-tertiary,var(--muted));font-size:11px;">Started '+timeStr+'</span>'+
        '</div>'+
        '<button class="btn btn-primary" style="width:100%;justify-content:center;gap:6px;font-size:13px;" onclick="openActiveRunPage()">'+
          'Open sourcing <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'+
        '</button>'+
      '</div>';
  }

  // Comparable facts remain visible; opening a run reveals its items and costs.
  let pastHTML='';
  if(ended.length>0){
    const sortOpts=[['newest','Newest first'],['oldest','Oldest first'],['items','Most items'],['spend','Highest spend'],['profit','Highest profit'],['roi','Highest ROI']];
    const sortSel=sortOpts.map(function(o){return '<option value="'+o[0]+'"'+(RUNS_SORT===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('');
    const rows=sorted.map(function(run){
      const st=runStats.get(run.id),date=dateKey(run);
      const parsed=new Date(date+'T12:00:00');
      const dateLabel=isNaN(parsed.getTime())?'Date not set':parsed.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
      const profitCol=st.profit>0?'var(--green)':st.profit<0?'var(--red)':'var(--text)';
      const search=[run.name,run.location,date,dateLabel].join(' ').toLowerCase();
      const accessible=[run.name||'Sourcing run',dateLabel,run.location||'',st.sold+' of '+st.items+' items sold','Spent '+fmt(st.cost),'Net profit '+fmt(st.profit),'ROI '+(st.roi===null?'not available':st.roi.toFixed(0)+'%')].join(', ');
      return '<button type="button" class="run-history-row" aria-label="'+esc(accessible)+'" data-runid="'+esc(run.id)+'" data-run-search="'+esc(search)+'" onclick="openRunPageFromRuns(this.dataset.runid)">'
        +'<span class="rh-body"><span class="rh-name">'+esc(run.name||'Sourcing run')+'</span><span class="rh-meta">'+esc(dateLabel)+(run.location?' · '+esc(run.location):'')+'</span></span>'
        +'<span class="rh-sold"><span class="rh-mobile-label">Items </span><strong>'+st.sold+' / '+st.items+'</strong><span class="rh-sold-label"> sold</span></span>'
        +'<span class="rh-fact"><span class="rh-mobile-label">Spent</span><strong>'+fmt(st.cost)+'</strong></span>'
        +'<span class="rh-fact rh-profit" style="color:'+profitCol+'"><span class="rh-mobile-label">Net profit</span><strong>'+fmt(st.profit)+'</strong></span>'
        +'<span class="rh-fact"><span class="rh-mobile-label">ROI</span><strong>'+(st.roi===null?'—':st.roi.toFixed(0)+'%')+'</strong></span>'
        +'<span class="rh-chevron" aria-hidden="true">›</span></button>';
    }).join('');
    pastHTML='<section class="runs-history" aria-label="Sourcing history">'
      +'<div class="runs-history-title"><h2>Sourcing history</h2><span id="runs-result-count" role="status" aria-live="polite">'+ended.length+' runs</span></div>'
      +'<div class="runs-history-controls"><div class="inlist-search"><span class="inlist-search-ic">'+_selSearchIco(15)+'</span><input class="inlist-search-input" id="runs-search" type="search" aria-label="Search sourcing runs" placeholder="Search runs…" value="'+esc(window._RUNS_SEARCH||'')+'" oninput="_filterRunsHistory(this.value)"></div>'
      +'<select aria-label="Sort sourcing runs" class="sort-select past-runs-sort" onchange="_setRunsSort(this.value)">'+sortSel+'</select></div>'
      +'<details class="runs-history-help"><summary>About these figures</summary><p>Spend includes items, parts and run costs. Profit is from sales to date, after run costs.</p></details>'
      +'<div class="runs-list-head" aria-hidden="true"><span>Run / location</span><span>Sold / items</span><span>Spent</span><span>Net profit</span><span>ROI</span><span></span></div>'
      +'<div class="runs-list">'+rows+'</div><div id="runs-empty-search" class="inlist-empty" hidden>No runs match your search.</div></section>';
  }

  // ── Metrics strip — only when there's history to show ───────────────────
  let metricsHTML='';
  if(ended.length>0){
    const totalProfit=ended.reduce(function(s,r){return s+runStats.get(r.id).profit;},0);
    const avgProfit=totalProfit/ended.length;
    // Best run by ROI — "should I go back?" signal
    let bestRun=null,bestROI=-Infinity;
    ended.forEach(function(r){const roi=runStats.get(r.id).roi;if(roi!==null&&roi>bestROI){bestROI=roi;bestRun=r;}});
    // Total capital deployed and overall ROI
    const totalCapital=ended.reduce(function(s,r){return s+runStats.get(r.id).cost;},0);
    const overallROI=totalCapital>0?(totalProfit/totalCapital)*100:null;

    const mc=function(label,val,sub,valCol,clickRunId){
      const cursor=clickRunId?'cursor:pointer;':'';
      const click=clickRunId?'onclick="openRunPageFromRuns(\''+clickRunId+'\')"':'';
      // Keep semantic green/red on the value; omit inline colour when neutral.
      const vc=(valCol&&valCol!=='var(--text)')?' style="color:'+valCol+';"':'';
      return '<div class="card kpi'+(clickRunId?' clickable':'')+'" style="'+cursor+'" '+click+'>'
        +'<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">'
          +'<div class="kpi-label">'+label+'</div>'
          +(clickRunId?'<div class="kpi-viewlink">View run \u203a</div>':'')
        +'</div>'
        +'<div class="kpi-value num"'+vc+'>'+val+'</div>'
        +(sub?'<div class="kpi-foot">'+sub+'</div>':'')
      +'</div>';
    };

    metricsHTML='<div class="runs-kpis-v2 runs-kpis-stack" style="margin-bottom:18px;">'
      +mc('Return on runs',overallROI!==null?overallROI.toFixed(0)+'%':'\u2014',
        fmtK(totalProfit)+' profit · '+fmtK(totalCapital)+' spent',
        overallROI!==null&&overallROI>0?'var(--green)':overallROI!==null&&overallROI<0?'var(--red)':'var(--text)')
      +mc('Avg profit / run','\u00a3'+avgProfit.toFixed(0),
        ended.length+' completed run'+(ended.length!==1?'s':''),
        avgProfit>0?'var(--green)':avgProfit<0?'var(--red)':'var(--text)')
      +mc('Best session',bestRun?'\u00a3'+_runProfit(bestRun.id).toFixed(0):'\u2014',
        bestRun?esc(bestRun.name)+' \u00b7 '+bestROI.toFixed(0)+'% ROI'+((_activeSourcingRun?' \u00b7 1 active':'')):'No completed sourcing sessions',
        bestROI>0?'var(--green)':bestROI<0?'var(--red)':'var(--text)',
        bestRun?bestRun.id:null)
    +'</div>';
  }

  // Empty state — no runs logged yet (and none active). Previously supplied by
  // a helper that's since been removed; defined inline here.
  const emptyHTML=
    '<div style="text-align:center;padding:48px 24px;color:var(--text-secondary)">'
      +'<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">No sourcing activity yet</div>'
      +'<div style="font-size:13px;line-height:1.6;max-width:280px;margin:0 auto 18px">Start sourcing when you head out to track items, spend and profit for that session.</div>'
      +'<button class="btn btn-primary" style="gap:6px;padding:10px 18px;font-size:13px" onclick="openStartRunModal()">'
        +'<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>'
        +'Start sourcing</button>'
    +'</div>';

  const html=
    '<div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:nowrap;">'+
      '<div style="min-width:0;"><div class="page-title" style="white-space:nowrap;">Sourcing</div>'+
      '<div class="page-subtitle" style="display:none;">Track sourcing sessions, spend and profitability.</div></div>'+
      '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">'+
        '<button class="btn btn-secondary" style="white-space:nowrap;" onclick="openLogPastRunModal()" title="Log past sourcing">'+
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="display:inline-block;vertical-align:-2px"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'+
        '<span class="btn-label-hide-xs"> Log past</span>'+
      '</button>'+
        (!_activeSourcingRun?
          '<button class="btn btn-primary" style="gap:6px;white-space:nowrap;" onclick="openStartRunModal()">'+
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>'+
            '<span class="btn-label-hide-xs">Start sourcing</span>'+
            '<span class="btn-label-show-xs" style="display:none">Start</span>'+
          '</button>':
          '<button class="btn btn-primary" style="gap:6px;background:var(--green);border-color:var(--green);color:#fff;white-space:nowrap;" onclick="openActiveRunPage()">'+
            '<span style="width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block;flex-shrink:0;animation:navDotPulse 2s ease-in-out infinite;"></span>'+
            '<span class="btn-label-hide-xs">Sourcing active \u203a</span>'+
            '<span class="btn-label-show-xs" style="display:none">Active \u203a</span>'+
          '</button>')+
      '</div>'+
    '</div>'+
    metricsHTML+
    activeCardHTML+
    (hasRuns||_activeSourcingRun?pastHTML:emptyHTML);

  page.innerHTML=html;
  _filterRunsHistory(window._RUNS_SEARCH||'');
}
});
