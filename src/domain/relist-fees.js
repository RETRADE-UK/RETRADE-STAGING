/* RETRADE relist-fee integrity repair.
 * Loaded after src/features/cashflow/liabilities.js.
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

  // Historical charges through 28 October were reconciled to statement rows.
  var AUTO_START='2026-10-29';
  function monthDay(anchor,offset){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor||''))return null;
    var a=anchor.split('-').map(Number),d=new Date(Date.UTC(a[0],a[1]-1+offset,1));
    var last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(a[2],last));return d.toISOString().slice(0,10);
  }
  function renewItem(i,through){
    through=day(through||new Date().toISOString());
    if(!i||i.scrappedAt||i.isReturned||i.state==='sourced'||i.state==='unlisted')return 0;
    if(!Array.isArray(i.refreshHistory))i.refreshHistory=[];
    var anchors=[day(i.dateListed)],saleNo=1;
    fullReturns(i).forEach(function(r){if(r._relistedAt){anchors.push(day(r._relistedAt));saleNo=Math.max(saleNo,saleNoOf(r)+1);}});
    i.refreshHistory.forEach(function(e){if(e&&e.type==='relist')anchors.push(day(e.date));});
    var sold=day(saleNo>1?i.resaleDateSold:i.dateSold);
    if(i.state==='sold'&&!sold)return 0;
    var end=sold&&sold<through?sold:through,anchor=latestDate(anchors);
    if(!anchor||anchor>end)return 0;
    var platform=inferPlatform(i,null,saleNo);if(platform!=='ebay_biz')return 0;
    var policy=i.refreshHistory.filter(function(e){return e&&e.type==='renewal_policy';}).slice(-1)[0];
    if(policy&&policy.enabled===false)return 0;
    var fee=policy&&policy.fee!=null?Math.max(0,round(policy.fee)):feeFor(platform);if(fee===null)return 0;
    var shared=i.refreshHistory.filter(function(e){return e&&e.type==='bundle_listing_fee'&&e.basis==='shared'&&Number(e.saleNo||1)===saleNo;}).slice(-1)[0];
    if(shared){
      if(n(shared.totalFee)<=0)fee=0;
      else{
        var peers=allItems().filter(function(x){return !x.dateSold&&!x.resaleDateSold&&!x.isReturned&&!x.scrappedAt&&x.state!=='sourced'&&x.state!=='unlisted'&&(x.refreshHistory||[]).some(function(e){return e&&e.type==='bundle_listing_fee'&&e.basis==='shared'&&e.bundleId===shared.bundleId;});}).sort(function(a,b){return String(a.id).localeCompare(String(b.id));});
        var ix=peers.indexOf(i);if(ix<0)return 0;
        var pennies=Math.round(fee*100);fee=(Math.floor(pennies/peers.length)+(ix<pennies%peers.length?1:0))/100;
      }
    }
    var changed=0;
    for(var m=1;m<1200;m++){
      var due=monthDay(anchor,m);if(!due||due>end||(sold&&due>=sold))break;
      if(due<AUTO_START)continue;
      if(i.refreshHistory.some(function(e){return e&&e.type==='monthly_renewal'&&e.date===due&&e.anchor===anchor;}))continue;
      i.refreshHistory.push({type:'monthly_renewal',date:due,anchor:anchor,_saleNo:saleNo,_platform:platform,_listingFee:fee,estimated:true});
      applyFeeToCycle(i,saleNo,fee);changed++;
    }
    return changed;
  }
  window._ebayRenewalDate=monthDay;window._accrueEbayRenewals=renewItem;

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

    changed+=renewItem(i);
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


    var monthly=(i.refreshHistory||[]).filter(function(e){return e&&e.type==='monthly_renewal';});
    var verified=(i.refreshHistory||[]).some(function(e){return e&&e.type==='verified_sale_fees';});
    if(listingInput&&(monthly.length||verified)&&!page.querySelector('[data-rt-fee-source]')){
      var host=listingInput.closest('.ip-receipt-row');
      if(host){var note=document.createElement('div');note.className='ip-receipt-row indent';note.setAttribute('data-rt-fee-source','1');
        note.textContent=(verified?'Transaction fee evidence saved; edits may use estimates. ':'')+(monthly.length?'Monthly renewals: '+monthly.length+' / '+round(monthly.reduce(function(v,e){return v+n(e._listingFee);},0)).toFixed(2)+' GBP included; estimated until checked against eBay.':'');
        host.insertAdjacentElement('afterend',note);
      }
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

    var idx=-1;for(var j=i.refreshHistory.length-1;j>=0;j--){if(i.refreshHistory[j]&&(i.refreshHistory[j].type==='relist'||i.refreshHistory[j].type==='refresh')){idx=j;break;}}
    if(idx<0)return;
    var removed=i.refreshHistory.splice(idx,1)[0];
    if(removed&&removed.type==='relist'){
      i.refreshHistory=i.refreshHistory.filter(function(e){if(e&&e.type==='monthly_renewal'&&e.anchor===day(removed.date)){removeFeeFromCycle(i,e._saleNo,e._listingFee);return false;}return true;});
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
    window._cashEventsAll=function(){
      repairAll(false);var events=cashWithManualRelists.apply(this,arguments);
      allItems().forEach(function(i){
        var verifiedBySale={};
        (i.refreshHistory||[]).forEach(function(e){if(e&&e.type==='verified_listing_fees')verifiedBySale[Math.max(1,n(e.saleNo)||1)]=e;});
        var coverage={},verified=Object.keys(verifiedBySale).map(function(k){return verifiedBySale[k];});
        verified.forEach(function(v){coverage[Math.max(1,n(v.saleNo)||1)]=day(v.through)||latestDate((v.entries||[]).map(function(e){return e.date;}));});
        if(verified.length){
          events=events.filter(function(e){
            if(e.itemId!==i.id||e.type!=='listing_fee')return true;
            var sn=Math.max(1,n(e.saleNo)||1);
            if(String(e.id).indexOf('relistfee:'+i.id+':')===0){var idx=Number(String(e.id).slice(('relistfee:'+i.id+':').length));sn=saleNoOf((i.returnHistory||[])[idx])+1;}
            return !coverage[sn]||day(e.date)>coverage[sn];
          });
          verified.forEach(function(v){(v.entries||[]).forEach(function(e,idx){
            if(!n(e.amount))return;
            events.push({id:'verifiedlisting:'+i.id+':'+v.saleNo+':'+e.sourceRow+':'+idx,date:e.date,type:'listing_fee',direction:n(e.amount)<0?'in':'out',amount:Math.abs(n(e.amount)),description:'Actual eBay listing charge / credit - '+i.item,source:'item',itemId:i.id,saleNo:v.saleNo});
          });});
        }
        // liabilities.js already dates manual relists. Process only monthly rows.
        (i.refreshHistory||[]).filter(function(e){return e&&e.type==='monthly_renewal'&&n(e._listingFee)>0;}).forEach(function(e,idx){
          var sn=Math.max(1,n(e._saleNo)||1);
          if(coverage[sn]&&day(e.date)<=coverage[sn])return;
          if(!coverage[sn]){
            var source=null;
            if(sn===1)source=events.find(function(x){return x.id==='listing:'+i.id;});
            else{
              var r=priorReturnForSale(i,sn),ri=(i.returnHistory||[]).indexOf(r);
              // An old missing relist snapshot falls back to the cumulative cycle
              // field. Explicit return snapshots contain only the original fee.
              if(r&&r._listingFeeAtRelist==null)source=events.find(function(x){return x.id==='relistfee:'+i.id+':'+ri;});
            }
            if(source)source.amount=round(Math.max(0,n(source.amount)-n(e._listingFee)));
          }
          events.push({id:'renewal:'+i.id+':'+e.date+':'+idx,date:e.date,type:'listing_fee',direction:'out',amount:round(e._listingFee),description:'Estimated monthly renewal - '+i.item,source:'item',itemId:i.id,saleNo:sn,estimated:true});
        });
      });
      return events.filter(function(e){return n(e.amount)>0;}).sort(function(a,b){return (a.date||'').localeCompare(b.date||'')||String(a.id).localeCompare(String(b.id));});
    };
  }

  [1200,3200,7000].forEach(function(ms){
    setTimeout(function(){try{repairAll(true);}catch(e){console.warn('[RETRADE] relist fee legacy repair skipped',e);}},ms);
  });
  try{window.addEventListener('retrade:data-ready',function(){repairAll(true);});}catch(_){}
})();
