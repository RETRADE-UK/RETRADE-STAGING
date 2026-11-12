/* data view implementations. Shared state and stable public functions live in core. */
window.__rtRegisterView("data", {
"renderData": function(){
  // Build FY list for annual export selector
  const fySet=new Set([_currentFYStart()]);
  allDBKeys().forEach(function(k){
    const mo=MONTHS.indexOf(keyCode(k)),yr=keyYear(k);
    if(mo>=0) fySet.add(mo>=3?yr:yr-1);
  });
  const fyYears=Array.from(fySet).sort((a,b)=>b-a);
  const _curFY=_currentFYStart();
  const fyOpts=fyYears.map(function(fy){
    // <option> renders plain text only — CSS-toggled dual-span _getFYLabel would print both forms ("2026–202726–27"); use a plain label.
    return '<option value="'+fy+'"'+(fy===_curFY?' selected':'')+'>FY '+fy+'–'+String(fy+1).slice(-2)+(fy===_curFY?' (current)':'')+'</option>';
  }).join('');

  // Build month list for monthly export selector
  const _curMonthKey=currentMonthKey();
  const allMonths=allDBKeys().filter(function(k){
    const ms=calcMonthStatsBySale(k);
    return ms.soldCount>0||ms.eventCount>0;
  }).sort((a,b)=>{
    const ya=keyYear(a),yb=keyYear(b),ma=MONTHS.indexOf(keyCode(a)),mb=MONTHS.indexOf(keyCode(b));
    if(ya!==yb)return yb-ya; return mb-ma;
  });
  // Default to current month if it has data, else most recent month with sales
  const _defaultMonth=allMonths.includes(_curMonthKey)?_curMonthKey:(allMonths[0]||'');
  const monthOpts=allMonths.map(function(k){
    return '<option value="'+k+'"'+(k===_defaultMonth?' selected':'')+'>'+keyName(k)+'</option>';
  }).join('');

  document.getElementById('p-data').innerHTML=_dataWorkspaceMarkup(monthOpts,fyOpts,false);
  try{_setRangePreset('mtd');}catch(e){}
},

"renderRelistAudit": function(){
  const out=document.getElementById('relist-audit-out');
  if(!out)return;
  const audit=auditRelistOrphans();
  const totalOrphans=audit.resold.length+audit.pending.length;
  if(!totalOrphans){
    out.innerHTML='<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:16px;color:var(--text-secondary);font-size:14px">'+
      '<strong style="color:var(--text)">✓ All clean.</strong> No relisted items missing snapshot data. '+
      (audit.healthy?audit.healthy+' relisted item'+(audit.healthy!==1?'s':'')+' verified.':'No relisted items in your data.')+
      '</div>';
    return;
  }
  const renderRow=function(row,bucket){
    const i=row.item;
    const curShip=(i.shippingCost||0).toFixed(2);
    const curPost=(i.postage||0).toFixed(2);
    const curPkg=(i.packagingCost||0).toFixed(2);
    const curPromo=((i.promoPercent||0)*100).toFixed(0);
    const fullReturn=(i.returnHistory||[]).slice().reverse().find(function(r){return (r.type==='full_seller'||r.type==='full_ebay')&&(Number(r.saleNo)||1)===1;});
    const curPrice=(fullReturn&&fullReturn._salePriceAtReturn)?fullReturn._salePriceAtReturn.toFixed(2):(fullReturn&&fullReturn.refundAmount?fullReturn.refundAmount.toFixed(2):(i.salePrice||0).toFixed(2));
    const inputStyle='width:80px;padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;font-family:inherit';
    return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px" data-orphan-row="'+row.m+'|'+row.id+'">'+
      '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:10px;flex-wrap:wrap">'+
        '<div>'+
          '<div style="font-weight:600;font-size:14px">'+esc(row.name)+'</div>'+
          '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">'+row.m+' · relisted '+esc(row._relistedAt)+
          (bucket==='resold'?' · Sale '+_currentResaleSaleNo(i)+' sold '+esc(i.resaleDateSold||'?'):'')+
          '</div>'+
        '</div>'+
        '<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="openItemPage(\''+row.m+'\',\''+row.id+'\',\'p-data\')">Open item</button>'+
      '</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:end;font-size:12px;color:var(--text-secondary)">'+
        '<label style="display:flex;flex-direction:column;gap:3px">Sale 1 price (£)<input type="number" step="0.01" min="0" data-orphan-field="salePrice" value="'+curPrice+'" style="'+inputStyle+'"></label>'+
        '<label style="display:flex;flex-direction:column;gap:3px">Sale 1 shipping (£)<input type="number" step="0.01" min="0" data-orphan-field="shipping" value="'+curShip+'" style="'+inputStyle+'"></label>'+
        '<label style="display:flex;flex-direction:column;gap:3px">Sale 1 postage (£)<input type="number" step="0.01" min="0" data-orphan-field="postage" value="'+curPost+'" style="'+inputStyle+'"></label>'+
        '<label style="display:flex;flex-direction:column;gap:3px">Sale 1 packaging (£)<input type="number" step="0.01" min="0" data-orphan-field="packaging" value="'+curPkg+'" style="'+inputStyle+'"></label>'+
        '<label style="display:flex;flex-direction:column;gap:3px">Sale 1 promo (%)<input type="number" step="1" min="0" max="20" data-orphan-field="promoPercent" value="'+curPromo+'" style="'+inputStyle+'"></label>'+
      '</div>'+
      (bucket==='resold'?'<div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Current lifetime profit: <strong style="color:var(--text)">'+fmt(calcGrossProfit(i))+'</strong> — will recalc on save.</div>':'')+
    '</div>';
  }
  let html='';
  if(audit.resold.length){
    html+='<div style="margin-bottom:8px;font-weight:600;font-size:13px;color:var(--warn)">⚠ Resold orphans ('+audit.resold.length+') — lifetime P&L currently wrong</div>';
    html+=audit.resold.map(function(r){return renderRow(r,'resold');}).join('');
  }
  if(audit.pending.length){
    html+='<div style="margin:'+(audit.resold.length?'16px':'0')+' 0 8px;font-weight:600;font-size:13px;color:var(--accent)">Pending relists ('+audit.pending.length+') — fix before next sale</div>';
    html+=audit.pending.map(function(r){return renderRow(r,'pending');}).join('');
  }
  if(audit.healthy)
    html+='<div style="margin-top:12px;font-size:12px;color:var(--text-secondary)">Plus '+audit.healthy+' relisted item'+(audit.healthy!==1?'s':'')+' already healthy.</div>';
  html+='<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn btn-primary" onclick="saveRelistAuditEdits()">'+icon('save',14)+' Save all snapshots</button>'+
    '<button class="btn btn-secondary" onclick="renderRelistAudit()">'+icon('refresh',14)+' Re-run audit</button>'+
  '</div>';
  out.innerHTML=html;
}
});
