/* item view implementations. Shared state and stable public functions live in core. */
window.__rtRegisterView("item", {
"_renderItemPageInner": function(m,id){
  // Clean up any platform picker that was portaled to <body> (prevents orphans on re-render)
  document.querySelectorAll('[id^="ip-plat-picker-"]').forEach(function(p){
    if(p.parentElement===document.body)p.remove();
  });
  // Lookup tolerates both id and gid — some entry points (search deep-links,
  // external references) hold only a gid like "R-0042". Internal handlers
  // downstream all use the resolved i.id so nothing else needs to change.
  const i=(DB[m]||[]).find(x=>x.id===id||x.gid===id);
  const page=document.getElementById('p-item');
  if(!i){page.innerHTML='<div style="padding:40px;text-align:center;color:var(--muted)">Item not found</div>';return;}
  // Normalise id to the canonical internal id — the rest of this function
  // interpolates `id` into inline onclick handlers (undoSale, openTokenEdit,
  // savePostageMode, etc.) which all look items up by i.id only.
  id=i.id;

  // Patch A — Stock-state items have a minimal item page (no platform selector,
  // no BPF breakdown, no fees — none of those concepts apply pre-listing).
  // The full listed-item page lights up automatically once the item transitions
  // to state='listed' in a future patch.
  if(i.state==='sourced'){
    return _renderStockItemPage(m,i);
  }

  const _wasRelistedDetect = !i.isReturned && !i.dateSold && !i.resaleSalePrice &&
    (i.returnHistory||[]).some(r=>r.type==='full_seller'||r.type==='full_ebay');
  // _origSalePrice = the Sale 1 price. For any item that went through a full return
  // (active relist OR completed resale), read from the snapshot on the return entry.
  // i.salePrice is now the sale 2 price for resold items so we cannot use it for sale 1.
  const _s1FullReturns=(i.returnHistory||[]).filter(function(r){return (r.type==='full_seller'||r.type==='full_ebay')&&(Number(r.saleNo)||1)===1;});
  const _hasFullReturn=_s1FullReturns.length>0;
  const _origSalePrice = (_wasRelistedDetect||i.resaleSalePrice)&&_hasFullReturn
    ? (function(){
        const fe=_s1FullReturns;
        if(!fe.length)return i.salePrice||0;
        const last=fe[fe.length-1];
        return last._salePriceAtRelist||last._salePriceAtReturn||last.refundAmount||i.salePrice||0;
      })()
    : (i.salePrice||0);
  // For resold items, resolve sale 1 costs from snapshot so the receipt shows
  // the correct sale 1 values, not the current (sale 2) values.
  // v2.19.40 — resolve the Sale-1 snapshot in the RELISTED state too (not only
  // after resale), so an item awaiting its second sale reads Sale 1's frozen
  // economics from the return snapshot instead of the live (relist) values.
  // Without this, editing the live shipping/postage moved Sale 1's numbers as well.
  const _s1Snap=(_hasFullReturn&&(i.resaleSalePrice||_wasRelistedDetect))
    ?_s1FullReturns[_s1FullReturns.length-1]
    :null;
  const _rcptPostage=_s1Snap&&_s1Snap._postageAtRelist!==undefined?_s1Snap._postageAtRelist:(i.postage||0);
  const _rcptShipping=_s1Snap&&_s1Snap._shippingCostAtRelist!==undefined?_s1Snap._shippingCostAtRelist:(i.shippingCost||0);
  const _rcptPackaging=_s1Snap&&_s1Snap._packagingCostAtRelist!==undefined?_s1Snap._packagingCostAtRelist:(i.packagingCost||0);
  const _rcptPromo=_s1Snap&&_s1Snap._promoPercentAtRelist!==undefined?_s1Snap._promoPercentAtRelist:(i.promoPercent||0);
  const _s1PlatformIdRcpt=_s1Platform(i);
  const bpf=_netPlatformFeeAfterRefunds(i,1,_s1PlatformIdRcpt,_origSalePrice,_rcptPostage);
  const promoCost=_netPromoFeeAfterRefunds(i,1,_s1PlatformIdRcpt,_origSalePrice,_rcptPostage,_rcptPromo);
  const profit=calcGrossProfit(i);
  const roi=calcROI(i);
  const margin=calcMargin(i);
  // T-06: display guard for £0-cost items — calcROI returns null when totalInvested<=0
  // (mathematically correct), but the render layer should show ∞ rather than nothing.
  const _isZeroCost=(i.costPrice==null||i.costPrice===0)&&!(_rcptShipping>0)&&!(_rcptPackaging>0)&&!calcPartsCost(i);
  const roiDisplay=_isZeroCost&&profit!==null?'∞':(roi!==null?roi.toFixed(1)+'%':null);
  const marginDisplay=(margin!==null?margin.toFixed(1)+'%':null);
  const status=i.scrappedAt?(i.scrapReason==='donated'?'donated':'scrapped'):i.isReturned?'returned':i.resaleSalePrice?'resold':i.dateSold?'sold':i.condition==='spares'?'spares':'active';
  const hasReturn=(i.returnHistory||[]).length>0;
  const _plat=_s1Platform(i); // v2.19.33 — Sale 1 receipt reflects Sale 1's platform
  const _showPostage=(_plat!=='vinted');
  const _showSimpleDelivery=(_plat==='ebay'); // Simple Delivery: eBay private only; Biz uses postage policies
  const _showFee=(_plat!=='vinted'&&_plat!=='fb');
  const _feeLabel=_plat==='ebay'?'eBay BPF':_plat==='ebay_biz'?('eBay FVF (Biz · '+_ebayBizRateLabel(i.category,(i.salePrice||0),i.salePrice||0)+')'):_plat==='depop'?'Depop fee':_plat==='amazon_uk'?'Amazon fee':'Platform fee';
  const _promoLabel=_plat==='ebay'?'Promo %':'Boost %';
  const totalRefunded=(i.returnHistory||[]).reduce((s,r)=>s+(r.refundAmount||0),0);
  const totalReturnPostage=(i.returnHistory||[]).reduce((s,r)=>s+(r.returnPostage||0),0);
  // Platform-aware postage default:
  // ebay private → simple (eBay manages delivery); ebay_biz + others → custom
  // Falls back to cost-sniff only if _postageMode truly unset AND platform unclear
  const _defaultPostageMode=(function(plat){
    if(plat==='ebay')return 'simple';          // eBay private: Simple Delivery
    if(plat==='ebay_biz')return 'custom';      // eBay Biz: own courier/rates
    return 'custom';                            // all other platforms: custom
  })(_plat);
  const postageMode=i._postageMode||_defaultPostageMode;
  const sdIdx=i._sdRateIdx!=null?i._sdRateIdx:1;
  const sdOpts=_sdOptionsFor(i.salePrice||0,sdIdx); // needed for Simple Delivery rate select

  const timeline=[];
  const _listPlat=PLATFORMS[i.defaultPlatform||'ebay']||PLATFORMS['ebay'];
  timeline.push({date:i.dateListed||i.dateSourced||'',badge:'listed',label:'Listed on '+(_listPlat.short||'eBay'),detail:'Price: '+fmt(i.salePrice||0)+' · Cost: '+fmt(i.costPrice||0)});
  // Active-listing maintenance log — refreshes/manual relists that are not
  // already represented by a full-return cycle below.
  (i.refreshHistory||[]).forEach(function(rh,rhIdx){
    if(rh.type==='relist'){
      if(rh._fromReturn)return;
      timeline.push({date:rh.date||'',badge:'relist',label:'Relisted',detail:'Freshness clock reset',_maint:true,_maintIdx:rhIdx});
    }else if(rh.type==='bundle_listing_fee'){
      timeline.push({date:rh.date||'',badge:'listed',label:'Shared listing fee',detail:fmt(rh.allocatedFee||0)+' allocated from '+fmt(rh.totalFee||0)+' total'});
    }else if(rh.type==='refresh')timeline.push({date:rh.date||'',badge:'refresh',label:'Refreshed',detail:'Price nudge / photo update — listing kept',_maint:true,_maintIdx:rhIdx});
  });
  // Canonical Sale-N timeline. Historical Sale 2/3/4 cycles are reconstructed
  // from immutable return snapshots instead of the reusable live resale slot.
  const _tlCycles=(typeof _saleCycleNumbers==='function')?_saleCycleNumbers(i):[];
  _tlCycles.forEach(function(saleNo){
    const snap=(typeof _saleCycleSnapshot==='function')?_saleCycleSnapshot(i,saleNo):null;
    if(!snap||!snap.date)return;
    const ev=(typeof _saleEventForCycle==='function')?_saleEventForCycle(i,m,snap):{item:i,month:m,sale:String(saleNo),saleDate:snap.date,isReturnAdjustment:false,snapshot:snap};
    const br=(typeof _saleBreakdown==='function')?_saleBreakdown(ev):null;
    const plat=(PLATFORMS[snap.platformId]||{}).short||snap.platformId||'Platform';
    const detail=['Sale price: '+fmt(Number(snap.price)||0),plat];
    if(br)detail.push('Net P&L: '+fmt(br.netProfit));
    timeline.push({date:snap.date,badge:saleNo===1?'sale':'resale',label:'Sale '+saleNo+' sold',detail:detail.join(' · '),saleNo:saleNo});
  });
  (i.returnHistory||[]).forEach(function(r,rtnIdx){
    const lbl2={full_seller:'Full refund — seller handled',full_ebay:'Full refund — platform stepped in',partial_seller:'Partial refund — seller agreed',partial_ebay:'Partial refund — platform decided'};
    const bc=String(r.type||'').startsWith('full')?'return-full':'return-partial';
    const saleNo=Math.max(1,Number(r.saleNo)||1);
    const parts2=['Refund: '+fmt(r.refundAmount||0)];
    if(r.returnPostage>0)parts2.push('Return postage: '+fmt(r.returnPostage));
    if(r.notes)parts2.push('Note: '+esc(r.notes));
    timeline.push({date:r.loggedAt||'',badge:bc,label:'Sale '+saleNo+' · '+(lbl2[r.type]||r.type),detail:parts2.join(' · '),rtnIdx:rtnIdx,saleNo:saleNo});
    if(r._relistedAt){
      const condLabel=r._relistCondition==='spares'?'Spares / Repairs':'Working';
      const nextNo=saleNo+1;
      const relistPrice=Number(r._salePriceAtRelist!=null?r._salePriceAtRelist:(nextNo===_currentResaleSaleNo(i)?i.salePrice:0))||0;
      const relistPlat=(PLATFORMS[r._platformAtRelist]||{}).short||r._platformAtRelist||'';
      timeline.push({date:r._relistedAt,badge:'relist',label:'Relisted for Sale '+nextNo,detail:'Condition: '+condLabel+(relistPrice?' · Price: '+fmt(relistPrice):'')+(relistPlat?' · '+relistPlat:''),rtnIdx:rtnIdx,saleNo:nextNo});
    }
  });
  const typeOrder={listed:0,sale:1,resale:1,'return-full':2,'return-partial':2,relist:3,refresh:4}; // v1.4.6: same-day sold → refund → relist
  timeline.sort(function(a,b){if(a.date<b.date)return -1;if(a.date>b.date)return 1;return (typeOrder[a.badge]??1)-(typeOrder[b.badge]??1);});
  const badgeLbl={listed:'listed',sale:'sold',resale:'re-sold','return-full':'full return','return-partial':'partial return',relist:'relisted',refresh:'refreshed'};
  const _timelineLast=timeline.length?timeline[timeline.length-1]:null;
  const timelineHTML=timeline.map(function(t,idx){
    const isLast=idx===timeline.length-1;
    let undoBtn='';
    const _cascadeReturn=(!isLast&&t.badge==='return-full'&&_timelineLast&&_timelineLast.badge==='relist'&&_timelineLast.rtnIdx===t.rtnIdx);
    if(_cascadeReturn){
      undoBtn='<button onclick="event.stopPropagation();undoReturnCascade(\''+m+'\',\''+id+'\','+t.rtnIdx+')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--accent);cursor:pointer">↶ undo return + relist</button>';
    }else if(isLast){
      if(t.badge==='sale'&&Number(t.saleNo||1)===1&&i.dateSold)undoBtn='<button onclick="event.stopPropagation();undoSale(\''+m+'\',\''+id+'\')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--muted);cursor:pointer">✕ undo</button>';
      else if(t.badge==='resale'&&Number(t.saleNo||2)>=2&&i.resaleSalePrice)undoBtn='<button onclick="event.stopPropagation();undoResale(\''+m+'\',\''+id+'\')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--muted);cursor:pointer">✕ undo</button>';
      else if(t.badge==='return-full'||t.badge==='return-partial')undoBtn='<button onclick="event.stopPropagation();undoReturnEntry(\''+m+'\',\''+id+'\','+t.rtnIdx+')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--muted);cursor:pointer">✕ undo</button>';
      else if(t._maint)undoBtn='<button onclick="event.stopPropagation();undoLastMaintenance(\''+m+'\',\''+id+'\')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--muted);cursor:pointer">✕ undo</button>';
      else if(t.badge==='relist')undoBtn='<button onclick="event.stopPropagation();undoRelist(\''+m+'\',\''+id+'\','+t.rtnIdx+')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:4px;padding:1px 7px;font-size:11px;color:var(--muted);cursor:pointer">✕ undo</button>';
    }
    return '<div class="ip-timeline-entry">'
      +'<div class="ip-timeline-header">'
      +'<span class="history-badge '+t.badge+'">'+(badgeLbl[t.badge]||t.badge)+'</span>'
      +'<span style="color:var(--muted);font-size:12px">'+fmtDate(t.date)+'</span>'+undoBtn+'</div>'
      +'<div class="ip-timeline-label">'+t.label+'</div>'
      +(t.detail?'<div class="ip-timeline-detail">'+t.detail+'</div>':'')+'</div>';
  }).join('');
  const partsCost=calcPartsCost(i);
  // Sale 1 net: for resold items, compute using calcGrossProfit on a clone with resale fields stripped.
  // This guarantees the receipt's displayed net uses the SAME fee logic as calcGrossProfit
  // (including partial_seller fee-base reduction), so line items reconcile to the total.
  let sale1Net=0,sale1Partner=0;
  try{
    const _s1Cycle=_saleCycleSnapshot(i,1);
    const _s1Ev=_s1Cycle?_saleEventForCycle(i,m,_s1Cycle):null;
    if(_s1Ev){const br=_saleBreakdown(_s1Ev);sale1Net+=br.netProfit;sale1Partner+=br.partnerSplit;}
    (i.returnHistory||[]).forEach(function(r){
      if((Number(r.saleNo)||1)!==1)return;
      sale1Net+=_saleBreakdown({item:i,sale:'R',saleNo:1,isReturnAdjustment:true,isReturned:true,returnEntry:r,snapshot:_saleCycleSnapshot(i,1)}).netProfit;
    });
    sale1Net=+sale1Net.toFixed(2);
  }catch(e){sale1Net=profit;}
  // Display-only credit lines: compare original charges with the canonical net
  // charges after eligible seller-handled refunds. Entries tagged to Sale 2 are
  // deliberately excluded from the Sale 1 receipt.
  const _psTotal=(i.returnHistory||[]).filter(function(r){return r.type==='partial_seller'&&(Number(r.saleNo)||1)===1;}).reduce(function(s,r){return s+(r.refundAmount||0);},0);
  const _origBpfBeforeCredits=calcPlatformBPF(i,_origSalePrice,_rcptPostage,_s1PlatformIdRcpt);
  const _origPromoBeforeCredits=_calcPromoFee(_s1PlatformIdRcpt,_origSalePrice,_rcptPostage,_rcptPromo);
  const _bpfCredit=+Math.max(0,_origBpfBeforeCredits-bpf).toFixed(2);
  const _promoCredit=+Math.max(0,_origPromoBeforeCredits-promoCost).toFixed(2);
  const rcp=function(label,val,color,indent){
    return'<div class="ip-receipt-row'+(indent?' indent':'')+'"><span style="flex:1;color:'+(color&&color.includes('--text')?color:'var(--text-secondary)')+'">'+label+'</span><span class="ip-receipt-val" style="color:'+(color||'var(--text)')+'">'+val+'</span></div>';
  }
  const _isResoldItem=!!i.resaleSalePrice;
  let pb='';
  pb+=_salePlatformPickerRow('rcpt-s1-platform-select',m,id,_plat); // v2.19.33 — picker at top
  pb+=_editMoneyRow(_wasRelistedDetect||_isResoldItem?'Sale price (Sale 1)':'Sale price','rcpt-s1-price-input',m,id,_origSalePrice,'var(--green)','');
  if(_wasRelistedDetect)pb+=rcp('↳ Relisted at',fmt(i.salePrice||0),'var(--muted)',true);
  // v2.19.35 — Sale 1 postage is now editable (writes the snapshot on a resold
  // item). Vinted shows the buyer-covered note instead.
  if(_plat==='vinted')pb+=rcp('Buyer pays postage','(buyer covered)','var(--muted)');
  else pb+=_editMoneyRow('+ Buyer postage','rcpt-s1-postage-input',m,id,_rcptPostage,'var(--green)','+');
  if(_showFee)pb+=rcp(_feeLabel,'−'+fmt(_origBpfBeforeCredits),'var(--red)');
  // F1: Listing fee — inline editable input in receipt for eBay Biz; read-only line for others if set
  if(_plat==='ebay_biz'){
    pb+='<div class="ip-receipt-row"><span style="flex:1;color:var(--text-secondary)">Listing fee</span>'
      +'<span class="ip-receipt-val" style="color:var(--red);display:flex;align-items:center;gap:4px">'
      +'−£<input type="number" class="rcpt-listing-fee-input" data-m="'+m+'" data-id="'+id+'" value="'+( i.listingFee||0 )+'" min="0" step="0.01" '
      +'style="width:60px;padding:2px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--red);font-size:13px;font-weight:600;text-align:right">'
      +'</span></div>';
  } else if((i.listingFee||0)>0){
    pb+=rcp('Listing fee','−'+fmt(i.listingFee),'var(--red)');
  }
  // Relist fees belong to their own Sale-N cycle card, never Sale 1.
  if(_showPostage)pb+=_editMoneyRow('Shipping cost (you pay)','rcpt-s1-shipping-input',m,id,_rcptShipping,'var(--red)','−'); // v2.19.36 — editable per sale
  if(_showPostage&&_rcptPackaging>0)pb+=rcp('Packaging','−'+fmt(_rcptPackaging),'var(--red)');
  if(_rcptPromo)pb+=rcp((_plat==='ebay'?'Promo fee ('+((_rcptPromo*100).toFixed(0))+'% +VAT)':'Boost fee ('+((_rcptPromo*100).toFixed(0))+'%)'),'−'+fmt(_origPromoBeforeCredits),'var(--red)');
  if(_itemAcquisitionCost(i)||!_fixedAccountAmount(i))pb+=rcp('Item cost','−'+fmt(_itemAcquisitionCost(i)),'var(--red)');
  if(partsCost>0){
    const pts=i.parts||[];
    if(pts.length===1){pb+=rcp(esc(pts[0].description),'−'+fmt(partsCost),'var(--red)');}
    else{
      pb+=rcp('Parts & expenses ('+pts.length+')','−'+fmt(partsCost),'var(--red)');
      pts.forEach(function(p){pb+=rcp(esc(p.description),'−'+fmt(p.cost),'var(--red)',true);});
    }
  }
  if(hasReturn){
    pb+='<div class="ip-receipt-row section-head"><span>Return impact</span><span></span></div>';
    (i.returnHistory||[]).forEach(function(r,ri){
      if((Number(r.saleNo)||1)!==1)return; // Sale 2+ adjustments belong to their own cycle cards.
      const fullReturn=(r.type==='full_seller'||r.type==='full_ebay');
      const lbl3={full_seller:'Full refund — you handled',full_ebay:'Full refund — platform involved',partial_seller:'Partial refund — you handled',partial_ebay:'Partial refund — platform decided'}[r.type]||r.type;
      pb+=rcp(lbl3,'−'+fmt(r.refundAmount||0),'var(--accent)');
      if(i.resaleSalePrice&&(r.type==='partial_seller'||r.type==='partial_ebay')){
        const _retagTarget=typeof _currentResaleSaleNo==='function'?_currentResaleSaleNo(i):2;
        pb+='<div class="ip-receipt-row" style="padding-top:0"><span style="flex:1;color:var(--muted);font-size:11px">Against Sale 1</span>'
          +'<button class="rcpt-retag-sale-btn" data-m="'+m+'" data-id="'+id+'" data-ri="'+ri+'" data-target="'+_retagTarget+'" '
          +'style="background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text-secondary);font-size:11px;padding:2px 8px;cursor:pointer">Move to Sale '+_retagTarget+'</button></div>';
      }
      if(fullReturn){
        const _retCredits=_refundCreditsForEntry(i,r);
        if(_retCredits.platformCredit>0&&_showFee)pb+=rcp('Platform fee credit','+'+fmt(_retCredits.platformCredit),'var(--green)',true);
        if(_retCredits.promoCredit>0)pb+=rcp('Advertising fee credit','+'+fmt(_retCredits.promoCredit),'var(--green)',true);
        const _restored=_itemAcquisitionCost(i)+partsCost;
        if(_restored>0)pb+=rcp('Stock cost restored','+'+fmt(_restored),'var(--green)',true);
      }
      pb+='<div class="ip-receipt-row"><span style="flex:1;color:var(--text-secondary)">Return postage</span>'
        +'<span class="ip-receipt-val" style="color:var(--red);display:flex;align-items:center;gap:4px">'
        +'−£<input type="number" class="rcpt-return-postage-input" data-m="'+m+'" data-id="'+id+'" data-ri="'+ri+'" value="'+( r.returnPostage||0 )+'" min="0" step="0.01" '
        +'style="width:60px;padding:2px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--red);font-size:13px;font-weight:600;text-align:right">'
        +'</span></div>';
    });
    // Partial-seller: eBay refunds the fee difference (BPF + promo) on the reduced sale base.
    // Show explicit credit lines so line items reconcile to the net profit total.
    if(_psTotal>0){
      if(_bpfCredit>0&&_showFee)pb+=rcp((_plat==='ebay'?'eBay':'Platform')+' refunds fee difference','+'+fmt(_bpfCredit),'var(--green)',true);
      if(_promoCredit>0)pb+=rcp((_plat==='ebay'?'eBay':'Platform')+' refunds boost difference','+'+fmt(_promoCredit),'var(--green)',true);
    }
  }
  const freshListing=!i.dateSold&&!i.resaleSalePrice&&!hasReturn;
  if(freshListing){sale1Net=calcEstProfit(i)||0;sale1Partner=_estimatedPartnerCutFromProfit(i,calcEstGrossProfit(i));}
  // Presentation only: the receipt's canonical net and partner deduction already
  // reconcile. Show that bridge explicitly without recalculating an agreement.
  const profitSplitRows=function(net,cut,totalLabel,netLabel){
    const partnered=i.accountId&&_itemAccountType(i)!=='supplier';
    const total=+(net+cut).toFixed(2);
    let rows='';
    if(partnered){
      const fixed=i.accountPaidAmount!=null;
      let shareLabel=fixed?'Partner payout · fixed':'Partner share';
      if(!fixed&&total>0&&cut>0){
        const acct=(_accounts||[]).find(function(a){return a.id===i.accountId;});
        const agreed=i.accountSplitPercent!=null?Number(i.accountSplitPercent):(freshListing&&acct&&acct.defaultSplitPercent!=null?Number(acct.defaultSplitPercent):null);
        const matches=agreed!=null&&Math.abs(total*agreed/100-cut)<=.011;
        const pct=matches?agreed:+(cut/total*100).toFixed(1);
        shareLabel+=' <span class="ip-share-percent">'+pct+'%'+(matches?'':' of total')+'</span>';
      }
      rows+='<div class="ip-receipt-row ip-profit-before"><span>'+totalLabel+'</span><span class="ip-receipt-val" style="color:'+(total>=0?'var(--green)':'var(--red)')+'">'+fmt(total)+'</span></div>';
      rows+=rcp(shareLabel,(cut<0?'+':'−')+fmt(Math.abs(cut)),cut<0?'var(--green)':'var(--text-secondary)');
    }
    rows+='<div class="ip-receipt-row total"><span>'+netLabel+'</span><span class="ip-receipt-val" style="color:'+(net>=0?'var(--green)':'var(--red)')+'">'+fmt(net)+'</span></div>';
    return '<div class="ip-profit-split">'+rows+'</div>';
  };
  pb+=profitSplitRows(sale1Net,sale1Partner,freshListing?'Total expected profit':i.resaleSalePrice?'Sale 1 profit before partner':'Total item profit',freshListing?'Your expected profit':i.resaleSalePrice?'Your Sale 1 profit':'Your profit / loss');

  // sec2 must be declared before the Sale 2 block that uses it (TDZ fix).
  // sec2: variant that allows a title accent color override
  const sec2=function(title,body,open,badge,badgeColor,extraClass,accentColor){
    const cls='ip-section'+(extraClass?' '+extraClass:'');
    const bdg=badge!=null?'<span class="ip-section-badge" style="color:'+(badgeColor||'var(--muted)')+'">'+badge+'</span>':'';
    const chevron='<span class="ip-section-chevron" style="transform:'+(open?'rotate(180deg)':'rotate(0deg)')+'">▾</span>';
    const hdr='<button type="button" aria-expanded="'+!!open+'" class="ip-section-header" onclick="var b=this.nextElementSibling,c=this.querySelector(\'.ip-section-chevron\');b.style.display=b.style.display===\'none\'?\'block\':\'none\';c.style.transform=b.style.display===\'none\'?\'rotate(0deg)\':\'rotate(180deg)\';this.setAttribute(\'aria-expanded\',b.style.display!==\'none\')">'
      +'<span class="ip-section-title"'+(accentColor?' style="color:'+accentColor+'"':'')+'>'+title+'</span>'
      +'<span class="ip-section-meta">'+bdg+chevron+'</span>'
      +'</button>';
    return'<div class="'+cls+'">'+hdr+'<div class="ip-section-body" style="display:'+(open?'block':'none')+'">'+body+'</div></div>';
  }

  // Sale 2+ cards — generated from the same canonical Sale-N event source
  // as Summary, Cashflow and reports. Historical cycles are immutable/read-only;
  // the single current live resale slot remains editable regardless of whether it
  // represents Sale 2, Sale 3, Sale 4, ...
  let resaleHTML='';
  const _cycleNos=(typeof _saleCycleNumbers==='function'?_saleCycleNumbers(i):[]).filter(function(n){return n>=2;});
  const _liveCycleNo=i.resaleSalePrice?(typeof _currentResaleSaleNo==='function'?_currentResaleSaleNo(i):2):null;
  _cycleNos.forEach(function(saleNo){
    const snap=_saleCycleSnapshot(i,saleNo);if(!snap||!snap.date)return;
    const ev=_saleEventForCycle(i,m,snap);if(!ev)return;
    const br=_saleBreakdown(ev);
    const isLive=!!(i.resaleSalePrice&&saleNo===_liveCycleNo);
    const platId=snap.platformId||i.resalePlatform||_itemPlatform(i);
    const platDef=PLATFORMS[platId]||{};
    const showFee=platId!=='vinted'&&platId!=='fb';
    const feeLabel=platId==='ebay'?'eBay BPF':platId==='ebay_biz'?'eBay FVF (Biz)':platId==='depop'?'Depop fee':platId==='amazon_uk'?'Amazon fee':'Platform fee';
    let b='';
    if(isLive){
      b+=_salePlatformPickerRow('rcpt-s2-platform-select',m,id,platId);
      b+=_editMoneyRow('Sale price','rcpt-s2-price-input',m,id,Number(snap.price)||0,'var(--green)','');
      if(platId==='vinted')b+=rcp('Buyer pays postage','(buyer covered)','var(--muted)');
      else b+=_editMoneyRow('Postage paid by buyer','rcpt-s2-postage-input',m,id,Number(snap.postage)||0,'var(--green)','+');
    }else{
      b+=rcp('Platform',esc(platDef.short||platDef.label||platId),'var(--muted)');
      b+=rcp('Sale price',fmt(br.salePrice),'var(--green)');
      if(br.postage>0)b+=rcp('+ Buyer postage','+'+fmt(br.postage),'var(--green)');
    }
    if(showFee&&br.bpf>0)b+=rcp(feeLabel,'−'+fmt(br.bpf),'var(--red)');
    if(br.listingFee>0)b+=rcp('Listing / relist fee','−'+fmt(br.listingFee),'var(--red)');
    if(isLive)b+=_editMoneyRow('Shipping cost (you pay)','rcpt-s2-shipping-input',m,id,Number(snap.shipping)||0,'var(--red)','−');
    else if(br.shipping>0)b+=rcp('Shipping cost','−'+fmt(br.shipping),'var(--red)');
    if(br.packaging>0)b+=rcp('Packaging','−'+fmt(br.packaging),'var(--red)');
    if(isLive){
      const pp=(Number(snap.promoPercent)||0)*100;
      b+='<div class="ip-receipt-row"><span style="flex:1;color:var(--text-secondary)">'+(platId==='ebay'?'Promo % (+VAT)':'Boost %')+'</span>'
        +'<span class="ip-receipt-val" style="display:flex;align-items:center;gap:4px"><input type="number" class="rcpt-s2-promo-input" data-m="'+m+'" data-id="'+id+'" value="'+(+pp.toFixed(2))+'" min="0" step="0.1" style="width:52px;padding:2px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:13px;font-weight:600;text-align:right"><span style="color:var(--muted)">%</span>'+(br.promoFee>0?'<span style="margin-left:6px;color:var(--red)">−'+fmt(br.promoFee)+'</span>':'')+'</span></div>';
    }else if(br.promoFee>0)b+=rcp('Promo / boost fee','−'+fmt(br.promoFee),'var(--red)');
    if(br.itemCost>0)b+=rcp('Item cost','−'+fmt(br.itemCost),'var(--red)');
    if(br.parts>0)b+=rcp('Parts & expenses','−'+fmt(br.parts),'var(--red)');
    if(br.partialRefund>0)b+=rcp('Partial refunds','−'+fmt(br.partialRefund),'var(--accent)');
    b+=profitSplitRows(br.netProfit,br.partnerSplit,'Sale '+saleNo+' profit before partner','Your Sale '+saleNo+' profit');
    const cycleReturns=(i.returnHistory||[]).filter(function(r){return (Number(r.saleNo)||1)===saleNo;});
    let cycleNet=br.netProfit;
    if(cycleReturns.length){
      b+='<div class="ip-receipt-row section-head"><span>Return impact</span><span></span></div>';
      cycleReturns.forEach(function(r){
        const rb=_saleBreakdown({item:i,sale:'R',saleNo:saleNo,isReturnAdjustment:true,isReturned:true,returnEntry:r,snapshot:snap});
        const impact=_returnEventImpact(i,r);
        cycleNet+=rb.netProfit;
        const lbl={full_seller:'Full refund — seller handled',full_ebay:'Full refund — platform involved',partial_seller:'Partial refund — seller handled',partial_ebay:'Partial refund — platform decided'}[r.type]||'Return adjustment';
        // v1.4.10 — show the actual refund economics instead of hiding fee
        // credits inside one net number. This makes Sale 2+ boost/ad credits
        // explicit and confirms whether eBay credited the advertising charge.
        b+=rcp(lbl,'−'+fmt(impact.refund),'var(--red)');
        if(impact.platformCredit>0)b+=rcp('Platform fee credit','+'+fmt(impact.platformCredit),'var(--green)',true);
        if(impact.promoCredit>0)b+=rcp((platId==='ebay_biz'?'Boost / ad fee credit':'Promo fee credit'),'+'+fmt(impact.promoCredit),'var(--green)',true);
        if(impact.postage>0)b+=rcp('Return postage','−'+fmt(impact.postage),'var(--red)',true);
        b+=rcp('Net return impact',(rb.netProfit>=0?'+':'')+fmt(rb.netProfit),rb.netProfit>=0?'var(--green)':'var(--red)',true);
      });
      cycleNet=+cycleNet.toFixed(2);
      b+='<div class="ip-receipt-row total"><span style="flex:1">Sale '+saleNo+' cycle P&amp;L</span><span class="ip-receipt-val" style="color:'+(cycleNet>=0?'var(--green)':'var(--red)')+'">'+fmt(cycleNet)+'</span></div>';
    }
    if(isLive){
      b+='<div class="ip-receipt-row" style="margin-top:6px;padding:10px 0 2px;border-top:2px solid var(--border)"><span style="flex:1;font-weight:700;font-size:13px">Lifetime P&amp;L</span><span class="ip-receipt-val" style="font-size:16px;color:'+(profit>=0?'var(--green)':'var(--red)')+'">'+fmt(profit)+'</span></div>';
      if(roiDisplay)b+=rcp('Overall ROI',roiDisplay,'var(--muted)');
      if(marginDisplay)b+=rcp('Overall margin',marginDisplay,'var(--muted)');
    }
    const ttl='Sale '+saleNo+' P&amp;L <span style="color:var(--muted);font-weight:400;font-size:11px">sold '+esc(snap.date||'—')+'</span>';
    resaleHTML+=sec2(ttl,b,isLive,fmt(cycleReturns.length?cycleNet:br.netProfit),(cycleReturns.length?cycleNet:br.netProfit)>=0?'var(--green)':'var(--red)','ip-section-pnl','var(--purple)');
  });
  let relistHTML='';
  const hasReturnHistory=(i.returnHistory||[]).length>0;
  const notYetSold=!i.dateSold&&!i.resaleSalePrice;
  if(hasReturnHistory&&notYetSold){
    const rlBPF=calcPlatformBPF(i,i.salePrice||0,i.postage||0);
    const rlSalePrice=i.salePrice||0;
    const rlShipping=i.shippingCost||0;
    const rlPackaging=i.packagingCost||0;
    const rlPostage=i.postage||0;
    const rlDefaultPromo=+((i.promoPercent||0)*100).toFixed(1);
    const projTitle=i.isReturned?'Re-list Projection — at current price':'Relist Projection — if sold at '+fmt(rlSalePrice);
    const rlGrossInc=rlSalePrice-rlBPF;
    const rlPromo=_calcPromoFee(_itemPlatform(i),rlSalePrice,rlPostage,i.promoPercent||0);
    const rlRev=rlSalePrice+rlPostage-rlBPF;
    const rlItemCost=Math.max(0,_itemAcquisitionCost(i));
    const rlPartsCost=Math.max(0,Number(calcPartsCost(i))||0);
    const rlStockBasis=rlItemCost+rlPartsCost;
    const rlCost=rlShipping+rlPackaging+rlPromo+rlStockBasis;
    // v1.4.10 — use the same canonical expected-profit function as the
    // Inventory row/header so this projection can never disagree with Stock.
    const combinedP=calcEstGrossProfit(i);
    const rlProfit=combinedP==null?+(rlRev-rlCost).toFixed(2):+(combinedP-profit).toFixed(2);
    relistHTML=`<div class="ip-relist-section">
      <div class="ip-section-header" onclick="var b=this.nextElementSibling,c=this.querySelector('.ip-section-chevron');b.style.display=b.style.display==='none'?'block':'none';c.style.transform=b.style.display==='none'?'rotate(0deg)':'rotate(180deg)'">
        <span class="ip-section-title" style="color:var(--accent)">${projTitle}</span>
        <span class="ip-section-meta"><span class="ip-section-badge" style="color:${combinedP>=0?'var(--green)':'var(--red)'}">Your profit: ${fmt(calcEstProfit(i))}</span><span class="ip-section-chevron" style="transform:rotate(180deg)">▾</span></span>
      </div>
      <div class="ip-section-body">
        <div class="ip-receipt-row"><span style="flex:1;color:var(--muted)">P&amp;L before partner, so far</span><span class="ip-receipt-val" style="color:${profit>=0?'var(--green)':'var(--red)'}">${fmt(profit)}</span></div>
        <div class="ip-receipt-row"><span style="flex:1">Expected sale</span><span class="ip-receipt-val" style="color:var(--green)">${fmt(rlSalePrice)}</span></div>
        ${rlPostage>0?`<div class="ip-receipt-row"><span style="flex:1">+ Buyer postage</span><span class="ip-receipt-val" style="color:var(--green)">+${fmt(rlPostage)}</span></div>`:''}
        <div class="ip-receipt-row"><span style="flex:1">eBay BPF</span><span class="ip-receipt-val" style="color:var(--red)">−${fmt(rlBPF)}</span></div>
        <div class="ip-receipt-row"><span style="flex:1">Shipping (you pay)</span><span class="ip-receipt-val" style="color:var(--red);display:flex;align-items:center;gap:4px">−£<input type="number" class="rcpt-relist-shipping-input" data-m="${m}" data-id="${id}" value="${+(rlShipping||0)}" min="0" step="0.01" style="width:60px;padding:2px 4px;background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--red);font-size:13px;font-weight:600;text-align:right"></span></div>
        <div class="ip-receipt-row" style="align-items:center">
          <span style="display:flex;align-items:center;gap:8px;color:var(--text-secondary)">Promo %
            <input id="rl-promo-input" type="number" min="0" max="100" step="0.1" value="${rlDefaultPromo}" style="width:56px;padding:3px 7px;border-radius:5px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:12px;font-weight:600;text-align:center;font-family:inherit" oninput="_recalcRelist(${profit},${rlSalePrice},${rlBPF},${rlShipping},${rlPackaging},${rlPostage},'${_itemPlatform(i)}',${rlStockBasis},'${m}','${id}')">
            <span style="font-size:11px;color:var(--muted)">+VAT</span>
          </span>
          <span id="rl-promo-cost" class="ip-receipt-val" style="color:var(--red)">−${fmt(rlPromo)}</span>
        </div>
        <div class="ip-receipt-row"><span style="flex:1">Item cost</span><span class="ip-receipt-val" style="color:var(--red)">−${fmt(rlItemCost)}</span></div>
        ${rlPartsCost>0?`<div class="ip-receipt-row"><span style="flex:1">Parts & expenses</span><span class="ip-receipt-val" style="color:var(--red)">−${fmt(rlPartsCost)}</span></div>`:''}
        <div class="ip-receipt-row total"><span style="flex:1">Next sale before partner</span><span id="rl-profit" class="ip-receipt-val" style="color:${rlProfit>=0?'var(--green)':'var(--red)'}">${fmt(rlProfit)}</span></div>
        <div class="ip-receipt-row"><span>Partner payout · lifetime</span><span id="rl-partner">−${fmt(_estimatedPartnerCutFromProfit(i,combinedP))}</span></div>
        <div class="ip-receipt-row" style="margin-top:6px;padding:10px;background:var(--surface2);border-radius:8px;border-bottom:none">
          <span style="flex:1;font-weight:600">Your lifetime profit if sold</span>
          <span id="rl-lifetime" class="ip-receipt-val" style="font-size:15px;color:${calcEstProfit(i)>=0?'var(--green)':'var(--red)'}">${fmt(calcEstProfit(i))}</span>
        </div>
      </div>
    </div>`;
  }

  const catOpts=ITEM_CATEGORIES.map(c=>'<option value="'+c+'"'+(c===i.category?' selected':'')+'>'+c+'</option>').join('');
  const srcOpts=ITEM_SOURCES.map(s=>'<option value="'+s+'"'+(s===i.source?' selected':'')+'>'+s+'</option>').join('');

  const sec=function(title,body,open,badge,badgeColor,extraClass){
    const cls='ip-section'+(extraClass?' '+extraClass:'');
    const bdg=badge!=null?'<span class="ip-section-badge" style="color:'+(badgeColor||'var(--muted)')+'">'+badge+'</span>':'';
    const chevron='<span class="ip-section-chevron" style="transform:'+(open?'rotate(180deg)':'rotate(0deg)')+'">▾</span>';
    const hdr='<button type="button" aria-expanded="'+!!open+'" class="ip-section-header" onclick="var b=this.nextElementSibling,c=this.querySelector(\'.ip-section-chevron\');b.style.display=b.style.display===\'none\'?\'block\':\'none\';c.style.transform=b.style.display===\'none\'?\'rotate(0deg)\':\'rotate(180deg)\';this.setAttribute(\'aria-expanded\',b.style.display!==\'none\')">'
      +'<span class="ip-section-title">'+title+'</span>'
      +'<span class="ip-section-meta">'+bdg+chevron+'</span>'
      +'</button>';
    return'<div class="'+cls+'">'+hdr+'<div class="ip-section-body" style="display:'+(open?'block':'none')+'">'+body+'</div></div>';
  }

  // Options show tier-correct prices based on the item's current sale price.
  // Policy dropdown — full-width, sits between the mode toggle and the inputs
  const _ipPolSel='<select id="ip-policy-sel-'+id+'" onchange="applyIPPolicy(\''+m+'\',\''+id+'\')" style="width:100%;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text-secondary);font-size:12px;font-family:inherit;margin-bottom:8px;display:block"></select>';
  const _customPostageInner=_ipPolSel+'<div class="ip-postage-custom">'
     +'<div class="ip-postage-custom-field"><label>You pay'+(i.resaleSalePrice?' (Sale '+(typeof _currentResaleSaleNo==='function'?_currentResaleSaleNo(i):2)+')':'')+'</label><input id="ip-ship-'+id+'" type="number" step="0.01" value="'+(i.shippingCost||0)+'" onchange="ipSaveNum(\''+m+'\',\''+id+'\',\'shippingCost\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"></div>'
     +'<div class="ip-postage-custom-field"><label>Buyer pays'+(i.resaleSalePrice?' (Sale '+(typeof _currentResaleSaleNo==='function'?_currentResaleSaleNo(i):2)+')':'')+'</label><input id="ip-post-'+id+'" type="number" step="0.01" value="'+(i.postage||0)+'" onchange="ipSaveNum(\''+m+'\',\''+id+'\',\'postage\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"></div>'
     +'</div>';
  const postageRowInner=!_showPostage
    ?''
    :!_showSimpleDelivery
      ?_customPostageInner
      :(postageMode==='simple'
        ?'<select class="ip-postage-select" onchange="saveSDRate(\''+m+'\',\''+id+'\',this.value)">'+sdOpts+'</select>'
         +'<div class="ip-postage-buyer"><label><input type="checkbox" '+(i._sdBuyerPays===true?'':'checked')+' onchange="saveSDFree(\''+m+'\',\''+id+'\',!this.checked)"> Free postage</label></div>'
        :_ipPolSel+'<div class="ip-postage-custom">'
         +'<div class="ip-postage-custom-field"><label>You pay</label><input id="ip-ship2-'+id+'" type="number" step="0.01" value="'+(i.shippingCost||0)+'" onchange="ipSaveNum(\''+m+'\',\''+id+'\',\'shippingCost\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"></div>'
         +'<div class="ip-postage-custom-field"><label>Buyer pays</label><input id="ip-post2-'+id+'" type="number" step="0.01" value="'+(i.postage||0)+'" onchange="ipSaveNum(\''+m+'\',\''+id+'\',\'postage\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"></div>'
         +'</div>');
  const saleEditable=!i.dateSold&&!i.resaleSalePrice&&!i.isReturned;
  const profitClass=profit===null?'':profit>=0?'pos':'neg';
  const promoDisplay=((i.promoPercent||0)*100);
  const promoStr=promoDisplay%1===0?promoDisplay.toFixed(0):promoDisplay.toFixed(1);
  let html='<div class="item-full-page">';

  // Top bar — title is directly editable
  html+='<div class="ip-topbar">';
  html+='<div class="ip-topbar-row1">';
  html+='<button class="btn btn-secondary ip-back" onclick="exitItemPage()">'+icon('back',14)+'<span class="ip-back-label"> Back</span></button>';

  if(_lifecycleCan(i,'markSold')&&!_activeJobLotMembership(id))html+='<button class="btn btn-primary ip-act-btn" onclick="markSold(\''+m+'\',\''+id+'\')">'+icon('sold',15)+'<span class="ip-act-label-always">Mark Sold</span></button>';
  if(_lifecycleCan(i,'relist')&&!_activeJobLotMembership(id))html+='<button class="btn btn-primary ip-act-btn" onclick="openRelist(\''+m+'\',\''+id+'\')">'+icon('relist',15)+'<span class="ip-act-label-always">Relist</span></button>';
  if(_lifecycleCan(i,'moveUnlisted')&&!_activeJobLotMembership(id))html+='<button class="btn btn-secondary ip-act-btn" onclick="moveReturnedToUnlisted(\''+m+'\',\''+id+'\')" title="Keep the return history but move this unit to Unlisted">'+icon('inbox',15)+'<span class="ip-act-label">Unlisted</span></button>';
  if(_lifecycleCan(i,'return'))html+='<button class="btn btn-secondary ip-act-btn" onclick="openReturn(\''+m+'\',\''+id+'\')">'+icon('return',15)+'<span class="ip-act-label-always">Return</span></button>';
  html+='<details class="ip-more-actions"><summary>More actions</summary><div class="ip-more-action-list">';
  if(_stepBackTitle(i))html+='<button class="btn btn-secondary ip-act-btn" onclick="stepBack(\''+m+'\',\''+id+'\')" title="'+_stepBackTitle(i)+' \u2014 step back one state" style="color:var(--accent)">'+icon('revert',15)+'<span class="ip-act-label">Undo</span></button>';
  html+='<button class="btn btn-secondary ip-act-btn" onclick="confirmDupeItem(\''+m+'\',\''+id+'\')">'+icon('dupe',15)+'<span class="ip-act-label">Dupe</span></button>';
  if(!i.dateSold&&!i.resaleSalePrice&&!i.isReturned&&!i.scrappedAt&&!_activeJobLotMembership(id)&&(i.state==='sourced'||i.state==='listed'))html+='<button class="btn btn-secondary ip-act-btn" onclick="openSplitModal(\''+m+'\',\''+id+'\')" title="Split a multi-buy lot into separate units"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v6"/><path d="M6 3v6a3 3 0 0 1-3 3"/><polyline points="15 9 18 12 15 15"/></svg><span class="ip-act-label">Split</span></button>';

  if(_canAddToJobLot(i))html+='<button class="btn btn-secondary ip-act-btn" onclick="openAddToJobLot(\''+m+'\',\''+id+'\')" title="Group this physical item into a Job Lot" style="color:var(--purple)">'+icon('joblot',15)+'<span class="ip-act-label">Job Lot</span></button>';
  {const _jl=_activeJobLotForItem(id);if(_jl)html+='<button class="btn btn-secondary ip-act-btn" onclick="openJobLotPage(\''+_jl.id+'\')" title="Managed through '+esc(_jl.name)+'" style="color:var(--purple)">'+icon('joblot',15)+'<span class="ip-act-label">'+esc(_jl.name)+'</span></button>';}
  if(_canScrap(i))html+='<button class="btn btn-secondary ip-act-btn" onclick="openScrapModal(\''+m+'\',\''+id+'\')" title="Dispose of item — scrap or donate" style="color:var(--warn)">'+icon('dispose',15)+'<span class="ip-act-label">Dispose</span></button>';
  if(!i.bundleId&&!i.scrappedAt&&!i.resaleSalePrice&&!_activeJobLotMembership(id)&&(i.isReturned||!i.dateSold))html+='<button class="btn btn-secondary ip-act-btn" onclick="openLinkToSaleModal(\''+m+'\',\''+id+'\')" title="Reconcile this item with an existing historical sale" style="color:var(--accent)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg><span class="ip-act-label">Reconcile sale</span></button>';
  html+='<button class="btn btn-secondary ip-act-btn ip-act-danger" onclick="deleteItem(\''+m+'\',\''+id+'\')">'+icon('trash',15)+'</button>';
  html+='</div></details>';
  html+='</div>'; // close ip-topbar-row1
  html+='<div class="ip-topbar-row2">';
  html+='<div class="ip-title-wrap">';
  html+='<div class="ip-title" onclick="startTitleEdit(\''+m+'\',\''+id+'\')" title="Click to rename">'+esc(i.item)+'</div>';
  html+='<div class="ip-meta-chips">';
  if(i.gid)html+='<span class="ip-chip mono">'+esc(i.gid)+'</span>';
  html+='<span class="ip-chip">'+m+'</span>';
  html+='<div class="item-badge '+status+'">'+status+'</div>';
  {const _jlMeta=_activeJobLotForItem(id);if(_jlMeta)html+='<span class="ip-chip" style="color:var(--purple);border-color:rgba(167,139,250,.35);cursor:pointer" onclick="openJobLotPage(\''+_jlMeta.id+'\')">'+icon('joblot',11)+' '+esc(_jlMeta.name)+'</span>';}
  {
    // Tappable platform selector — change & instantly see P&L impact. Available
    // on sold/returned items too (a sale can be recorded on the wrong platform;
    // editing here writes soldOnPlatform and re-stores profit — no undo dance).
    const _curPlat=_itemPlatform(i);
    const _livePlats=Object.values(PLATFORMS).filter(p=>p.live);
    // Match .plat-badge colours per platform (same as the CSS definitions)
    const _platBtnStyle=(function(p){
      if(p==='vinted')return 'background:rgba(0,119,130,0.12);border-color:rgba(0,119,130,0.35);color:#007782;';
      if(p==='depop')return 'background:rgba(255,70,70,0.1);border-color:rgba(255,70,70,0.25);color:#e03030;';
      if(p==='fb')return 'background:rgba(24,119,242,0.1);border-color:rgba(24,119,242,0.25);color:#1877f2;';
      if(p==='amazon_uk')return 'background:rgba(255,153,0,0.12);border-color:rgba(255,153,0,0.3);color:#c45a00;';
      // ebay, ebay_biz — yellow
      return 'background:rgba(245,175,2,0.12);border-color:rgba(245,175,2,0.35);color:#c48a00;';
    })(_curPlat);
    html+='<div style="position:relative;display:inline-block">';
    html+='<button id="ip-plat-btn-'+id+'" onclick="toggleItemPlatformPicker(\''+m+'\',\''+id+'\')" style="display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 7px 2px 6px;border-radius:5px;font-weight:600;letter-spacing:0.3px;border:1px solid;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;'+_platBtnStyle+'">'
      +(PLATFORMS[_curPlat]?PLATFORMS[_curPlat].short:_curPlat)
      +' <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
      +'</button>';
    html+='<div id="ip-plat-picker-'+id+'" style="display:none;position:absolute;top:calc(100% + 6px);left:0;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 4px 20px var(--shadow-md);z-index:300;min-width:160px;padding:6px">';
    _livePlats.forEach(p=>{
      const isActive=p.id===_curPlat;
      html+='<button onclick="setItemPlatform(\''+m+'\',\''+id+'\',\''+p.id+'\')" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:'+(isActive?'var(--accent-dim)':'transparent')+';border:none;border-radius:7px;cursor:pointer;font-family:inherit;color:'+(isActive?'var(--accent)':'var(--text)')+';font-size:12px;font-weight:'+(isActive?'700':'500')+';text-align:left">'
        +'<span class="plat-badge '+(p.id==='ebay_biz'?'ebay':p.id)+'" style="font-size:10px">'+p.short+'</span>'
        +p.label
        +(isActive?' ✓':'')
        +'</button>';
    });
    html+='</div></div>';
  }
  html+='</div></div></div>';
  html+='</div>'; // ip-topbar

  // All content below topbar in one flex column with uniform 12px gap
  html+='<div class="ip-content">';

  // 4 tokens: Sale Price, Buy Price, Promo %, Net Profit+ROI
  html+='<div class="ip-tokens">';

  // Sale price
  html+='<div class="ip-token'+(saleEditable?'':' locked')+'" id="tok-salePrice-'+id+'"'+(saleEditable?' onpointerdown="tokenPointerDown(\''+m+'\',\''+id+'\',\'salePrice\')" onclick="openTokenEdit(\''+m+'\',\''+id+'\',\'salePrice\')"':'')+' >';
  html+='<div class="ip-token-label">Sale Price</div>';
  html+='<div class="ip-token-val">'+fmt(i.salePrice||0)+'</div>';
  html+='<div class="ip-token-sub">'+(saleEditable?'✎ Tap to edit':status==='sold'||status==='resold'?icon('lock',11)+' Sold · locked':icon('lock',11)+' Locked')+'</div>';
  html+='</div>';

  html+='<button type="button" class="ip-token ip-cost-token" onclick="document.getElementById(\'ip-costs\').scrollIntoView({block:\'center\'});document.querySelector(\'#ip-costs .ip-control:not([hidden]) input\')?.focus({preventScroll:true})">';
  const displayedPartnerCost=!i.scrappedAt&&(!!i.isReturned||(!i.dateSold&&!i.resaleSalePrice))?_estimatedPartnerCutFromProfit(i,calcEstGrossProfit(i)):(_accountItemOwed(i)||0);
  html+='<div class="ip-token-label">Item cost'+(displayedPartnerCost&&i.accountPaidAmount==null?' + partner share':'')+'</div><div class="ip-token-val">'+fmt(_itemAcquisitionCost(i)+partsCost+displayedPartnerCost)+'</div>';
  html+='<div class="ip-token-sub">'+(displayedPartnerCost?'Includes payout '+fmt(displayedPartnerCost)+' · ':'Purchase + parts · ')+'edit costs</div></button>';

  // Promo %
  html+='<div class="ip-token" id="tok-promoPercent-'+id+'" onpointerdown="tokenPointerDown(\''+m+'\',\''+id+'\',\'promoPercent\')" onclick="openTokenEdit(\''+m+'\',\''+id+'\',\'promoPercent\')">';
  html+='<div class="ip-token-label">'+_promoLabel+'</div>';
  html+='<div class="ip-token-val">'+promoStr+'%</div>';
  html+='<div class="ip-token-sub">Tap to edit · Fee: '+fmt(promoCost)+'</div>';
  html+='</div>';

  // Listing fee moved to inline P&L receipt input (F1) — no longer a KPI token


  // v1.4.10 — For anything still physically available to sell, the headline
  // operational number is Expected Profit. Returned/relisted stock therefore
  // shows the lifetime result IF the next sale completes, while realised P&L
  // remains visible in the detailed receipt/projection below. Final sold/disposed
  // stock continues to show the realised accounting result.
  const _onHandForExpected=!i.scrappedAt&&(!!i.isReturned||(!i.dateSold&&!i.resaleSalePrice));
  const _expectedHeadline=_onHandForExpected?calcEstProfit(i):null;
  const _headlineVal=_onHandForExpected?_expectedHeadline:calcNetProfit(i);
  const _headlineClass=_headlineVal===null?'':_headlineVal>=0?'pos':'neg';
  const _expectedAsk=(Number(i.salePrice)>0)?Number(i.salePrice):Number(i.estSalePrice)||0;
  html+='<div class="ip-token locked ip-profit-token '+_headlineClass+'">';
  html+='<div class="ip-token-label">'+(_onHandForExpected?'Expected Profit':(hasReturn||i.resaleSalePrice?'Lifetime P&amp;L':'Net Profit'))+'</div>';
  html+='<div class="ip-token-val">'+(_headlineVal!==null?fmt(_headlineVal):'—')+'</div>';
  html+='<div class="ip-token-sub">'+(_onHandForExpected?(_expectedAsk>0?(i.accountId&&_itemAccountType(i)!=='supplier'?'after partner · sold at ':'if sold at ')+fmt(_expectedAsk):'add an expected sale price'):(hasReturn?'realised so far':(i.accountId&&_itemAccountType(i)!=='supplier'?'after partner share':marginDisplay?marginDisplay+' margin · after fees':'after fees')))+'</div>';
  html+='</div>';

  html+='</div>'; // ip-tokens

  if(_showPostage){
    html+='<div class="ip-postage-row">';
    html+='<span class="ip-postage-label">Postage</span>';
    if(_showSimpleDelivery){
      html+='<div class="ip-postage-mode">';
      html+='<button class="ip-postage-mode-btn'+(postageMode==='simple'?' active':'')+'" onclick="savePostageMode(\''+m+'\',\''+id+'\',\'simple\')">Simple Delivery</button>';
      html+='<button class="ip-postage-mode-btn'+(postageMode==='custom'?' active':'')+'" onclick="savePostageMode(\''+m+'\',\''+id+'\',\'custom\')">Custom</button>';
      html+='</div>';
      html+='<div class="ip-postage-divider"></div>';
    }
    html+=postageRowInner;
    html+='</div>';
  }

  // Close left column, open right column for sections
  let db='<div class="ip-details-grid">';
  db+='<div class="ip-row"><div class="ip-label">Date Listed</div>'
    +'<input class="ip-field" type="date" value="'+(i.dateListed||'')+'" onchange="ipSave(\''+m+'\',\''+i.id+'\',\'dateListed\',this.value)"></div>';
  // v1.4.2 — Details must not read only `dateSold` (Sale 1). A full return
  // deliberately clears that live field, so a Sale 2/3/4 item used to say
  // "Not yet sold" while its Sale-N card correctly showed a completed sale.
  let _detailLastSaleDate=null,_detailLastSaleNo=null;
  try{
    const _detailNos=(typeof _saleCycleNumbers==='function')?_saleCycleNumbers(i):[];
    _detailNos.slice().sort(function(a,b){return b-a;}).some(function(n){
      const s=(typeof _saleCycleSnapshot==='function')?_saleCycleSnapshot(i,n):null;
      if(s&&s.date){_detailLastSaleDate=s.date;_detailLastSaleNo=n;return true;}
      return false;
    });
  }catch(e){}
  if(!_detailLastSaleDate){
    const _detailReturn=(i.returnHistory||[]).slice().sort(function(a,b){
      return String(_returnSaleSnapshotDate(b)||b.loggedAt||'').localeCompare(String(_returnSaleSnapshotDate(a)||a.loggedAt||''));
    })[0];
    if(_detailReturn){
      _detailLastSaleDate=_returnSaleSnapshotDate(_detailReturn);
      _detailLastSaleNo=Math.max(1,Number(_detailReturn.saleNo)||1);
    }
  }
  if(!_detailLastSaleDate){
    _detailLastSaleDate=i.resaleDateSold||i.dateSold||null;
    _detailLastSaleNo=i.resaleDateSold?(typeof _currentResaleSaleNo==='function'?_currentResaleSaleNo(i):2):(i.dateSold?1:null);
  }
  db+=_detailLastSaleDate
    ?'<div class="ip-row"><div class="ip-label">'+(_detailLastSaleNo&&_detailLastSaleNo>1?'Latest Sale':'Date Sold')+'</div><div class="ip-field-date">'+(_detailLastSaleNo&&_detailLastSaleNo>1?'Sale '+_detailLastSaleNo+' · ':'')+fmtDate(_detailLastSaleDate)+'</div></div>'
    :'<div class="ip-row"><div class="ip-label">Date Sold</div><div class="ip-field-date" style="color:var(--muted);font-style:italic">Not yet sold</div></div>';
  db+='<div class="ip-row"><div class="ip-label">Location</div>'
    +'<input class="ip-field" value="'+esc(i.location||'')+'" placeholder="e.g. A101" onchange="ipSave(\''+m+'\',\''+i.id+'\',\'location\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"></div>';
  db+='<div class="ip-row"><div class="ip-label">Source</div>'
    +'<select class="ip-field ip-field-select" onchange="ipSave(\''+m+'\',\''+i.id+'\',\'source\',this.value)"><option value="">—</option>'+srcOpts+'</select></div>';
  db+='<div class="ip-row"><div class="ip-label">Category</div>'
    +'<select class="ip-field ip-field-select" onchange="ipSave(\''+m+'\',\''+i.id+'\',\'category\',this.value)"><option value="">—</option>'+catOpts+'</select></div>';
  db+='<div class="ip-row" style="grid-column:1/-1"><div class="ip-label">Notes</div>'
    +'<input class="ip-field" value="'+esc(i.notes||'')+'" placeholder="Any notes..." onchange="ipSave(\''+m+'\',\''+i.id+'\',\'notes\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()"></div>';
  db+='</div>';
  // Body sections
  html+='<div class="ip-body">';
  html+=_ipCostEditorHTML(m,i);
  // P&L Receipt
  const pnlOpen=!i.resaleSalePrice;
  const pnlTitle=i.resaleSalePrice?'Sale 1 breakdown':freshListing?'Expected profit breakdown':'Profit breakdown';
  // v2.19.35 — when there are two sales, the header shows the LAST sale; the
  // per-sale cards below hold each sale's editable figures.
  html+=sec(pnlTitle,pb,pnlOpen,fmt(sale1Net),sale1Net>=0?'var(--green)':'var(--red)','ip-section-pnl');

  // E4 P2 — Sale 1 details editor. Only relevant when the item has been
  // relisted (i.e. its sale 1 economics may differ from current i.* values
  // because confirmRelist overwrote them). Surfaces 4 editable fields that
  // write through applyRelistSnapshot so calcGrossProfit reads the user-
  // confirmed sale 1 values on the resold-after-return path. Closed by
  // default — shows a status badge so user can see at a glance whether the
  // snapshot is captured or falling back to live values.
  const _s1FullReturn=(i.returnHistory||[]).slice().reverse().find(function(r){return (r.type==='full_seller'||r.type==='full_ebay')&&r._relistedAt;});
  if(_s1FullReturn){
    const _s1HasSnap=_s1FullReturn._salePriceAtRelist!==undefined&&_s1FullReturn._shippingCostAtRelist!==undefined;
    const _s1Price=(_s1FullReturn._salePriceAtRelist!==undefined)?_s1FullReturn._salePriceAtRelist:(_s1FullReturn._salePriceAtReturn||_s1FullReturn.refundAmount||i.salePrice||0);
    const _s1Ship=(_s1FullReturn._shippingCostAtRelist!==undefined)?_s1FullReturn._shippingCostAtRelist:(i.shippingCost||0);
    const _s1Post=(_s1FullReturn._postageAtRelist!==undefined)?_s1FullReturn._postageAtRelist:(i.postage||0);
    const _s1Pkg=(_s1FullReturn._packagingCostAtRelist!==undefined)?_s1FullReturn._packagingCostAtRelist:(i.packagingCost||0);
    const _s1PromoDec=(_s1FullReturn._promoPercentAtRelist!==undefined)?_s1FullReturn._promoPercentAtRelist:(i.promoPercent||0);
    const _s1PromoPct=(_s1PromoDec*100).toFixed(_s1PromoDec*100===Math.round(_s1PromoDec*100)?0:1);
    const _s1FieldStyle='width:100%;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;font-family:inherit;box-sizing:border-box';
    const _s1Body=
      '<div style="font-size:12px;color:var(--text-secondary);margin:4px 0 12px">'+
        (_s1HasSnap?
          '<span style="color:var(--green)">\u2713 Sale 1 values captured.</span> Edit if you spot a mistake.':
          '<span style="color:var(--warn)">\u26a0 No sale 1 snapshot.</span> These fields show <em>current</em> values \u2014 likely current resale values. Enter the real sale 1 values to fix lifetime P&L.'
        )+
      '</div>'+
      '<div class="ip-details-grid">'+
        '<div class="ip-row"><div class="ip-label">Sale 1 price (\u00a3)</div>'+
          '<input class="ip-field" type="number" step="0.01" min="0" value="'+(+_s1Price).toFixed(2)+'" onchange="ipSaveSale1(\''+m+'\',\''+i.id+'\',\'salePrice\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()" style="'+_s1FieldStyle+'"></div>'+
        '<div class="ip-row"><div class="ip-label">Sale 1 shipping (\u00a3)</div>'+
          '<input class="ip-field" type="number" step="0.01" min="0" value="'+(+_s1Ship).toFixed(2)+'" onchange="ipSaveSale1(\''+m+'\',\''+i.id+'\',\'shipping\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()" style="'+_s1FieldStyle+'"></div>'+
        '<div class="ip-row"><div class="ip-label">Sale 1 postage charged (\u00a3)</div>'+
          '<input class="ip-field" type="number" step="0.01" min="0" value="'+(+_s1Post).toFixed(2)+'" onchange="ipSaveSale1(\''+m+'\',\''+i.id+'\',\'postage\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()" style="'+_s1FieldStyle+'"></div>'+
        '<div class="ip-row"><div class="ip-label">Sale 1 packaging (\u00a3)</div>'+
          '<input class="ip-field" type="number" step="0.01" min="0" value="'+(+_s1Pkg).toFixed(2)+'" onchange="ipSaveSale1(\''+m+'\',\''+i.id+'\',\'packaging\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()" style="'+_s1FieldStyle+'"></div>'+
        '<div class="ip-row"><div class="ip-label">Sale 1 promo (%)</div>'+
          '<input class="ip-field" type="number" step="0.1" min="0" max="20" value="'+_s1PromoPct+'" onchange="ipSaveSale1(\''+m+'\',\''+i.id+'\',\'promoPercent\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()" style="'+_s1FieldStyle+'"></div>'+
      '</div>';
    const _s1Badge=_s1HasSnap?'Captured':'Live fallback';
    const _s1BadgeColor=_s1HasSnap?'var(--green)':'var(--warn)';
    html+=sec('Sale 1 details',_s1Body,false,_s1Badge,_s1BadgeColor);
  }

  // Sale 2
  if(resaleHTML)html+=resaleHTML;

  // Relist projection
  if(relistHTML)html+=relistHTML;

  // Details — no item name field (title is editable inline at top)
  html+=sec('Item details',db,false,null,null,'ip-section-details');

  // Parts & Expenses
  const hasParts=(i.parts||[]).length>0;
  html+=sec('Parts &amp; Expenses'+(hasParts?' ('+i.parts.length+')':''),partsHTML(m,id,'page'),hasParts,null,null,'ip-section-parts');

  // Timeline — always open
  // Listing maintenance — only for active (unsold, not returned) listings.
  // Shows cycle age (this listing) + lifetime age (total holding) and lets the
  // seller log a refresh or relist they did on the marketplace.
  const _isActiveListing=!i.dateSold&&!i.resaleSalePrice&&!i.isReturned&&!!i.dateListed;
  if(_isActiveListing){
    const _eld=_effectiveListDate(i);
    const _cycleDays=_eld?daysBetween(_eld,_todayISO()):0;
    const _lifeDays=_lifetimeListDays(i);
    const _relistCount=(i.refreshHistory||[]).filter(e=>e.type==='relist').length;
    const _refreshCount=(i.refreshHistory||[]).filter(e=>e.type==='refresh').length;
    const _lastTouch=i._lastRefreshAt||i._lastRelistAt;
    const ageRow=
      '<div style="display:flex;gap:10px;margin-bottom:14px">'
      +'<div style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px">'
        +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">This listing</div>'
        +'<div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums">'+_cycleDays+'<span style="font-size:13px;font-weight:600;color:var(--text-secondary)">d</span></div>'
      +'</div>'
      +'<div style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px">'
        +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Total held</div>'
        +'<div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums">'+(_lifeDays!=null?_lifeDays:_cycleDays)+'<span style="font-size:13px;font-weight:600;color:var(--text-secondary)">d</span></div>'
      +'</div>'
      +'</div>';
    const countNote=(_relistCount||_refreshCount)
      ?'<div style="font-size:11px;color:var(--muted);margin-bottom:12px">'
        +(_refreshCount?_refreshCount+' refresh'+(_refreshCount>1?'es':''):'')
        +(_refreshCount&&_relistCount?' · ':'')
        +(_relistCount?_relistCount+' relist'+(_relistCount>1?'s':''):'')
        +(_lastTouch?' · last '+fmtDate(_lastTouch):'')
        +'</div>':'';
    const maintBtns=
      '<div style="display:flex;gap:8px">'
      +'<button class="btn btn-secondary" style="flex:1;justify-content:center;gap:6px" onclick="markRefreshed(\''+m+'\',\''+id+'\')">'+icon('revert',15)+'Refreshed</button>'
      +'<button class="btn btn-secondary" style="flex:1;justify-content:center;gap:6px" onclick="markRelisted(\''+m+'\',\''+id+'\')">'+icon('relist',15)+'Relisted</button>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5">Refreshed = small price/photo tweak (keeps the clock). Relisted = ended &amp; re-created on the marketplace (resets the clock).</div>';
    html+=sec('Listing maintenance',ageRow+countNote+maintBtns,false,null,null,'ip-section-maintenance');
  }
  html+=sec('Timeline',timelineHTML||'<div style="color:var(--muted);font-size:13px;padding:4px 0">No history yet</div>',false,null,null,'ip-section-timeline');

  html+='</div>'; // ip-body
  html+='</div>'; // ip-content
  html+='</div>'; // item-full-page
  page.innerHTML=html;
  page.querySelectorAll('.ip-token[onclick]:not(button),.ip-title[onclick],.ip-section-header:not(button)').forEach(function(el){
    el.setAttribute('role','button');el.tabIndex=0;
    el.addEventListener('keydown',function(e){if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();el.click();}});
  });
  // Populate shipping policy dropdowns on item page
  ['ip-policy-sel-'+id].forEach(function(sid){
    const sel=document.getElementById(sid);
    if(sel)_populateShippingPolicySelect(sel,{yourCost:Number(i.resaleSalePrice?(i.resaleShippingCost!=null?i.resaleShippingCost:i.shippingCost):i.shippingCost)||0,buyerPays:Number(i.resaleSalePrice?(i.resalePostage!=null?i.resalePostage:i.postage):i.postage)||0});
  });
},

"_renderStockItemPage": function(m,i){
  delete document.getElementById('p-item').dataset.rtAccountId;
  const page=document.getElementById('p-item');
  if(!page)return;
  const id=i.id;
  const ageDays=_daysInStock(i);
  const partsCost=calcPartsCost(i);
  const totalCapital=(_fixedAccountAmount(i)!=null?_fixedAccountAmount(i):(i.costPrice||0))+partsCost;
  const ageStr=ageDays===null?'unknown':ageDays+' day'+(ageDays===1?'':'s');
  const back=`<button class="btn btn-secondary" onclick="exitItemPage()" style="margin-bottom:10px;font-size:13px">\u2190 Back</button>`;
  const photo=i.photo
    ?`<div style="margin:0 auto 16px;max-width:280px;border-radius:12px;overflow:hidden;border:1px solid var(--border);"><img src="${i.photo}" alt="Stock photo" style="width:100%;display:block;"></div>`
    :`<div style="margin:0 auto 16px;max-width:280px;height:140px;border-radius:12px;border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:13px;">No photo</div>`;
  const metaTags=(i.category||i.source||i.location)
    ?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">`
      +(i.category?`<span style="font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 9px;color:var(--text-secondary);">${esc(i.category)}</span>`:'')
      +(i.source?`<span style="font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 9px;color:var(--text-secondary);">\ud83d\udccd ${esc(i.source)}</span>`:'')
      +(i.location?`<span style="font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 9px;color:var(--text-secondary);">\ud83d\udce6 ${esc(i.location)}</span>`:'')
      +`</div>`
    :'';
  const capitalToken=partsCost>0
    ?`<div class="ip-token locked" style="grid-column:span 2;"><div class="ip-token-label">Total Capital</div><div class="ip-token-val">${fmt(totalCapital)}</div><div class="ip-token-sub">Buy ${fmt(_fixedAccountAmount(i)!=null?_fixedAccountAmount(i):(i.costPrice||0))} + parts ${fmt(partsCost)}</div></div>`
    :'';
  const html=`
    <div style="max-width:560px;margin:0 auto;padding:18px 16px 80px;">
      ${back}
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span class="item-badge sourced" style="font-size:11px;padding:4px 9px;">sourced</span>
        <span style="font-size:12px;color:var(--text-secondary);">${i.gid||''}</span>
      </div>
      ${photo}
      <h1 style="font-family:var(--font-display);font-size:26px;font-weight:800;letter-spacing:-0.02em;margin:0 0 10px;">${esc(i.item||'Untitled stock item')}</h1>
      ${metaTags}
      <div class="ip-tokens" style="grid-template-columns:1fr 1fr;margin-bottom:18px;">
        <div class="ip-token" id="tok-costPrice-${id}"
          onpointerdown="tokenPointerDown('${m}','${id}','costPrice')"
          onclick="openTokenEdit('${m}','${id}','costPrice')">
          <div class="ip-token-label">Buy Price</div>
          <div class="ip-token-val">${fmt(_fixedAccountAmount(i)!=null?_fixedAccountAmount(i):(i.costPrice||0))}</div>
          <div class="ip-token-sub">\u270f\ufe0f Tap to edit</div>
        </div>
        <div class="ip-token locked">
          <div class="ip-token-label">In Stock</div>
          <div class="ip-token-val">${ageStr}</div>
          <div class="ip-token-sub">Sourced ${i.dateSourced||'\u2014'}</div>
        </div>
        ${capitalToken}
        <div class="ip-token" id="tok-estSalePrice-${id}"
          onpointerdown="tokenPointerDown('${m}','${id}','estSalePrice')"
          onclick="openTokenEdit('${m}','${id}','estSalePrice')">
          <div class="ip-token-label">Est. Sale</div>
          <div class="ip-token-val">${i.estSalePrice!=null?fmt(i.estSalePrice):'—'}</div>
          <div class="ip-token-sub">${i.estSalePrice!=null?'✎ Tap to edit':'Add estimate'}</div>
        </div>
        ${(function(){
          const _net=_estPotentialNet(i);
          const _cut=_estPartnerCut(i);
          const _margin=i.estSalePrice>0&&_net!=null?Math.round((_net/i.estSalePrice)*100):null;
          const _sub=_net==null?'add expected sale price':(_cut!=null?('after '+fmt(_cut)+' partner share'):_margin+'% margin est');
          return `
        <div class="ip-token locked">
          <div class="ip-token-label">Expected Profit</div>
          <div class="ip-token-val" style="color:${_net==null?'var(--muted)':(_net>=0?'var(--green)':'var(--red)')}">${_net==null?'—':((_net>=0?'+':'')+fmt(_net))}</div>
          <div class="ip-token-sub">${_sub}</div>
        </div>`;})()}
      </div>
      ${_ipCostEditorHTML(m,i)}
      ${i.notes?`<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:18px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);font-weight:600;margin-bottom:6px;">Notes</div><div style="font-size:14px;color:var(--text);line-height:1.5;white-space:pre-wrap;">${esc(i.notes)}</div></div>`:''}
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:18px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-secondary);font-weight:600;margin-bottom:10px;">Parts &amp; Expenses${(i.parts||[]).length>0?' ('+i.parts.length+')':''}</div>
        ${partsHTML(m,id,'page')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button class="btn btn-primary" onclick="openListFromSourced('${m}','${id}')">List this item &#x2192;</button>
        <button class="btn btn-secondary" onclick="editItem('${m}','${id}')">${icon('edit',14)} Edit</button>
        <button class="btn btn-secondary danger" onclick="deleteItem('${m}','${id}')">${icon('trash',14)} Delete</button>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:24px;line-height:1.5;">
        Parts and expenses carry through to the full P&amp;L once listed and sold.
      </div>
    </div>`;
  page.innerHTML=html;
}
});
