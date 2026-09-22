/* RETRADE Partners minimum loading dwell — v1.5.06
 * Keeps the final-layout Partners skeleton visible for a short, deterministic
 * interval even when cached data resolves immediately. Presentation only.
 */
(function(){
  'use strict';
  if(window.__rtPartnersLoadingDwell1506)return;
  window.__rtPartnersLoadingDwell1506=true;

  var MIN_MS=360, MAX_MS=1800, token=0;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function list(){try{return Array.isArray(_accounts)?_accounts:[];}catch(_){return [];}}
  function arrangement(a){try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(a);}catch(_){}return String(a&&a.accountType||'supplier').toLowerCase()==='supplier'?'fixed_cost':'profit_share';}
  function timing(a){try{if(typeof _rtPartnerPaymentTiming==='function')return _rtPartnerPaymentTiming(a);}catch(_){}var v=String(a&&a.paymentTiming||a&&a.paymentTerms||'upfront').toLowerCase();return v==='on_sale'?'on_sale':'upfront';}
  function meta(a){return arrangement(a)==='fixed_cost'?('Fixed cost · '+(timing(a)==='on_sale'?'After sale':'Upfront')):'Profit share';}

  function styles(){
    if(document.getElementById('rt-partners-dwell1506-style'))return;
    var s=document.createElement('style');s.id='rt-partners-dwell1506-style';s.textContent='\
#p-accounts.rt-partners-dwell1505{position:relative;min-height:70vh}\
#p-accounts.rt-partners-dwell1505>*:not(.rt-partners-dwell-shell1505){visibility:hidden!important}\
#p-accounts>.rt-partners-dwell-shell1505{visibility:visible!important;position:absolute;inset:0;z-index:30;background:var(--bg);padding:0 0 28px;box-sizing:border-box}\
.rt-pd1505-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:22px}.rt-pd1505-title{font-size:clamp(28px,3.2vw,42px);font-weight:800;line-height:1.05;letter-spacing:-.035em}.rt-pd1505-sub{margin-top:7px;color:var(--text-secondary);font-size:13px}.rt-pd1505-add{width:126px;height:42px;border-radius:10px;border:1px solid var(--border);background:var(--surface2)}\
.rt-pd1505-strip,.rt-pd1505-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(128px,auto) 18px;gap:16px;align-items:center;border:1px solid var(--border);box-sizing:border-box}.rt-pd1505-strip{min-height:58px;padding:11px 16px;margin-bottom:12px;border-radius:12px;background:var(--surface2)}.rt-pd1505-label{font-size:12px;color:var(--text-secondary)}.rt-pd1505-search{height:52px;border:1px solid var(--border);border-radius:12px;background:var(--surface);margin-bottom:14px}.rt-pd1505-rows{display:grid;gap:10px}.rt-pd1505-row{min-height:92px;padding:14px 16px;border-radius:14px;background:var(--surface)}.rt-pd1505-name{font-size:15px;font-weight:760;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rt-pd1505-meta{font-size:11px;color:var(--text-secondary);margin-top:9px}.rt-pd1505-shimmer{position:relative;overflow:hidden;background:var(--surface);border-radius:999px}.rt-pd1505-shimmer:after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,color-mix(in srgb,var(--text) 7%,transparent) 45%,transparent 70%);transform:translateX(-100%);animation:rtpd1505 1.05s ease-in-out infinite}.rt-pd1505-total{grid-column:2;width:92px;height:24px;justify-self:end}.rt-pd1505-money{width:86px;height:18px;justify-self:end}.rt-pd1505-chevron{width:9px;height:14px;border-right:2px solid var(--text-secondary);border-top:2px solid var(--text-secondary);transform:rotate(45deg);justify-self:center;opacity:.6}\
@keyframes rtpd1505{to{transform:translateX(100%)}}\
@keyframes rtpdReveal1506{from{opacity:.16;transform:translate3d(0,4px,0)}to{opacity:1;transform:translate3d(0,0,0)}}\
#p-accounts.rt-partners-reveal1506 .rt-acct-compact-strip>strong,#p-accounts.rt-partners-reveal1506 .rt-acct-op-money{animation:rtpdReveal1506 300ms cubic-bezier(.22,.61,.36,1) both;animation-delay:var(--rt-pd-delay,0ms)}\
#p-accounts.rt-partners-reveal1506 .rt-acct-op-row[data-account-id]{animation:rtpdReveal1506 250ms cubic-bezier(.22,.61,.36,1) both;animation-delay:var(--rt-pd-row-delay,0ms)}\
@media(max-width:760px){.rt-pd1505-strip,.rt-pd1505-row{grid-template-columns:minmax(0,1fr) minmax(108px,auto) 14px;gap:12px}.rt-pd1505-total{width:78px}}@media(max-width:560px){.rt-pd1505-head{margin-bottom:18px}.rt-pd1505-title{font-size:29px}.rt-pd1505-sub{font-size:11px;line-height:1.35}.rt-pd1505-add{width:96px;height:40px}.rt-pd1505-row{min-height:82px;padding:13px}.rt-pd1505-search{height:46px}}@media(prefers-reduced-motion:reduce){.rt-pd1505-shimmer:after{animation:none!important}#p-accounts.rt-partners-reveal1506 .rt-acct-compact-strip>strong,#p-accounts.rt-partners-reveal1506 .rt-acct-op-money,#p-accounts.rt-partners-reveal1506 .rt-acct-op-row[data-account-id]{animation:none!important}}';document.head.appendChild(s);
  }

  function shell(page){
    var old=page.querySelector('.rt-partners-dwell-shell1505');if(old)old.remove();
    var accounts=list(),count=Math.max(3,Math.min(7,accounts.length||5)),rows='';
    for(var i=0;i<count;i++){var a=accounts[i]||null;rows+='<div class="rt-pd1505-row"><div><div class="rt-pd1505-name">'+esc(a&&a.name||'Partner account')+'</div><div class="rt-pd1505-meta">'+esc(a?meta(a):'Account type')+'</div></div><div class="rt-pd1505-money rt-pd1505-shimmer"></div><div class="rt-pd1505-chevron"></div></div>';}
    var el=document.createElement('div');el.className='rt-partners-dwell-shell1505';el.setAttribute('aria-hidden','true');el.innerHTML='<div class="rt-pd1505-head"><div><div class="rt-pd1505-title">Partners</div><div class="rt-pd1505-sub">Account operations · payments, stock and actions that need attention.</div></div><div class="rt-pd1505-add"></div></div><div class="rt-pd1505-strip"><span class="rt-pd1505-label">Outstanding</span><span class="rt-pd1505-total rt-pd1505-shimmer"></span><span></span></div><div class="rt-pd1505-search"></div><div class="rt-pd1505-rows">'+rows+'</div>';page.appendChild(el);return el;
  }

  function ready(page){
    if(!page||!page.classList.contains('on'))return false;
    var strip=page.querySelector('.rt-acct-compact-strip'),controls=page.querySelector('.rt-acct-op-controls.rt-acct-compact-controls'),rows=page.querySelectorAll('.rt-acct-op-row[data-account-id]');
    if(!strip||!controls)return false;if(list().length&&rows.length===0)return false;return true;
  }

  function armReveal(page){
    if(!page||!page.classList.contains('on'))return;
    var values=page.querySelectorAll('.rt-acct-compact-strip>strong,.rt-acct-op-money');
    Array.prototype.forEach.call(values,function(el,i){el.style.setProperty('--rt-pd-delay',Math.min(i*24,144)+'ms');});
    var rows=page.querySelectorAll('.rt-acct-op-row[data-account-id]');
    Array.prototype.forEach.call(rows,function(el,i){el.style.setProperty('--rt-pd-row-delay',Math.min(i*18,126)+'ms');});
    page.classList.add('rt-partners-reveal1506');
    setTimeout(function(){
      page.classList.remove('rt-partners-reveal1506');
      Array.prototype.forEach.call(values,function(el){el.style.removeProperty('--rt-pd-delay');});
      Array.prototype.forEach.call(rows,function(el){el.style.removeProperty('--rt-pd-row-delay');});
    },520);
  }

  function show(page){if(!page)return 0;var my=++token,start=Date.now();page.classList.remove('rt-partners-reveal1506');page.classList.add('rt-partners-dwell1505');shell(page);function tick(){if(my!==token)return;if(!page.classList.contains('on')){cleanup(false);return;}var elapsed=Date.now()-start;if(elapsed>=MIN_MS&&(ready(page)||elapsed>=MAX_MS)){requestAnimationFrame(function(){cleanup(true);});return;}requestAnimationFrame(tick);}function cleanup(reveal){if(my!==token)return;var s=page.querySelector('.rt-partners-dwell-shell1505');if(s)s.remove();page.classList.remove('rt-partners-dwell1505');if(reveal)armReveal(page);}requestAnimationFrame(tick);return my;}

  function install(){
    styles();var current=window.renderAccountsPage;if(typeof current==='function'&&!current.__rtDwell1506){function wrapped(){var page=document.getElementById('p-accounts');if(page)show(page);var r=current.apply(this,arguments);page=document.getElementById('p-accounts');if(page&&!page.querySelector('.rt-partners-dwell-shell1505'))show(page);return r;}wrapped.__rtDwell1506=true;wrapped.__rtBase=current;window.renderAccountsPage=wrapped;try{renderAccountsPage=wrapped;}catch(_){} }
    var page=document.getElementById('p-accounts');if(page&&page.classList.contains('on'))show(page);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  console.info('[RETRADE] v1.5.06 Partners minimum skeleton dwell + reveal loaded');
})();