/* RETRADE relist-fee integrity repair.
 * Loaded after cashflow-liabilities.js.
 *
 * The core has two legitimate relist paths:
 *  - returned item -> Relist (confirmRelist), which already freezes its fee on
 *    the return event;
 *  - active listing -> Mark Relisted (maintenance), which is also a real new
 *    marketplace listing and therefore incurs the platform insertion fee.
 *
 * v3106 repairs legacy maintenance relists that were logged before the fee was
 * stamped, keeps undo financially reversible, and makes the item page show the
 * fee evidence clearly. The repair is idempotent: a maintenance event with an
 * explicit _listingFee (including 0) is never charged again.
 */
(function(){
  'use strict';

  var REPAIR_TAG='2026-09-16-v3106';

  function n(v){v=Number(v);return isFinite(v)?v:0;}
  function round(v){return +n(v).toFixed(2);}
  function day(v){return v?String(v).slice(0,10):'';}
  function isFullReturn(r){return !!r&&(r.type==='full_seller'||r.type==='full_ebay');}
  function validPlatform(p){
    try{return !!(p&&typeof PLATFORMS!=='undefined'&&PLATFORMS[p]);}catch(_){return false;}
  }
  function getItem(m,id){
    try{return (DB[m]||[]).find(function(x){return x&&String(x.id)===String(id);})||null;}catch(_){return null;}
  }
  function fullReturns(i){return (i&&i.returnHistory||[]).filter(isFullReturn);}
  function latestDate(values){
    var xs=(values||[]).map(day).filter(Boolean).sort();
    return xs.length?xs[xs.length-1]:null;
  }
  function saleNoOf(r){return Math.max(1,n(r&&r.saleNo)||1);}

  function mirrorReturnForMaintenance(i,e){
    var d=day(e&&e.date);if(!d)return null;
    return fullReturns(i).find(function(r){return day(r._relistedAt)===d;})||null;
  }

  function inferSaleNo(i,e){
    if(e&&e._saleNo!=null)return Math.max(1,n(e._saleNo)||1);
    var d=day(e&&e.date),saleNo=1;
    if(!d)return saleNo;
    fullReturns(i).forEach(function(r){
      var rd=day(r._relistedAt);
      if(rd&&rd<=d)saleNo=Math.max(saleNo,saleNoOf(r)+1);
    });
    return saleNo;
  }

  function fullReturnForSale(i,saleNo){
    var target=Math.max(1,n(saleNo)||1);
    return fullReturns(i).slice().reverse().find(function(r){return saleNoOf(r)===target;})||null;
  }

  function priorReturnForSale(i,saleNo){
    var target=Math.max(1,n(saleNo)||1)-1;
    if(target<1)return null;
    return fullReturns(i).slice().reverse().find(function(r){return saleNoOf(r)===target&&r._relistedAt;})||null;
  }

  function inferPlatform(i,e,saleNo){
    if(e&&validPlatform(e._platform))return e._platform;
    if(saleNo<=1){
      try{
        var s1=(typeof _s1Platform==='function')?_s1Platform(i):null;
        if(validPlatform(s1))return s1;
      }catch(_){}
      if(validPlatform(i&&i.salePlatform))return i.salePlatform;
    }else{
      var prior=priorReturnForSale(i,saleNo);
      if(prior&&validPlatform(prior._platformAtRelist))return prior._platformAtRelist;
      var archived=fullReturnForSale(i,saleNo);
      if(archived&&validPlatform(archived._platformAtReturn))return archived._platformAtReturn;
      if(validPlatform(i&&i.resalePlatform))return i.resalePlatform;
    }
    try{
      var live=(typeof _itemPlatform==='function')?_itemPlatform(i):null;
      if(validPlatform(live))return live;
    }catch(_){}
    if(validPlatform(i&&i.defaultPlatform))return i.defaultPlatform;
    return null;
  }

  function feeFor(platform){
    if(!validPlatform(platform))return null;
    try{return round(Math.max(0,n(typeof _listingFeeFor==='function'?_listingFeeFor(platform):0)));}catch(_){return null;}
  }

  function applyFeeToCycle(i,saleNo,fee){
    fee=round(fee);if(!i||fee<=0)return;
    saleNo=Math.max(1,n(saleNo)||1);
    var archived=fullReturnForSale(i,saleNo);
    if(saleNo===1){
      var before=round(i.listingFee);
      i.listingFee=round(before+fee);
      if(archived){
        var snapBase=archived._listingFeeAtReturn!=null?round(archived._listingFeeAtReturn):before;
        archived._listingFeeAtReturn=round(snapBase+fee);
      }
      return;
    }
    if(archived&&archived._dateSoldAtReturn){
      var prior=priorReturnForSale(i,saleNo);
      var base=archived._listingFeeAtReturn!=null
        ? round(archived._listingFeeAtReturn)
        : (prior&&prior._listingFeeAtRelist!=null?round(prior._listingFeeAtRelist):0);
      archived._listingFeeAtReturn=round(base+fee);
    }else{
      i.resaleListingFee=round(n(i.resaleListingFee)+fee);
    }
  }

  function removeFeeFromCycle(i,saleNo,fee){
    fee=round(fee);if(!i||fee<=0)return;
    saleNo=Math.max(1,n(saleNo)||1);
    var archived=fullReturnForSale(i,saleNo);
    if(saleNo===1){
      i.listingFee=round(Math.max(0,n(i.listingFee)-fee));
      if(archived&&archived._listingFeeAtReturn!=null){
        archived._listingFeeAtReturn=round(Math.max(0,n(archived._listingFeeAtReturn)-fee));
      }
      return;
    }
    if(archived&&archived._dateSoldAtReturn&&archived._listingFeeAtReturn!=null){
      archived._listingFeeAtReturn=round(Math.max(0,n(archived._listingFeeAtReturn)-fee));
    }else{
      i.resaleListingFee=round(Math.max(0,n(i.resaleListingFee)-fee));
    }
  }

  /* Backfill maintenance relists created by old builds. A same-day maintenance
     row matching a return-driven relist is treated as the old mirror row, not a
     second listing, so historical data cannot be double-charged. */
  function ensureItem(i){
    if(!i)return 0;
    var changed=0;
    if(!Array.isArray(i.refreshHistory))i.refreshHistory=[];

    i.refreshHistory.forEach(function(e){
      if(!e||e.type!=='relist')return;
      if(e._fromReturn)return;
      if(e._listingFee!==undefined&&e._listingFee!==null)return;

      var mirror=mirrorReturnForMaintenance(i,e);
      if(mirror){
        e._fromReturn=true;
        e._saleNo=saleNoOf(mirror)+1;
        e._platform=mirror._platformAtRelist||null;
        e._feeRepair=REPAIR_TAG;
        changed++;
        return;
      }

      var saleNo=inferSaleNo(i,e);
      var platform=inferPlatform(i,e,saleNo);
      var fee=feeFor(platform);
      if(fee===null)return;

      e._saleNo=saleNo;
      e._platform=platform;
      e._listingFee=fee;
      e._feeRepair=REPAIR_TAG;
      applyFeeToCycle(i,saleNo,fee);
      changed++;
    });

    var relistDates=[];
    i.refreshHistory.forEach(function(e){if(e&&e.type==='relist'&&e.date)relistDates.push(e.date);});
    fullReturns(i).forEach(function(r){if(r&&r._relistedAt)relistDates.push(r._relistedAt);});
    var lastRelist=latestDate(relistDates);
    if((i._lastRelistAt||null)!==(lastRelist||null)){i._lastRelistAt=lastRelist;changed++;}

    var lastRefresh=latestDate(i.refreshHistory.filter(function(e){return e&&e.type==='refresh';}).map(function(e){return e.date;}));
    if((i._lastRefreshAt||null)!==(lastRefresh||null)){i._lastRefreshAt=lastRefresh;changed++;}

    return changed;
  }

  function allItems(){
    var out=[];
    try{
      (typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(k){
        (DB[k]||[]).forEach(function(i){if(i)out.push(i);});
      });
    }catch(_){}
    return out;
  }

  function repairAll(persist){
    var changed=0;
    allItems().forEach(function(i){changed+=ensureItem(i);});
    if(changed&&persist){
      try{saveDB();}catch(e){console.warn('[RETRADE] relist fee repair save deferred',e);}
    }
    return changed;
  }

  function manualRelistEvents(i){
    ensureItem(i);
    return (i&&i.refreshHistory||[]).filter(function(e){return e&&e.type==='relist'&&!e._fromReturn;});
  }

  function totalRelistingFees(i){
    if(!i)return 0;ensureItem(i);
    var total=0;
    fullReturns(i).forEach(function(r){if(r&&r._relistedAt)total+=Math.max(0,n(r._listingFeeAtRelist));});
    manualRelistEvents(i).forEach(function(e){total+=Math.max(0,n(e._listingFee));});
    return round(total);
  }
  window._totalRelistingFees=totalRelistingFees;

  function totalRelistCount(i){
    if(!i)return 0;
    var count=manualRelistEvents(i).length;
    fullReturns(i).forEach(function(r){if(r&&r._relistedAt)count++;});
    return count;
  }

  function latestTouch(i){
    if(!i)return null;ensureItem(i);
    return latestDate([i._lastRefreshAt,i._lastRelistAt]);
  }

  function enhanceItemPage(i){
    if(!i)return;
    var page=document.getElementById('p-item');if(!page)return;

    var last=latestTouch(i);
    if(last){
      Array.prototype.forEach.call(page.querySelectorAll('div'),function(el){
        if(el.children.length)return;
        var txt=String(el.textContent||'').trim();
        if(!/\brefresh(?:es)?\b/i.test(txt)||!/\brelist(?:s)?\b/i.test(txt)||!/\blast\b/i.test(txt))return;
        var prefix=txt.replace(/\s*·\s*last\s+.+$/i,'');
        try{el.textContent=prefix+' · last '+(typeof fmtDate==='function'?fmtDate(last):last);}catch(_){el.textContent=prefix+' · last '+last;}
      });
    }

    var manual=manualRelistEvents(i);
    var sale1Manual=manual.filter(function(e){return Math.max(1,n(e._saleNo)||1)===1&&n(e._listingFee)>0;});
    var listingInput=page.querySelector('.rcpt-listing-fee-input');
    if(listingInput&&sale1Manual.length){
      var row=listingInput.closest('.ip-receipt-row');
      var lab=row&&row.querySelector('span:first-child');
      if(lab)lab.textContent='Listing fees ('+(sale1Manual.length+1)+' listings)';
    }

    var total=totalRelistingFees(i),count=totalRelistCount(i);
    if(total>0&&listingInput&&!page.querySelector('[data-rt-relist-total="1"]')){
      var host=listingInput.closest('.ip-receipt-row');
      if(host){
        var info=document.createElement('div');
        info.className='ip-receipt-row indent';
        info.setAttribute('data-rt-relist-total','1');
        info.innerHTML='<span style="flex:1;color:var(--text-secondary)">↳ Total relisting fees ('+count+')</span>'
          +'<span class="ip-receipt-val" style="color:var(--red)">−'+(typeof fmt==='function'?fmt(total):'£'+total.toFixed(2))+' <span style="color:var(--muted);font-size:10px">included above</span></span>';
        host.insertAdjacentElement('afterend',info);
      }
    }

    var feeEvents=manual.filter(function(e){return n(e._listingFee)>0;});
    var rows=Array.prototype.slice.call(page.querySelectorAll('.ip-timeline-entry')).filter(function(row){
      var badge=row.querySelector('.history-badge.relist');
      var detail=row.querySelector('.ip-timeline-detail');
      return !!(badge&&detail&&/Freshness clock reset/i.test(detail.textContent||''));
    });
    rows.forEach(function(row,idx){
      var ev=feeEvents[idx];if(!ev)return;
      var detail=row.querySelector('.ip-timeline-detail');
      if(detail&&!/listing fee/i.test(detail.textContent||'')){
        detail.textContent='Freshness clock reset · Listing fee '+(typeof fmt==='function'?fmt(ev._listingFee):'£'+n(ev._listingFee).toFixed(2));
      }
    });
  }

  if(typeof window.renderItemPage==='function'){
    var baseRenderItemPage=window.renderItemPage;
    window.renderItemPage=function(m,id){
      var i=getItem(m,id),changed=i?ensureItem(i):0;
      if(changed){try{saveDB();}catch(_){} }
      var out=baseRenderItemPage.apply(this,arguments);
      try{enhanceItemPage(i);}catch(e){console.warn('[RETRADE] relist fee item-page enhancement skipped',e);}
      return out;
    };
  }

  window.undoLastMaintenance=function(m,id){
    var i=getItem(m,id);
    if(!i||!Array.isArray(i.refreshHistory)||!i.refreshHistory.length)return;
    ensureItem(i);
    var removed=i.refreshHistory.pop();
    if(removed&&removed.type==='relist'){
      if(!removed._fromReturn)removeFeeFromCycle(i,Math.max(1,n(removed._saleNo)||inferSaleNo(i,removed)),Math.max(0,n(removed._listingFee)));
      i._lastRelistAt=latestDate(i.refreshHistory.filter(function(e){return e&&e.type==='relist';}).map(function(e){return e.date;}));
    }else{
      i._lastRefreshAt=latestDate(i.refreshHistory.filter(function(e){return e&&e.type==='refresh';}).map(function(e){return e.date;}));
    }
    try{saveDB();}catch(_){}
    try{toast('Undone');}catch(_){}
    try{var s=_getSecStates();renderItemPage(m,id);_applySecStates(s);}catch(_){try{renderItemPage(m,id);}catch(__){}}
  };

  if(typeof window._cashEventsAll==='function'){
    var cashWithManualRelists=window._cashEventsAll;
    window._cashEventsAll=function(){repairAll(false);return cashWithManualRelists.apply(this,arguments);};
  }

  [1200,3200,7000].forEach(function(ms){
    setTimeout(function(){try{repairAll(true);}catch(e){console.warn('[RETRADE] relist fee legacy repair skipped',e);}},ms);
  });
  try{window.addEventListener('retrade:data-ready',function(){repairAll(true);});}catch(_){}
})();
