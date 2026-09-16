/* RETRADE Cashflow liability visibility refinement.
 * Loaded after app-core.js.
 *
 * The cash ledger remains authoritative for money physically held. This layer
 * adds the operational view the reseller needs: free cash after amounts already
 * owed to suppliers / partners, while keeping reconciliation tied to real cash.
 */
(function(){
  'use strict';

  if(typeof window.renderCash!=='function'||typeof calcCashSummary!=='function')return;

  var originalRenderCash=window.renderCash;

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function money(v){return typeof fmt==='function'?fmt(num(v)):'£'+num(v).toFixed(2);}

  function enhanceCashflow(){
    var page=document.getElementById('p-cash');if(!page)return;
    var c;try{c=calcCashSummary();}catch(_){return;}
    var liabilities=c.unpaidLiabilities||{supplier:0,partner:0,total:0};
    var partner=Math.max(0,num(liabilities.partner)),supplier=Math.max(0,num(liabilities.supplier));
    var reserved=Math.max(0,num(liabilities.total));
    var free=+(num(c.cashAvailable)-reserved).toFixed(2);

    /* The native headline is real cash held. Present the more useful operating
       number without changing the ledger or the reconciliation baseline. */
    var hero=null;
    Array.prototype.some.call(page.querySelectorAll('.card'),function(card){
      var label=card.querySelector('.kpi-label');
      if(label&&/business cash available/i.test(String(label.textContent||''))){hero=card;return true;}
      return false;
    });
    if(hero){
      var breakdown=[];
      if(partner>0)breakdown.push('partner '+money(partner));
      if(supplier>0)breakdown.push('supplier '+money(supplier));
      hero.id='rt-free-cash-card';
      hero.innerHTML='<div class="kpi-label">Free cash after commitments</div>'
        +'<div class="num" style="font-size:clamp(28px,7vw,40px);font-weight:800;line-height:1.05;margin-top:4px;'+(free<0?'color:var(--red);':'')+'">'+money(free)+'</div>'
        +'<div class="kpi-foot" style="margin-top:8px;line-height:1.5;">'+money(c.cashAvailable)+' cash held − '+money(reserved)+' already committed'
          +(breakdown.length?' ('+breakdown.join(' · ')+')':'')+'. Outstanding settlements stay in the bank/platform balance until paid, but are not treated as free to spend.</div>'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--text-secondary);">'
          +'<span style="flex:1;min-width:120px">Cash held <strong class="num" style="color:var(--text)">'+money(c.cashAvailable)+'</strong></span>'
          +'<span style="flex:1;min-width:120px">Reserved <strong class="num" style="color:'+(reserved>0?'var(--accent)':'var(--text)')+'">'+money(reserved)+'</strong></span>'
        +'</div>';
    }

    /* Keep partner money visible even when the lower combined liability card is
       collapsed/off-screen. This does not create a cash event; paid settlements
       already do that through the canonical ledger. */
    var cashHeading=Array.prototype.slice.call(page.querySelectorAll('.sl')).find(function(el){return String(el.textContent||'').trim().toLowerCase()==='cash';});
    var grid=cashHeading&&cashHeading.nextElementSibling&&cashHeading.nextElementSibling.classList.contains('kgrid')?cashHeading.nextElementSibling:null;
    if(grid&&!document.getElementById('rt-partner-due-kpi')){
      var card=document.createElement('div');card.className='card kpi';card.id='rt-partner-due-kpi';
      card.innerHTML='<div class="kpi-label">Partner money due</div><div class="kpi-value num" style="color:'+(partner>0?'var(--accent)':'var(--text)')+'">'+money(partner)+'</div><div class="kpi-foot">Outstanding partner share already reserved from free cash</div>';
      grid.appendChild(card);
    }
  }

  window.renderCash=function(){
    var out=originalRenderCash.apply(this,arguments);
    enhanceCashflow();
    return out;
  };

  requestAnimationFrame(function(){var p=document.getElementById('p-cash');if(p&&p.children.length)enhanceCashflow();});
})();

/* Relist fee integrity — 2026-09-16
 *
 * Return -> Relist is already a billable listing in app-core: confirmRelist()
 * stamps resaleListingFee and freezes the exact fee on the full-return event.
 * The separate manual `markRelisted()` maintenance action previously only reset
 * the freshness clock. That meant a real marketplace relist could exist in the
 * timeline without entering item P&L or cashflow.
 *
 * Manual relists now:
 *   - charge the platform's current insertion/listing fee;
 *   - add it to the ACTIVE sale cycle (Sale 1 listingFee, later cycles
 *     resaleListingFee);
 *   - persist the exact fee/platform/sale number on refreshHistory;
 *   - surface a dated cash event without double-counting the original listing.
 *
 * No schema migration is needed: refreshHistory is already persisted as JSON.
 */
(function(){
  'use strict';

  function n(v){v=Number(v);return isFinite(v)?v:0;}
  function round(v){return +n(v).toFixed(2);}
  function isFullReturn(r){return !!r&&(r.type==='full_seller'||r.type==='full_ebay');}
  function getItem(m,id){
    try{return (DB[m]||[]).find(function(x){return x&&String(x.id)===String(id);})||null;}catch(_){return null;}
  }
  function currentPlatform(i){
    try{return typeof _itemPlatform==='function'?_itemPlatform(i):(i&&i.defaultPlatform)||null;}catch(_){return (i&&i.defaultPlatform)||null;}
  }
  function relistFee(i,platform){
    try{return Math.max(0,n(typeof _listingFeeFor==='function'?_listingFeeFor(platform||currentPlatform(i)):0));}catch(_){return 0;}
  }
  function currentRelistSaleNo(i){
    var hasRelistedReturn=(i&&i.returnHistory||[]).some(function(r){return isFullReturn(r)&&!!r._relistedAt;});
    if(!hasRelistedReturn)return 1;
    try{
      if(typeof _currentResaleSaleNo==='function')return Math.max(2,n(_currentResaleSaleNo(i))||2);
    }catch(_){}
    var max=1;
    (i&&i.returnHistory||[]).forEach(function(r){if(isFullReturn(r)&&r._relistedAt)max=Math.max(max,n(r.saleNo)||1);});
    return Math.max(2,max+1);
  }
  function feeText(v){
    try{return typeof fmt==='function'?fmt(v):'£'+n(v).toFixed(2);}catch(_){return '£'+n(v).toFixed(2);}
  }

  /* Exact total of RELIST fees only (original first-list insertion excluded).
     Return-driven relists are authoritative on returnHistory; manual relists are
     authoritative on refreshHistory. `_fromReturn` rows are excluded from the
     latter because they mirror the same returnHistory event. */
  window._totalRelistingFees=function(i){
    if(!i)return 0;
    var total=0;
    (i.returnHistory||[]).forEach(function(r){
      if(r&&r._relistedAt)total+=Math.max(0,n(r._listingFeeAtRelist));
    });
    (i.refreshHistory||[]).forEach(function(e){
      if(e&&e.type==='relist'&&!e._fromReturn)total+=Math.max(0,n(e._listingFee));
    });
    return round(total);
  };

  /* Replace only the manual maintenance relist. Return-driven confirmRelist()
     remains untouched, preventing a second charge on that path. */
  if(typeof window.markRelisted==='function'){
    window.markRelisted=function(m,id){
      var i=getItem(m,id);
      if(!i)return;
      if(i.dateSold||i.resaleSalePrice||i.isReturned){
        try{toast('Only active listings can be relisted');}catch(_){}
        return;
      }

      var date=(typeof _todayISO==='function')?_todayISO():new Date().toISOString().slice(0,10);
      var platform=currentPlatform(i);
      var fee=relistFee(i,platform);
      var saleNo=currentRelistSaleNo(i);

      /* Sale 1's listingFee and the live resaleListingFee are per-cycle totals.
         Adding here means every existing P&L/receipt path that already reads the
         cycle field automatically includes this extra marketplace charge. */
      if(fee>0){
        if(saleNo===1)i.listingFee=round(n(i.listingFee)+fee);
        else i.resaleListingFee=round(n(i.resaleListingFee)+fee);
      }

      if(!Array.isArray(i.refreshHistory))i.refreshHistory=[];
      i.refreshHistory.push({
        type:'relist',
        date:date,
        _listingFee:round(fee),
        _saleNo:saleNo,
        _platform:platform||null
      });
      i._lastRelistAt=date;

      try{saveDB();}catch(e){console.error('[RETRADE] manual relist save failed',e);throw e;}
      try{toast(fee>0?'Marked as relisted — '+feeText(fee)+' listing fee applied':'Marked as relisted — no listing fee on this platform');}catch(_){}
      try{var s=_getSecStates();renderItemPage(m,id);_applySecStates(s);}catch(_){}
    };
  }

  /* Cashflow previously knew only the original listing fee and the fee attached
     to a return-driven relist. Add dated manual relist events as well.

     Sale 1's `listingFee` is now a cycle total, so the base cash event would
     contain original + manual relists at the original listing date. Subtract the
     manual portion from that base event, then add each manual fee back on its
     actual relist date. Later sale cycles never have a base listing event, so
     their manual relists are simply appended alongside the return-driven fee. */
  if(typeof window._cashEventsAll==='function'){
    var baseCashEventsAll=window._cashEventsAll;
    window._cashEventsAll=function(){
      var out=baseCashEventsAll.apply(this,arguments);
      if(!Array.isArray(out))return out;

      try{
        var keys=typeof allDBKeys==='function'?allDBKeys():[];
        keys.forEach(function(k){
          (DB[k]||[]).forEach(function(i){
            if(!i)return;
            var manual=[];
            (i.refreshHistory||[]).forEach(function(e,idx){
              if(!e||e.type!=='relist'||e._fromReturn)return;
              var fee=Math.max(0,n(e._listingFee));
              if(!fee)return;
              manual.push({e:e,idx:idx,fee:fee,saleNo:Math.max(1,n(e._saleNo)||1)});
            });
            if(!manual.length)return;

            var sale1Manual=round(manual.reduce(function(sum,x){return sum+(x.saleNo===1?x.fee:0);},0));
            if(sale1Manual>0){
              var baseId='listing:'+i.id;
              var base=out.find(function(ev){return ev&&ev.id===baseId;});
              if(base)base.amount=round(Math.max(0,n(base.amount)-sale1Manual));
            }

            manual.forEach(function(x){
              out.push({
                id:'manualrelistfee:'+i.id+':'+x.idx,
                date:x.e.date||null,
                type:'listing_fee',
                direction:'out',
                amount:round(x.fee),
                description:'Relist fee · '+(i.item||'Item')+' · Sale '+x.saleNo,
                source:'item',
                itemId:i.id,
                saleNo:x.saleNo
              });
            });
          });
        });
      }catch(e){console.warn('[RETRADE] manual relist cashflow enhancement skipped',e);}

      return out.filter(function(ev){return !ev||ev.amount==null||n(ev.amount)>0;});
    };
  }
})();
