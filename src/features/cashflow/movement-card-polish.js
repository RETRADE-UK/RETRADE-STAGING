/* RETRADE Cashflow — ledger card polish (v1.4.90)
 * Presentation only. Reuses values calculated by src/features/cashflow/dashboard-v2.js.
 */
(function(){
  'use strict';
  if(window.__rtCashMovementCardPolishReady)return;
  if(typeof window.renderCash!=='function')return;
  window.__rtCashMovementCardPolishReady=true;

  function injectStyles(){
    if(document.getElementById('rt-cash-ledger-polish-1490'))return;
    var s=document.createElement('style');
    s.id='rt-cash-ledger-polish-1490';
    s.textContent='\
#p-cash #rt-free-cash-card{display:none!important}\
#p-cash .rt-cash-flow-card,#p-cash .rt-cash-stock-card{justify-content:flex-start;padding:16px 17px}\
.rt-cash-movement-head,.rt-cash-stock-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:26px}\
.rt-cash-movement-head .rt-cash-card-title,.rt-cash-stock-head .rt-cash-card-title{line-height:1.25;min-width:0}\
.rt-cash-movement-period,.rt-cash-stock-status{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-height:24px;padding:0 8px;border-radius:7px;background:var(--surface2);color:var(--text-secondary);font-size:9.5px;font-weight:700;letter-spacing:.015em;white-space:nowrap}\
.rt-cash-movement-rows,.rt-cash-stock-rows{margin-top:9px}\
.rt-cash-movement-row,.rt-cash-stock-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:10px;padding:3px 0;color:var(--text-secondary);font-size:10.5px}\
.rt-cash-movement-row strong,.rt-cash-stock-row strong{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;font-size:12px;line-height:1.2;color:var(--text);font-weight:800}\
.rt-cash-movement-row.net,.rt-cash-stock-row.primary{padding:6px 0 8px;margin-bottom:4px;border-bottom:1px solid color-mix(in srgb,var(--border) 82%,transparent)}\
.rt-cash-movement-row.net span,.rt-cash-stock-row.primary span{font-weight:750;color:var(--text)}\
.rt-cash-movement-row.net strong,.rt-cash-stock-row.primary strong{font-size:18px;font-weight:850;letter-spacing:-.018em}\
.rt-cash-movement-row.net strong.positive,.rt-cash-movement-row.in strong{color:#3b82f6}\
.rt-cash-movement-row.net strong.negative,.rt-cash-movement-row.out strong{color:var(--warn)}\
.rt-cash-stock-row.secondary strong{font-size:10.5px;font-weight:700;color:var(--text-secondary)}\
#p-cash .rt-cash-more{background:color-mix(in srgb,var(--surface) 96%,var(--surface2));box-shadow:none}\
#p-cash .rt-cash-more>summary{padding:13px 16px}\
#p-cash .rt-cash-more-title{font-size:12px;letter-spacing:-.005em}\
#p-cash .rt-cash-more-sub{font-size:10px;margin-top:1px}\
#p-cash .rt-cash-more-chevron{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;background:var(--surface2);font-size:13px}\
@media(max-width:640px){#p-cash .rt-cash-flow-card,#p-cash .rt-cash-stock-card{padding:13px 14px;min-height:116px}.rt-cash-movement-head,.rt-cash-stock-head{gap:7px;align-items:flex-start}.rt-cash-movement-period,.rt-cash-stock-status{min-height:22px;padding:0 6px;font-size:9px;border-radius:6px}.rt-cash-movement-rows,.rt-cash-stock-rows{margin-top:6px}.rt-cash-movement-row,.rt-cash-stock-row{padding:2px 0;font-size:10px}.rt-cash-movement-row strong,.rt-cash-stock-row strong{font-size:11.5px}.rt-cash-movement-row.net,.rt-cash-stock-row.primary{padding:4px 0 6px;margin-bottom:3px}.rt-cash-movement-row.net strong,.rt-cash-stock-row.primary strong{font-size:17px}.rt-cash-stock-row.secondary strong{font-size:10px}}\
@media(max-width:390px){.rt-cash-movement-period,.rt-cash-stock-status{font-size:8.8px}.rt-cash-movement-row.net strong,.rt-cash-stock-row.primary strong{font-size:16px}}';
    document.head.appendChild(s);
  }

  function polishMovementCard(){
    var card=document.querySelector('#p-cash .rt-cash-flow-card');
    if(!card||card.dataset.movementPolished==='1')return;
    var net=card.querySelector('.rt-cash-flow-net');
    var inValue=card.querySelector('.rt-cash-flow-split .in strong');
    var outValue=card.querySelector('.rt-cash-flow-split .out strong');
    if(!net||!inValue||!outValue)return;

    var netText=String(net.textContent||'').trim();
    var inText=String(inValue.textContent||'').trim();
    var outText=String(outValue.textContent||'').trim();
    var netClass=net.classList.contains('negative')?'negative':'positive';

    card.innerHTML=''
      +'<div class="rt-cash-movement-head">'
        +'<div class="rt-cash-card-title">Net cash movement</div>'
        +'<span class="rt-cash-movement-period">30 days</span>'
      +'</div>'
      +'<div class="rt-cash-movement-rows">'
        +'<div class="rt-cash-movement-row net"><span>Net</span><strong class="num '+netClass+'">'+netText+'</strong></div>'
        +'<div class="rt-cash-movement-row in"><span>In</span><strong class="num">'+inText+'</strong></div>'
        +'<div class="rt-cash-movement-row out"><span>Out</span><strong class="num">'+outText+'</strong></div>'
      +'</div>';
    card.dataset.movementPolished='1';
  }

  function polishStockCard(){
    var card=document.querySelector('#p-cash .rt-cash-stock-card');
    if(!card||card.dataset.stockPolished==='1')return;
    var value=card.querySelector('.rt-cash-stock-value');
    if(!value)return;
    var valueText=String(value.textContent||'').trim();

    card.innerHTML=''
      +'<div class="rt-cash-stock-head">'
        +'<div class="rt-cash-card-title">Capital in stock</div>'
        +'<span class="rt-cash-stock-status">On hand</span>'
      +'</div>'
      +'<div class="rt-cash-stock-rows">'
        +'<div class="rt-cash-stock-row primary"><span>Invested</span><strong class="num">'+valueText+'</strong></div>'
        +'<div class="rt-cash-stock-row secondary"><span>Basis</span><strong>Acquisition + parts</strong></div>'
        +'<div class="rt-cash-stock-row secondary"><span>Status</span><strong>Unsold inventory</strong></div>'
      +'</div>';
    card.dataset.stockPolished='1';
  }

  function removeLegacySummary(){
    var page=document.getElementById('p-cash');
    if(!page)return;

    var legacy=page.querySelector('#rt-free-cash-card');
    if(legacy)legacy.remove();

    Array.prototype.forEach.call(page.querySelectorAll('.card'),function(card){
      if(card.closest&&card.closest('#rt-cash-dashboard'))return;
      var label=card.querySelector('.kpi-label');
      var text=label?String(label.textContent||'').trim():'';
      if(/^(free cash after commitments|business cash available)$/i.test(text))card.remove();
    });
  }

  function polishCashCards(){
    injectStyles();
    polishMovementCard();
    polishStockCard();
    removeLegacySummary();
  }

  var baseRenderCash=window.renderCash;
  window.renderCash=function(){
    var out=baseRenderCash.apply(this,arguments);
    polishCashCards();
    requestAnimationFrame(removeLegacySummary);
    return out;
  };

  requestAnimationFrame(polishCashCards);
})();