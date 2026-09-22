/* RETRADE Cashflow dashboard v2 — v1.4.87
 * Responsive presentation layer only. Accounting remains authoritative in
 * src/core/application.js + src/features/cashflow/liabilities.js.
 */
(function(){
  'use strict';
  if(typeof window.renderCash!=='function'||typeof window.calcCashSummary!=='function')return;
  if(window.__rtCashDashboardV2Ready)return;
  window.__rtCashDashboardV2Ready=true;

  var originalRenderCash=window.renderCash;
  var cashSort='newest';
  try{cashSort=localStorage.getItem('retrade_cash_sort')||'newest';}catch(_){}

  function num(v){v=Number(v);return isFinite(v)?v:0;}
  function round(v){return Math.round(num(v)*100)/100;}
  function money(v){return typeof fmt==='function'?fmt(num(v)):'£'+num(v).toFixed(2);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function label(v){return String(v||'cash').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
  function localISO(d){var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day;}

  function periodStats(events,days){
    var now=new Date();now.setHours(0,0,0,0);
    var from=new Date(now);from.setDate(from.getDate()-(days-1));
    var fromS=localISO(from),toS=localISO(now),moneyIn=0,moneyOut=0,count=0;
    (events||[]).forEach(function(ev){
      var d=String(ev&&ev.date||'');
      if(d<fromS||d>toS)return;
      var amt=Math.max(0,num(ev.amount));if(!amt)return;
      count++;
      if(ev.direction==='out')moneyOut+=amt;else moneyIn+=amt;
    });
    moneyIn=round(moneyIn);moneyOut=round(moneyOut);
    return {inflow:moneyIn,outflow:moneyOut,net:round(moneyIn-moneyOut),count:count,days:days};
  }

  function injectStyles(){
    if(document.getElementById('rt-cash-experience-1487-style'))return;
    var s=document.createElement('style');s.id='rt-cash-experience-1487-style';
    s.textContent='\
#p-cash .rt-cash-native-hidden{display:none!important}\
#p-cash .page-header{margin-bottom:16px}\
.rt-cash-dashboard{margin:0 0 22px}\
.rt-cash-dashboard-grid{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(260px,.85fr);gap:14px;align-items:stretch}\
.rt-cash-primary,.rt-cash-flow-card,.rt-cash-stock-card,.rt-cash-more{border:1px solid var(--border);background:var(--surface);border-radius:16px}\
.rt-cash-primary{padding:22px 24px;min-height:218px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;position:relative}\
.rt-cash-primary::after{content:"";position:absolute;width:230px;height:230px;border-radius:50%;right:-100px;top:-115px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 11%,transparent),transparent 68%);pointer-events:none}\
.rt-cash-eyebrow{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-secondary)}\
.rt-cash-primary-value{font-size:clamp(34px,4vw,48px);line-height:1;font-weight:850;letter-spacing:-.035em;margin-top:7px;font-variant-numeric:tabular-nums}\
.rt-cash-primary-value.negative{color:var(--red)}\
.rt-cash-primary-sub{font-size:12px;color:var(--text-secondary);margin-top:8px}\
.rt-cash-allocation{margin-top:18px}\
.rt-cash-allocation-track{height:8px;border-radius:999px;background:var(--surface2);overflow:hidden;display:flex;border:1px solid color-mix(in srgb,var(--border) 80%,transparent)}\
.rt-cash-allocation-free{height:100%;background:var(--green);min-width:0}\
.rt-cash-allocation-reserved{height:100%;background:var(--accent);min-width:0}\
.rt-cash-primary-meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}\
.rt-cash-meta-block{min-width:0}\
.rt-cash-meta-label{font-size:10.5px;color:var(--text-secondary)}\
.rt-cash-meta-value{display:block;margin-top:2px;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}\
.rt-cash-meta-value.reserved{color:var(--accent)}\
.rt-cash-commit-note{font-size:10.5px;color:var(--text-secondary);line-height:1.45;margin-top:9px}\
.rt-cash-side{display:grid;grid-template-rows:1fr 1fr;gap:14px}\
.rt-cash-flow-card,.rt-cash-stock-card{padding:17px 18px;display:flex;flex-direction:column;justify-content:center;min-height:102px}\
.rt-cash-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px}\
.rt-cash-card-title{font-size:11px;font-weight:800;letter-spacing:.055em;text-transform:uppercase;color:var(--text-secondary)}\
.rt-cash-period{font-size:10px;color:var(--text-secondary);background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:2px 7px}\
.rt-cash-flow-net{font-size:24px;font-weight:850;line-height:1.1;margin-top:8px;font-variant-numeric:tabular-nums}\
.rt-cash-flow-net.positive{color:#3b82f6}.rt-cash-flow-net.negative{color:var(--warn)}\
.rt-cash-flow-split{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px;font-size:10.5px;color:var(--text-secondary)}\
.rt-cash-flow-split strong{display:block;margin-top:1px;font-size:12px;font-variant-numeric:tabular-nums}.rt-cash-flow-split .in strong{color:#3b82f6}.rt-cash-flow-split .out strong{color:var(--warn)}\
.rt-cash-stock-value{font-size:23px;font-weight:850;line-height:1.1;margin-top:8px;font-variant-numeric:tabular-nums}\
.rt-cash-card-foot{font-size:10.5px;color:var(--text-secondary);line-height:1.4;margin-top:6px}\
.rt-cash-more{margin-top:14px;overflow:hidden}\
.rt-cash-more>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;min-height:48px}\
.rt-cash-more>summary::-webkit-details-marker{display:none}.rt-cash-more-title{font-size:12px;font-weight:800}.rt-cash-more-sub{display:block;font-size:10.5px;font-weight:500;color:var(--text-secondary);margin-top:2px}.rt-cash-more-chevron{transition:transform .18s ease;color:var(--text-secondary)}.rt-cash-more[open] .rt-cash-more-chevron{transform:rotate(180deg)}\
.rt-cash-more-body{border-top:1px solid var(--border);padding:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}\
.rt-cash-detail-card{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:13px;min-width:0}\
.rt-cash-detail-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.065em;color:var(--text-secondary);margin-bottom:9px}\
.rt-cash-detail-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--text-secondary);padding:5px 0;border-bottom:1px solid color-mix(in srgb,var(--border) 72%,transparent)}.rt-cash-detail-row:last-child{border-bottom:0}.rt-cash-detail-row strong{color:var(--text);font-size:11.5px;font-variant-numeric:tabular-nums;text-align:right}\
.rt-cash-detail-row strong.accent{color:var(--accent)}\
.rt-cash-equation{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--surface2) 72%,transparent);font-size:10.5px;color:var(--text-secondary)}.rt-cash-equation strong{color:var(--text);font-size:11px}\
#p-cash .cashflow-list-heading{margin-top:24px;align-items:center}\
#p-cash .cashflow-list-heading .sl{margin:0!important;font-size:13px}\
#p-cash .cashflow-result-count{font-size:10.5px;margin-top:2px}\
#p-cash .cashflow-manager{box-shadow:none;padding:12px 13px;margin-bottom:10px}\
#p-cash .cashflow-toolbar{grid-template-columns:minmax(240px,1.65fr) repeat(3,minmax(120px,.65fr));gap:8px}\
#p-cash .cashflow-control{height:38px}\
.rt-cash-mobile-tools{display:none}\
.rt-cash-sort{display:flex;align-items:center;gap:7px}.rt-cash-sort span{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary)}.rt-cash-sort select{height:34px;min-width:132px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text);font:inherit;font-size:11px;padding:0 9px}\
#p-cash .cashflow-manager-footer{margin-top:10px;padding-top:10px}\
#p-cash .cashflow-filter-totals{gap:13px}\
#p-cash .cashflow-ledger-list{display:none!important}\
.rt-cash-ledger{border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}\
.rt-cash-table-head,.rt-cash-table-row{display:grid;grid-template-columns:94px minmax(220px,1fr) 150px 92px 118px;gap:12px;align-items:center}\
.rt-cash-table-head{min-height:38px;padding:0 14px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:9.5px;font-weight:800;letter-spacing:.055em;text-transform:uppercase;color:var(--text-secondary)}\
.rt-cash-table-row{min-height:52px;padding:8px 14px;border-bottom:1px solid var(--border);content-visibility:auto;contain-intrinsic-size:52px}.rt-cash-table-row:last-child{border-bottom:0}.rt-cash-table-row.editable{cursor:pointer}.rt-cash-table-row.editable:hover{background:color-mix(in srgb,var(--surface2) 55%,transparent)}\
.rt-cash-date{font-size:10.5px;color:var(--text-secondary);font-variant-numeric:tabular-nums}.rt-cash-desc{font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-cash-type{font-size:10px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-cash-source{font-size:10px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-cash-amount{text-align:right;font-size:12px;font-weight:850;font-variant-numeric:tabular-nums}.rt-cash-amount.in{color:#3b82f6}.rt-cash-amount.out{color:var(--warn)}\
.rt-cash-mobile-list{display:none}\
@media(max-width:900px){.rt-cash-dashboard-grid{grid-template-columns:minmax(0,1.35fr) minmax(230px,.85fr)}.rt-cash-more-body{grid-template-columns:1fr 1fr}.rt-cash-detail-card:last-of-type{grid-column:1/-1}.rt-cash-table-head,.rt-cash-table-row{grid-template-columns:86px minmax(180px,1fr) 130px 104px}.rt-cash-table-head>*:nth-child(4),.rt-cash-table-row>*:nth-child(4){display:none}}\
@media(max-width:640px){\
  #p-cash .page-header{margin-bottom:14px}.rt-cash-dashboard{margin-bottom:18px}.rt-cash-dashboard-grid{display:block}.rt-cash-primary{padding:18px;min-height:0;border-radius:15px}.rt-cash-primary-value{font-size:38px}.rt-cash-primary-sub{font-size:11px}.rt-cash-primary-meta{gap:8px}.rt-cash-meta-value{font-size:14px}.rt-cash-side{grid-template-columns:1fr 1fr;grid-template-rows:none;gap:10px;margin-top:10px}.rt-cash-flow-card,.rt-cash-stock-card{padding:13px;min-height:116px;border-radius:14px}.rt-cash-flow-net,.rt-cash-stock-value{font-size:19px}.rt-cash-flow-split{display:block;margin-top:7px}.rt-cash-flow-split>div{display:flex;justify-content:space-between;gap:8px}.rt-cash-flow-split strong{display:inline}.rt-cash-more{border-radius:14px;margin-top:10px}.rt-cash-more-body{grid-template-columns:1fr;gap:9px}.rt-cash-detail-card:last-of-type{grid-column:auto}.rt-cash-equation{grid-column:auto;text-align:center}\
  #p-cash .cashflow-list-heading{margin-top:20px}.cashflow-manager{padding:10px!important}.cashflow-toolbar{display:block!important}.cashflow-toolbar>label{display:none!important}.cashflow-toolbar>.cashflow-search-field{display:flex!important}.cashflow-search-field{margin:0}.rt-cash-mobile-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px}.rt-cash-dir-chips{display:flex;gap:5px;min-width:0}.rt-cash-chip,.rt-cash-filter-toggle{height:34px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);color:var(--text-secondary);font:inherit;font-size:10.5px;font-weight:750;padding:0 10px;white-space:nowrap}.rt-cash-chip.active{background:var(--accent-dim);border-color:color-mix(in srgb,var(--accent) 45%,var(--border));color:var(--accent)}.rt-cash-filter-toggle{margin-left:auto}.rt-cash-filter-badge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;margin-left:5px;padding:0 4px;border-radius:999px;background:var(--accent);color:#111;font-size:9px}.cashflow-manager.rt-cash-mobile-filters-open .cashflow-toolbar>label.rt-cash-advanced-filter{display:flex!important;margin-top:8px}.cashflow-manager.rt-cash-mobile-filters-open .cashflow-toolbar>label.rt-cash-advanced-filter+label.rt-cash-advanced-filter{margin-top:7px}.rt-cash-direction-select{display:none!important}\
  #p-cash .cashflow-manager-footer{align-items:stretch;gap:8px;margin-top:9px;padding-top:9px}.cashflow-filter-totals{display:grid!important;grid-template-columns:repeat(3,1fr);gap:5px!important}.cashflow-filter-totals span{display:flex;flex-direction:column;align-items:flex-start;padding:7px 8px;border:1px solid var(--border);border-radius:9px;background:var(--surface2);font-size:9.5px}.cashflow-filter-totals b{margin:1px 0 0!important;font-size:11px!important}.cashflow-actions{justify-content:space-between!important}.cashflow-action-btn[onclick="printCashflow()"]{display:none}.cashflow-action-btn{min-height:34px!important}.rt-cash-sort{flex:1}.rt-cash-sort span{display:none}.rt-cash-sort select{width:100%;min-width:0}.cashflow-action-primary{flex:0 0 auto!important}.rt-cash-table{display:none}.rt-cash-mobile-list{display:block}.rt-cash-ledger{border-radius:13px}.rt-cash-mobile-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;padding:11px 12px;border-bottom:1px solid var(--border);content-visibility:auto;contain-intrinsic-size:60px}.rt-cash-mobile-row:last-child{border-bottom:0}.rt-cash-mobile-row.editable{cursor:pointer}.rt-cash-mobile-desc{font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-cash-mobile-meta{font-size:9.8px;color:var(--text-secondary);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-cash-mobile-amount{align-self:center;text-align:right;font-size:12px;font-weight:850;font-variant-numeric:tabular-nums}.rt-cash-mobile-amount.in{color:#3b82f6}.rt-cash-mobile-amount.out{color:var(--warn)}\
}\
@media(max-width:390px){.rt-cash-primary{padding:16px}.rt-cash-side{grid-template-columns:1fr}.rt-cash-flow-card,.rt-cash-stock-card{min-height:96px}.rt-cash-dir-chips{gap:4px}.rt-cash-chip,.rt-cash-filter-toggle{padding:0 8px;font-size:10px}}\
@media(prefers-reduced-motion:reduce){.rt-cash-more-chevron{transition:none!important}}';
    document.head.appendChild(s);
  }

  function findCardByText(page,needle){
    var out=null,low=String(needle).toLowerCase();
    Array.prototype.some.call(page.querySelectorAll('.card,details.card'),function(el){
      if(String(el.textContent||'').toLowerCase().indexOf(low)!==-1){out=el;return true;}return false;
    });
    return out;
  }

  function hideNativeOverview(page){
    Array.prototype.forEach.call(page.querySelectorAll('.rt-cash-native-hidden'),function(el){el.classList.remove('rt-cash-native-hidden');});
    var hero=null;
    Array.prototype.some.call(page.querySelectorAll('.card'),function(card){
      var k=card.querySelector('.kpi-label');
      if(k&&/business cash available/i.test(String(k.textContent||''))){hero=card;return true;}return false;
    });
    if(hero)hero.classList.add('rt-cash-native-hidden');
    var audit=findCardByText(page,'Cash calculation audit');if(audit)audit.classList.add('rt-cash-native-hidden');
    var cashHeading=Array.prototype.slice.call(page.querySelectorAll('.sl')).find(function(el){return String(el.textContent||'').trim().toLowerCase()==='cash';});
    if(cashHeading){cashHeading.classList.add('rt-cash-native-hidden');if(cashHeading.nextElementSibling)cashHeading.nextElementSibling.classList.add('rt-cash-native-hidden');}
    var due=findCardByText(page,'Still to be paid');if(due)due.classList.add('rt-cash-native-hidden');
    var ownerHeading=Array.prototype.slice.call(page.querySelectorAll('.sl')).find(function(el){return String(el.textContent||'').trim().toLowerCase()==='owner';});
    if(ownerHeading){ownerHeading.classList.add('rt-cash-native-hidden');if(ownerHeading.nextElementSibling)ownerHeading.nextElementSibling.classList.add('rt-cash-native-hidden');}
    var oldPartner=document.getElementById('rt-partner-due-kpi');if(oldPartner)oldPartner.remove();
  }

  function buildOverview(c){
    var liabilities=c.unpaidLiabilities||{supplier:0,partner:0,total:0};
    var partner=Math.max(0,num(liabilities.partner)),supplier=Math.max(0,num(liabilities.supplier));
    var reserved=Math.max(0,num(liabilities.total)),held=num(c.cashAvailable),free=round(held-reserved);
    var freePct=held>0?clamp((Math.max(0,free)/held)*100,0,100):0;
    var reservedPct=held>0?clamp((Math.max(0,reserved)/held)*100,0,100):0;
    var p30=periodStats(c.events||[],30),fyNet=round(num(c.drawFY)-num(c.contribFY));
    var root=document.createElement('section');root.id='rt-cash-dashboard';root.className='rt-cash-dashboard';
    root.innerHTML=''
      +'<div class="rt-cash-dashboard-grid">'
        +'<article class="rt-cash-primary">'
          +'<div><div class="rt-cash-eyebrow">Free cash</div><div class="rt-cash-primary-value num '+(free<0?'negative':'')+'">'+money(free)+'</div><div class="rt-cash-primary-sub">Available after current supplier and partner commitments.</div></div>'
          +'<div class="rt-cash-allocation">'
            +'<div class="rt-cash-allocation-track" role="img" aria-label="'+esc(money(Math.max(0,free)))+' free and '+esc(money(reserved))+' committed from '+esc(money(held))+' cash held">'
              +'<span class="rt-cash-allocation-free" style="width:'+freePct.toFixed(2)+'%"></span><span class="rt-cash-allocation-reserved" style="width:'+reservedPct.toFixed(2)+'%"></span>'
            +'</div>'
            +'<div class="rt-cash-primary-meta"><div class="rt-cash-meta-block"><span class="rt-cash-meta-label">Cash held</span><strong class="rt-cash-meta-value num">'+money(held)+'</strong></div><div class="rt-cash-meta-block"><span class="rt-cash-meta-label">Committed</span><strong class="rt-cash-meta-value reserved num">'+money(reserved)+'</strong></div></div>'
            +(reserved>0?'<div class="rt-cash-commit-note">Partner '+money(partner)+' · Supplier '+money(supplier)+'</div>':'')
          +'</div>'
        +'</article>'
        +'<div class="rt-cash-side">'
          +'<article class="rt-cash-flow-card"><div class="rt-cash-card-top"><div class="rt-cash-card-title">Net cash movement</div><span class="rt-cash-period">30 days</span></div><div class="rt-cash-flow-net num '+(p30.net>=0?'positive':'negative')+'">'+(p30.net>0?'+':p30.net<0?'−':'')+money(Math.abs(p30.net))+'</div><div class="rt-cash-flow-split"><div class="in"><span>In</span><strong>'+money(p30.inflow)+'</strong></div><div class="out"><span>Out</span><strong>'+money(p30.outflow)+'</strong></div></div></article>'
          +'<article class="rt-cash-stock-card"><div class="rt-cash-card-title">Capital in stock</div><div class="rt-cash-stock-value num">'+money(c.stockTied)+'</div><div class="rt-cash-card-foot">Paid acquisition and parts still held in inventory.</div></article>'
        +'</div>'
      +'</div>'
      +'<details class="rt-cash-more"><summary><span><span class="rt-cash-more-title">More cash details</span><span class="rt-cash-more-sub">Commitments, owner activity and calculation context</span></span><span class="rt-cash-more-chevron">⌄</span></summary>'
        +'<div class="rt-cash-more-body">'
          +'<div class="rt-cash-detail-card"><div class="rt-cash-detail-title">Commitments</div><div class="rt-cash-detail-row"><span>Partner shares</span><strong>'+money(partner)+'</strong></div><div class="rt-cash-detail-row"><span>Supplier</span><strong>'+money(supplier)+'</strong></div><div class="rt-cash-detail-row"><span>Total reserved</span><strong class="accent">'+money(reserved)+'</strong></div></div>'
          +'<div class="rt-cash-detail-card"><div class="rt-cash-detail-title">Owner · this tax year</div><div class="rt-cash-detail-row"><span>Taken out</span><strong>'+money(c.drawFY)+'</strong></div><div class="rt-cash-detail-row"><span>Added</span><strong>'+money(c.contribFY)+'</strong></div><div class="rt-cash-detail-row"><span>Net taken</span><strong>'+money(fyNet)+'</strong></div></div>'
          +'<div class="rt-cash-detail-card"><div class="rt-cash-detail-title">Accounting context</div><div class="rt-cash-detail-row"><span>Gross profit · all time</span><strong>'+money(c.grossProfit)+'</strong></div><div class="rt-cash-detail-row"><span>Cash in · all time</span><strong>'+money(c.inflows)+'</strong></div><div class="rt-cash-detail-row"><span>Cash out · all time</span><strong>'+money(c.outflows)+'</strong></div></div>'
          +'<div class="rt-cash-equation"><span>Cash held</span><strong>'+money(held)+'</strong><span>=</span><span>cash in</span><strong>'+money(c.inflows)+'</strong><span>−</span><span>cash out</span><strong>'+money(c.outflows)+'</strong></div>'
        +'</div>'
      +'</details>';
    return root;
  }

  function sortRows(rows){
    rows=(rows||[]).slice();
    if(cashSort==='oldest')return rows.sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))||String(a.id||'').localeCompare(String(b.id||''));});
    if(cashSort==='amount_desc')return rows.sort(function(a,b){return num(b.amount)-num(a.amount)||(String(b.date||'').localeCompare(String(a.date||'')));});
    if(cashSort==='amount_asc')return rows.sort(function(a,b){return num(a.amount)-num(b.amount)||(String(b.date||'').localeCompare(String(a.date||'')));});
    return rows.sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))||String(b.id||'').localeCompare(String(a.id||''));});
  }

  window.setCashflowSort=function(value){
    cashSort=value||'newest';
    try{localStorage.setItem('retrade_cash_sort',cashSort);}catch(_){}
    try{window.renderCash();}catch(_){}
  };

  function snapshotRows(c){
    try{
      if(typeof window._cashflowFilteredSnapshot==='function')return sortRows((window._cashflowFilteredSnapshot()||{}).rows||[]);
    }catch(_){}
    return sortRows((c&&c.events)||[]);
  }

  function buildLedger(rows){
    var box=document.createElement('div');box.className='rt-cash-ledger';
    var desktop='<div class="rt-cash-table"><div class="rt-cash-table-head"><span>Date</span><span>Description</span><span>Type</span><span>Source</span><span style="text-align:right">Amount</span></div>';
    var mobile='<div class="rt-cash-mobile-list">';
    rows.forEach(function(m){
      var isOut=m&&m.direction==='out',editable=!!(m&&m.editableId),amount=(isOut?'−':'+')+money(Math.max(0,num(m&&m.amount)));
      var desc=esc((m&&m.description)||(m&&m.type)||'Cash movement'),date=esc((m&&m.date)||'Undated'),type=esc(label(m&&m.type)),source=esc((m&&m.source)||'app');
      desktop+='<div class="rt-cash-table-row'+(editable?' editable':'')+'" data-edit-id="'+(editable?esc(m.editableId):'')+'"><span class="rt-cash-date">'+date+'</span><span class="rt-cash-desc" title="'+desc+'">'+desc+'</span><span class="rt-cash-type">'+type+'</span><span class="rt-cash-source">'+source+'</span><span class="rt-cash-amount '+(isOut?'out':'in')+'">'+amount+'</span></div>';
      mobile+='<div class="rt-cash-mobile-row'+(editable?' editable':'')+'" data-edit-id="'+(editable?esc(m.editableId):'')+'"><div><div class="rt-cash-mobile-desc">'+desc+'</div><div class="rt-cash-mobile-meta">'+date+' · '+type+(editable?' · editable':'')+'</div></div><div class="rt-cash-mobile-amount '+(isOut?'out':'in')+'">'+amount+'</div></div>';
    });
    desktop+='</div>';mobile+='</div>';box.innerHTML=desktop+mobile;
    Array.prototype.forEach.call(box.querySelectorAll('[data-edit-id]'),function(row){
      var id=row.getAttribute('data-edit-id');if(!id)return;
      row.addEventListener('click',function(){try{if(typeof editCashMove==='function')editCashMove(id);}catch(_){}});
    });
    return box;
  }

  function compactResultCount(page){
    var el=page.querySelector('.cashflow-result-count');if(!el)return;
    var m=String(el.textContent||'').match(/(\d+)\s+of\s+(\d+)\s+movements/i);
    if(!m)return;
    el.textContent=m[1]===m[2]?m[2]+' movements':m[1]+' of '+m[2]+' movements';
  }

  function enhanceManager(page,c){
    var manager=page.querySelector('.cashflow-manager');if(!manager)return;
    compactResultCount(page);
    var toolbar=manager.querySelector('.cashflow-toolbar');
    if(toolbar){
      var labels=toolbar.querySelectorAll(':scope > label');
      var search=toolbar.querySelector('.cashflow-search-field');
      var direction=labels[1]||null,type=labels[2]||null,period=labels[3]||null;
      if(direction)direction.classList.add('rt-cash-direction-select');
      if(type)type.classList.add('rt-cash-advanced-filter');
      if(period)period.classList.add('rt-cash-advanced-filter');
      if(search&&!toolbar.querySelector('.rt-cash-mobile-tools')){
        var dirVal=direction&&direction.querySelector('select')?direction.querySelector('select').value:'all';
        var typeVal=type&&type.querySelector('select')?type.querySelector('select').value:'all';
        var periodVal=period&&period.querySelector('select')?period.querySelector('select').value:'all';
        var active=(typeVal!=='all'?1:0)+(periodVal!=='all'?1:0);
        var tools=document.createElement('div');tools.className='rt-cash-mobile-tools';
        tools.innerHTML='<div class="rt-cash-dir-chips"><button type="button" class="rt-cash-chip'+(dirVal==='all'?' active':'')+'" data-dir="all">All</button><button type="button" class="rt-cash-chip'+(dirVal==='in'?' active':'')+'" data-dir="in">In</button><button type="button" class="rt-cash-chip'+(dirVal==='out'?' active':'')+'" data-dir="out">Out</button></div><button type="button" class="rt-cash-filter-toggle">Filters'+(active?'<span class="rt-cash-filter-badge">'+active+'</span>':'')+'</button>';
        search.insertAdjacentElement('afterend',tools);
        Array.prototype.forEach.call(tools.querySelectorAll('[data-dir]'),function(btn){btn.addEventListener('click',function(){try{if(typeof setCashflowFilter==='function')setCashflowFilter('direction',btn.getAttribute('data-dir'));}catch(_){}});});
        tools.querySelector('.rt-cash-filter-toggle').addEventListener('click',function(){manager.classList.toggle('rt-cash-mobile-filters-open');});
      }
    }
    var footer=manager.querySelector('.cashflow-manager-footer'),actions=manager.querySelector('.cashflow-actions');
    if(footer&&actions&&!footer.querySelector('.rt-cash-sort')){
      var wrap=document.createElement('label');wrap.className='rt-cash-sort';wrap.innerHTML='<span>Sort</span><select aria-label="Sort cash movements"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount_desc">Amount · high to low</option><option value="amount_asc">Amount · low to high</option></select>';
      wrap.querySelector('select').value=cashSort;wrap.querySelector('select').addEventListener('change',function(){window.setCashflowSort(this.value);});
      actions.insertBefore(wrap,actions.firstChild);
      var excel=actions.querySelector('button[onclick="exportCashflowExcel()"]');if(excel)excel.textContent='Export';
    }
    var native=page.querySelector('.cashflow-ledger-list');
    if(native){
      var rows=snapshotRows(c),ledger=buildLedger(rows);native.insertAdjacentElement('afterend',ledger);
    }
  }

  function enhanceCashflow(){
    var page=document.getElementById('p-cash');if(!page)return;
    injectStyles();
    var c;try{c=calcCashSummary();}catch(_){return;}
    var old=document.getElementById('rt-cash-dashboard');if(old)old.remove();
    Array.prototype.forEach.call(page.querySelectorAll('.rt-cash-ledger'),function(el){el.remove();});
    hideNativeOverview(page);
    var header=page.querySelector('.page-header'),overview=buildOverview(c);
    if(header)header.insertAdjacentElement('afterend',overview);else page.insertBefore(overview,page.firstChild);
    enhanceManager(page,c);
  }

  window.renderCash=function(){
    var out=originalRenderCash.apply(this,arguments);
    enhanceCashflow();
    return out;
  };

  requestAnimationFrame(function(){var p=document.getElementById('p-cash');if(p&&p.children.length)enhanceCashflow();});
})();