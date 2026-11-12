/* accounts view implementations. Shared state and stable public functions live in core. */
window.__rtRegisterView("accounts", {
"_renderAccountPage": function(acct){
  document.getElementById('p-item').dataset.rtAccountId=String(acct.id);
  const page=document.getElementById('p-item');
  if(!page)return;
  const items=_accountItems(acct.id);
  const sold=items.filter(_accountItemIsSold)
    .sort(function(a,b){
      const da=(a.resaleSalePrice?a.resaleDateSold:a.dateSold)||'';
      const db=(b.resaleSalePrice?b.resaleDateSold:b.dateSold)||'';
      return db.localeCompare(da);
    });
  const active=items.filter(function(i){return !_accountItemIsSold(i)&&!i.scrappedAt&&(!i.isReturned||!!_activeJobLotMembership(i.id));});
  const returned=items.filter(function(i){return i.isReturned&&!i.scrappedAt&&!i.resaleSalePrice&&!_activeJobLotMembership(i.id);});
  // v1.01 fix — referenced below for the listed/unlisted stock rows but only defined
  // in the KPI-summary helper's scope; the merge dropped them here, crashing the whole
  // Partner page with "listedStock is not defined". Same logic as _accountStats.
  const listedStock=active.filter(function(i){const l=_activeJobLotForItem(i.id);return l?l.status==='listed':i.state==='listed';});
  const unlistedStock=active.filter(function(i){const l=_activeJobLotForItem(i.id);return l?l.status==='building':i.state==='sourced';});

  // Partner balance is rendered once by account-ui-v3; do not build a hidden legacy hero.
  const isSupplierAcct=(acct.accountType==='supplier');

  // ── Row helper builders ────────────────────────────────────────────────────
  // Compute the "You vs Partner" money split for the right-hand column. Handles
  // supplier (you keep all profit, partner got cost), consignment %, hybrid, and
  // Option-B fixed amount. Returns amounts + optional bracketed label ('50%',
  // 'cost', 'fixed', etc.).
  const _computeSplit=function(i,gross){
    const effType=_itemAccountType(i);
    const debt=_accountItemDebt(i);
    if(effType==='supplier'){
      return {you:(gross!==null?gross:null), partner:debt, youLabel:'', partnerLabel:'cost'};
    }
    // Consignment / hybrid
    if(gross===null){
      return {you:null, partner:null, youLabel:'', partnerLabel:''};
    }
    if(i.accountPaidAmount!=null){
      const you=+(gross-debt).toFixed(2);
      const yPct=gross>0?Math.round((you/gross)*100):0;
      return {you, partner:debt, youLabel:yPct+'%', partnerLabel:'fixed'};
    }
    if(i.accountSplitPercent!=null){
      const pPct=i.accountSplitPercent;
      const yPct=100-pPct;
      return {you:+(gross-debt).toFixed(2), partner:debt, youLabel:yPct+'%', partnerLabel:pPct+'%'};
    }
    return {you:gross, partner:null, youLabel:'', partnerLabel:''};
  };

  // Owed pill + tappable settle/unsettle button. Rendered anywhere owed !== null.
  const _settleControl=function(i,owed){
    if(owed===null)return '';
    const paid=!!i.accountSettled;
    const label=paid?'Settled \u2713':'Mark paid';
    const bg=paid?'rgba(34,197,94,0.14)':'rgba(212,136,10,0.14)';
    const col=paid?'var(--green)':'var(--accent)';
    const border=paid?'rgba(34,197,94,0.35)':'rgba(212,136,10,0.35)';
    return '<button type="button" onclick="toggleItemSettled(\''+i._month+'\',\''+i.id+'\',event)" '
      +'style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;'
      +'background:'+bg+';color:'+col+';border:1px solid '+border+';cursor:pointer;line-height:1.2;">'
      +label+'</button>';
  };
  // Split description line — supplier accounts show cost instead of split.
  const _splitLine=function(i){
    if(_itemAccountType(i)==='supplier'){
      const cost=+(i.costPrice||0);
      return cost>0?('Cost '+fmt(cost)):'No cost set';
    }
    if(i.accountPaidAmount!=null)return 'Fixed '+fmt(i.accountPaidAmount)+' to partner';
    if(i.accountSplitPercent!=null)return i.accountSplitPercent+'% to partner';
    return 'No split set';
  };
  // Per-row edit button — hidden on supplier rows (cost edits happen on item page).
  const _editSplitBtn=function(i){
    if(_itemAccountType(i)==='supplier')return '';
    const hasSplit=(i.accountSplitPercent!=null||i.accountPaidAmount!=null);
    return '<button class="btn btn-secondary" style="font-size:11px;padding:3px 9px;margin-top:6px;" '
      +'data-itemid="'+i.id+'" data-month="'+i._month+'" '
      +'onclick="openSetItemSplit(this.dataset.month,this.dataset.itemid)">'
      +(hasSplit?'Edit split':'Set split')+'</button>';
  };
  const _selCheckbox=function(isSel){
    return '<div style="flex-shrink:0;width:20px;height:20px;border-radius:4px;border:1.5px solid '
      +(isSel?'var(--accent)':'var(--border)')+';background:'+(isSel?'var(--accent)':'transparent')
      +';display:flex;align-items:center;justify-content:center;margin-right:8px;">'
      +(isSel?'<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#000" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>':'')
      +'</div>';
  };
  // Right-column money block — You (bold, green) + Partner (secondary) + settle btn
  const _moneyBlock=function(i,gross,owed){
    const sp=_computeSplit(i,gross);
    const youAmt=sp.you!==null?fmt(sp.you):'\u2014';
    const youColor=sp.you!==null?(sp.you>=0?'var(--green)':'var(--red)'):'var(--text-secondary)';
    const youLbl=sp.youLabel?' <span style="opacity:0.6;font-weight:500;font-size:10.5px;">('+sp.youLabel+')</span>':'';
    const partLine=(sp.partner!==null)
      ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:1px;white-space:nowrap;">Partner '+fmt(sp.partner)+(sp.partnerLabel?' <span style="opacity:0.7;">('+sp.partnerLabel+')</span>':'')+'</div>'
      : '';
    const settle=(owed!==null)?'<div style="margin-top:4px;">'+_settleControl(i,owed)+'</div>':'';
    return '<div style="text-align:right;flex-shrink:0;min-width:105px;">'
      +'<div style="font-size:14px;font-weight:700;color:'+youColor+';white-space:nowrap;">You '+youAmt+youLbl+'</div>'
      +partLine
      +settle
      +'</div>';
  };

  const soldRows=sold.length?sold.map(function(i){
    const owed=_accountItemDebt(i);
    const profit=calcGrossProfit(i);
    const salePriceStr=fmt(i.salePrice||0);
    const dateStr=(i.resaleSalePrice?i.resaleDateSold:i.dateSold)||'';
    const isSel=_acctSelected.has(i.id);
    if(_acctSelectMode){
      return '<div class="metric-inline" style="align-items:center;cursor:pointer;" onclick="_acctToggleSelect(\''+i.id+'\')">'
        +_selCheckbox(isSel)
        +'<div style="min-width:0;flex:1;">'
          +'<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
          +'<div style="font-size:11px;color:var(--text-secondary);margin-top:1px;">Sold '+dateStr+' \u00b7 '+salePriceStr+'</div>'
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0;margin-left:8px;">'
          +'<div style="font-size:14px;font-weight:700;color:'+(profit>=0?'var(--green)':'var(--red)')+';">'+(profit!==null?fmt(profit):'\u2014')+'</div>'
          +(owed!==null?'<div style="font-size:11px;color:'+(i.accountSettled?'var(--green)':'var(--text-secondary)')+';">'+(i.accountSettled?'Settled \u2713':'owed '+fmt(owed))+'</div>':'')
        +'</div></div>';
    }
    return '<div class="metric-inline" style="align-items:flex-start;">'
      +'<div style="min-width:0;flex:1;">'
        +'<div class="metric-k clickable" data-itemid="'+i.id+'" data-month="'+i._month+'" onclick="openItemDetail(this.dataset.month,this.dataset.itemid)" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
        +'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Sold '+dateStr+' \u00b7 for '+salePriceStr+'</div>'
        +_editSplitBtn(i)
      +'</div>'
      +_moneyBlock(i,profit,owed)
    +'</div>';
  }).join('') : '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">No sales yet from this account</div>';

  const _activeAccountRow=function(i){
    const owed=_accountItemDebt(i);
    const isSel=_acctSelected.has(i.id);
    const _jl=_activeJobLotForItem(i.id);
    const isUnlisted=_jl?_jl.status==='building':i.state==='sourced';
    const stateLabel=_jl?('Job Lot · '+(_jl.name||'Job Lot')):(isUnlisted?'Unlisted':'Listed');
    const askingValue=_jl?_jobLotMemberAskingShare(i,_jl):(Number(i.salePrice)||0);
    const askingStr=fmt(askingValue);
    const stockCostStr=fmt((Number(i.costPrice)||0)+(typeof calcPartsCost==='function'?(Number(calcPartsCost(i))||0):0));
    const badgeClass=_jl?'joblot':(isUnlisted?'sourced':'listed');
    const detailClick=_jl?("openJobLotPage('"+_jl.id+"')"):"openItemDetail(this.dataset.month,this.dataset.itemid)";
    const estGross=_jl?_jobLotMemberPotentialShare(i,_jl):calcEstGrossProfit(i);
    const estNet=_jl
      ? (estGross==null?null:+(estGross-_estimatedPartnerCutFromProfit(i,estGross)).toFixed(2))
      : calcEstProfit(i);
    const partnerEst=estGross==null?null:_estimatedPartnerCutFromProfit(i,estGross);

    if(_acctSelectMode){
      return '<div class="metric-inline" style="align-items:center;cursor:pointer;" onclick="_acctToggleSelect(\''+i.id+'\')">'
        +_selCheckbox(isSel)
        +'<div style="min-width:0;flex:1;"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
        +'<div style="font-size:11px;color:var(--text-secondary);"><span class="item-badge '+badgeClass+'" style="font-size:10px;padding:2px 6px;">'+stateLabel+'</span> · '+_splitLine(i)+'</div></div>'
        +'<div style="text-align:right;flex-shrink:0;margin-left:8px;">'
          +'<div style="font-size:14px;font-weight:700;">'+(isUnlisted?(i.estSalePrice?fmt(i.estSalePrice):'—'):askingStr)+'</div>'
          +(estNet!=null?'<div style="font-size:11px;color:'+(estNet>=0?'var(--green)':'var(--red)')+';">you est '+fmt(estNet)+'</div>':'')
        +'</div></div>';
    }

    const rightHeadline=isUnlisted
      ? (i.estSalePrice?('Est. sale '+fmt(i.estSalePrice)):'Needs estimate')
      : (_jl?'Lot share '+askingStr:'Asking '+askingStr);
    const activeRight='<div style="text-align:right;flex-shrink:0;min-width:120px;">'
      +'<div style="font-size:13px;font-weight:700;color:var(--text-secondary);white-space:nowrap;">'+rightHeadline+'</div>'
      +((!isSupplierAcct&&estNet!=null)
        ? '<div style="font-size:12px;color:'+(estNet>=0?'var(--green)':'var(--red)')+';margin-top:2px;">You est. '+fmt(estNet)+'</div>'
          +(partnerEst>0?'<div style="font-size:11px;color:var(--text-secondary);">Partner est. '+fmt(partnerEst)+'</div>':'')
        : (owed!==null?'<div style="font-size:12px;color:var(--text-secondary);margin-top:1px;">Owed '+fmt(owed)+' <span style="opacity:0.7;">(cost)</span></div><div style="margin-top:4px;">'+_settleControl(i,owed)+'</div>':''))
    +'</div>';

    return '<div class="metric-inline" style="align-items:flex-start;">'
      +'<div style="min-width:0;flex:1;">'
        +'<div class="metric-k clickable" data-itemid="'+i.id+'" data-month="'+i._month+'" onclick="'+detailClick+'" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
        +'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;"><span class="item-badge '+badgeClass+'" style="font-size:10px;padding:2px 6px;">'+stateLabel+'</span> · '+_splitLine(i)+'</div>'
        +_editSplitBtn(i)
      +'</div>'
      +activeRight
    +'</div>';
  };

  const listedRows=listedStock.length
    ? listedStock.map(_activeAccountRow).join('')
    : '<div style="padding:18px;text-align:center;color:var(--muted);font-size:12px;">No listed stock</div>';
  const unlistedRows=unlistedStock.length
    ? unlistedStock.map(_activeAccountRow).join('')
    : '<div style="padding:18px;text-align:center;color:var(--muted);font-size:12px;">No unlisted stock waiting to be listed</div>';

  const returnedRows=returned.length?returned.map(function(i){
    const isSel=_acctSelected.has(i.id);
    const rr=(i.returnHistory||[]).slice().reverse().find(function(r){return r.type==='full_seller'||r.type==='full_ebay';});
    const rd=(rr&&rr.loggedAt)||'';
    const cost=fmt((Number(i.costPrice)||0)+(typeof calcPartsCost==='function'?(Number(calcPartsCost(i))||0):0));
    const returnRight=isSupplierAcct?('Cost '+cost):_splitLine(i);
    if(_acctSelectMode){
      return '<div class="metric-inline" style="align-items:center;cursor:pointer;" onclick="_acctToggleSelect(\''+i.id+'\')">'
        +_selCheckbox(isSel)+'<div style="min-width:0;flex:1;"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
        +'<div style="font-size:11px;color:var(--text-secondary);"><span class="item-badge returned" style="font-size:10px;padding:2px 6px;">Returned</span>'+(rd?' · '+rd:'')+'</div></div>'
        +'<div style="font-size:13px;font-weight:700;">'+returnRight+'</div></div>';
    }
    return '<div class="metric-inline" style="align-items:flex-start;">'
      +'<div style="min-width:0;flex:1;"><div class="metric-k clickable" data-itemid="'+i.id+'" data-month="'+i._month+'" onclick="openItemDetail(this.dataset.month,this.dataset.itemid)" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(i.item||'Untitled')+'</div>'
      +'<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;"><span class="item-badge returned" style="font-size:10px;padding:2px 6px;">Returned</span>'+(rd?' · back '+rd:'')+' · action needed</div></div>'
      +'<div style="text-align:right;flex-shrink:0;min-width:105px;"><div style="font-size:13px;font-weight:700;color:var(--text-secondary);">'+returnRight+'</div>'
      +'<button class="btn btn-secondary" style="font-size:11px;padding:3px 9px;margin-top:5px;color:var(--accent);" onclick="openRelist(\''+i._month+'\',\''+i.id+'\')">Relist</button></div></div>';
  }).join(''):'<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px;">No returned stock</div>';

  // Items with neither a % nor a fixed amount set — candidates for "apply default".
  const noSplitCount=items.filter(function(i){return i.accountSplitPercent==null&&i.accountPaidAmount==null;}).length;
  const _typeLabels={consignment:'Consignment',supplier:'Supplier',hybrid:'Hybrid'};
  const _typeColors={consignment:'var(--accent)',supplier:'var(--blue)',hybrid:'var(--green)'};
  const _typeTag='<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,0.08);color:'
    +(_typeColors[acct.accountType]||'var(--muted)')+';">'+(_typeLabels[acct.accountType]||'Supplier')+'</span>';

  const hasDefault=acct.defaultSplitPercent!=null;
  const defaultLine=isSupplierAcct
    ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Supplier account \u2014 item cost is what you owe the partner per item.</div>'
    : hasDefault
      ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Default split: <strong style="color:var(--text);">'+acct.defaultSplitPercent+'% to partner</strong>'
        +(acct.accountType==='consignment'?' \u00b7 costPrice auto-set to \u00a30 on assign':'')+'.</div>'
      : '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">No default split set. Tap <strong style="color:var(--text);">Edit</strong> to set the arrangement.</div>';

  const html='<div style="padding:16px 0 40px;">'
    +'<button class="btn btn-secondary" onclick="backToAccountsList()" style="margin-bottom:14px;">\u2190 Accounts</button>'
    +'<div class="page-header" style="margin-bottom:14px;">'
      +'<div><div class="page-title">'+esc(acct.name)+'</div>'
      +'<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">'+_typeTag
      +(acct.notes?'<span style="font-size:12px;color:var(--text-secondary);">'+esc(acct.notes)+'</span>':'')+'</div></div>'
    +'</div>'
    +defaultLine
    +((!isSupplierAcct&&hasDefault&&noSplitCount>0&&!_acctSelectMode)?'<button class="btn btn-secondary" style="width:100%;margin-bottom:10px;" onclick="applyDefaultSplitToAll(\''+acct.id+'\')">Apply '+acct.defaultSplitPercent+'% to '+noSplitCount+' item'+(noSplitCount!==1?'s':'')+' with no split</button>':'')
    +_accountGroupHTML(acct,'sales','Sales',sold.length,soldRows,true)
    +_accountGroupHTML(acct,'listed','Listed stock',listedStock.length,listedRows,false)
    +_accountGroupHTML(acct,'unlisted','Unlisted · needs listing',unlistedStock.length,unlistedRows,false)
    +_accountGroupHTML(acct,'returned','Returned · action needed',returned.length,returnedRows,false)
    +((acct.settlements||[]).length?_accountGroupHTML(acct,'settlements','Settlement history',(acct.settlements||[]).length,(acct.settlements||[]).map(function(tx){return '<button type="button" class="metric-inline" style="width:100%;border:0;background:transparent;text-align:left;cursor:pointer;" onclick="_openSettlementDetail(\''+acct.id+'\',\''+tx.id+'\')"><div style="min-width:0;flex:1;"><div class="metric-k">'+(tx.paid?'Paid ':'Allocated ')+fmt(tx.partnerAmount||0)+'</div><div style="font-size:11px;color:var(--text-secondary);">'+esc(tx.date||'')+' · '+((tx.items||[]).length)+' item'+((tx.items||[]).length!==1?'s':'')+(tx.note?' · '+esc(tx.note):'')+'</div></div><span style="font-size:11px;color:'+(tx.paid?'var(--green)':'var(--warn)')+';">'+(tx.paid?'Paid ✓':'Unpaid')+'</span></button>';}).join(''),true,'margin-bottom:0;opacity:.92;'):'')
  +'</div>';
  page.innerHTML=html;
}
});
