/* RETRADE Partners list transition guard — v1.5.04
 * Prevents the core/legacy accounts page from painting before the compact
 * Partners presentation has finished its enhancement pass.
 * Presentation only: no account, item, settlement or cashflow data is changed.
 */
(function(){
  'use strict';
  if(window.__rtPartnersListTransition1504)return;
  window.__rtPartnersListTransition1504=true;

  var token=0;

  function norm(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function accounts(){try{return Array.isArray(_accounts)?_accounts:[];}catch(_){return [];}}
  function arrangement(a){try{if(typeof _rtArrangementForAccount==='function')return _rtArrangementForAccount(a);}catch(_){}return String(a&&a.accountType||'supplier').toLowerCase()==='supplier'?'fixed_cost':'profit_share';}
  function timing(a){try{if(typeof _rtPartnerPaymentTiming==='function')return _rtPartnerPaymentTiming(a);}catch(_){}var v=String(a&&a.paymentTiming||a&&a.paymentTerms||'upfront').toLowerCase();return v==='on_sale'?'on_sale':'upfront';}
  function label(a){return arrangement(a)==='fixed_cost'?('Fixed cost · '+(timing(a)==='on_sale'?'After sale':'Upfront')):'Profit share';}

  function installStyles(){
    if(document.getElementById('rt-partners-list-transition-1504-style'))return;
    var s=document.createElement('style');s.id='rt-partners-list-transition-1504-style';
    s.textContent='\
      #p-accounts.rt-partners-preparing1504{position:relative;min-height:70vh;}\
      #p-accounts.rt-partners-preparing1504> *:not(.rt-partners-shell1504){visibility:hidden!important;}\
      #p-accounts.rt-partners-preparing1504>.rt-partners-shell1504{visibility:visible!important;}\
      #p-accounts .rt-partners-shell1504{position:absolute;inset:0;z-index:4;background:var(--bg);padding:0 0 28px;box-sizing:border-box;}\
      #p-accounts .rt-pls1504-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin:0 0 22px;}\
      #p-accounts .rt-pls1504-title{font-size:clamp(28px,3.2vw,42px);line-height:1.05;letter-spacing:-.035em;font-weight:800;}\
      #p-accounts .rt-pls1504-sub{margin-top:7px;color:var(--text-secondary);font-size:13px;}\
      #p-accounts .rt-pls1504-add{width:126px;height:42px;border-radius:10px;border:1px solid var(--border);background:var(--surface2);flex:0 0 auto;}\
      #p-accounts .rt-pls1504-strip{display:grid;grid-template-columns:minmax(0,1fr) minmax(128px,auto) 18px;gap:16px;align-items:center;min-height:58px;padding:11px 16px;margin:0 0 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);box-sizing:border-box;}\
      #p-accounts .rt-pls1504-strip-label{font-size:12px;color:var(--text-secondary);}\
      #p-accounts .rt-pls1504-shimmer{position:relative;overflow:hidden;background:var(--surface);border-radius:999px;}\
      #p-accounts .rt-pls1504-shimmer:after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,color-mix(in srgb,var(--text) 7%,transparent) 45%,transparent 70%);transform:translateX(-100%);animation:rt-pls1504 1.15s ease-in-out infinite;}\
      #p-accounts .rt-pls1504-total{grid-column:2;width:92px;height:24px;justify-self:end;}\
      #p-accounts .rt-pls1504-search{height:52px;border:1px solid var(--border);border-radius:12px;background:var(--surface);margin:0 0 14px;}\
      #p-accounts .rt-pls1504-rows{display:grid;gap:10px;}\
      #p-accounts .rt-pls1504-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(128px,auto) 18px;gap:16px;align-items:center;min-height:92px;padding:14px 16px;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-sizing:border-box;}\
      #p-accounts .rt-pls1504-name{font-size:15px;font-weight:760;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\
      #p-accounts .rt-pls1504-meta{font-size:11px;color:var(--text-secondary);margin-top:9px;}\
      #p-accounts .rt-pls1504-money{width:86px;height:18px;justify-self:end;}\
      #p-accounts .rt-pls1504-chevron{width:9px;height:14px;border-right:2px solid var(--text-secondary);border-top:2px solid var(--text-secondary);transform:rotate(45deg);justify-self:center;opacity:.6;}\
      @keyframes rt-pls1504{to{transform:translateX(100%)}}\
      @media(max-width:760px){#p-accounts .rt-pls1504-strip,#p-accounts .rt-pls1504-row{grid-template-columns:minmax(0,1fr) minmax(108px,auto) 14px;gap:12px;}#p-accounts .rt-pls1504-total{width:78px}}\
      @media(max-width:560px){#p-accounts .rt-pls1504-head{margin-bottom:18px}#p-accounts .rt-pls1504-title{font-size:29px}#p-accounts .rt-pls1504-sub{font-size:11px;line-height:1.35}#p-accounts .rt-pls1504-add{width:96px;height:40px}#p-accounts .rt-pls1504-row{min-height:82px;padding:13px}#p-accounts .rt-pls1504-search{height:46px}}\
      @media(prefers-reduced-motion:reduce){#p-accounts .rt-pls1504-shimmer:after{animation:none!important}}\
    ';
    document.head.appendChild(s);
  }

  function makeShell(page){
    var old=page.querySelector('.rt-partners-shell1504');if(old)old.remove();
    var list=accounts(),count=Math.max(3,Math.min(7,list.length||5));
    var rows='';
    for(var i=0;i<count;i++){
      var a=list[i]||null;
      rows+='<div class="rt-pls1504-row">'
        +'<div><div class="rt-pls1504-name">'+esc(a&&a.name||'Partner account')+'</div><div class="rt-pls1504-meta">'+esc(a?label(a):'Account type')+'</div></div>'
        +'<div class="rt-pls1504-money rt-pls1504-shimmer"></div><div class="rt-pls1504-chevron"></div>'
      +'</div>';
    }
    var shell=document.createElement('div');shell.className='rt-partners-shell1504';shell.setAttribute('aria-hidden','true');
    shell.innerHTML='<div class="rt-pls1504-head"><div><div class="rt-pls1504-title">Partners</div><div class="rt-pls1504-sub">Account operations · payments, stock and actions that need attention.</div></div><div class="rt-pls1504-add"></div></div>'
      +'<div class="rt-pls1504-strip"><span class="rt-pls1504-strip-label">Outstanding</span><span class="rt-pls1504-total rt-pls1504-shimmer"></span><span></span></div>'
      +'<div class="rt-pls1504-search"></div><div class="rt-pls1504-rows">'+rows+'</div>';
    page.appendChild(shell);
    return shell;
  }

  function compactReady(page){
    if(!page||!page.classList.contains('on'))return false;
    var strip=page.querySelector('.rt-acct-compact-strip');
    var controls=page.querySelector('.rt-acct-op-controls.rt-acct-compact-controls');
    var list=page.querySelector('.rt-acct-op-list');
    if(!strip||!controls||!list)return false;
    var rows=Array.prototype.slice.call(list.querySelectorAll('.rt-acct-op-row[data-account-id]'));
    if(accounts().length&&rows.length===0)return false;
    for(var i=0;i<rows.length;i++){
      if(!rows[i].querySelector('.rt-acct-snapshot-name')||!rows[i].querySelector('.rt-acct-op-money'))return false;
    }
    return true;
  }

  function finalTidy(page){
    try{
      page.querySelectorAll('.rt-acct-op-row[data-account-id]').forEach(function(row){
        var id=row.getAttribute('data-account-id'),a=accounts().find(function(x){return x&&String(x.id)===String(id);});
        if(!a||arrangement(a)!=='profit_share')return;
        var term=row.querySelector('.rt-acct-snapshot-term');if(term)term.textContent='';
      });
    }catch(_){}
  }

  function revealWhenReady(page,myToken,start){
    if(myToken!==token||!page)return;
    if(!page.classList.contains('on')){page.classList.remove('rt-partners-preparing1504');var gone=page.querySelector('.rt-partners-shell1504');if(gone)gone.remove();return;}
    if(compactReady(page)){
      finalTidy(page);
      requestAnimationFrame(function(){
        if(myToken!==token)return;
        var shell=page.querySelector('.rt-partners-shell1504');if(shell)shell.remove();
        page.classList.remove('rt-partners-preparing1504');
      });
      return;
    }
    if(Date.now()-start>1400){
      var shell2=page.querySelector('.rt-partners-shell1504');if(shell2)shell2.remove();
      page.classList.remove('rt-partners-preparing1504');
      return;
    }
    requestAnimationFrame(function(){revealWhenReady(page,myToken,start);});
  }

  function installRendererGuard(){
    var current=window.renderAccountsPage;
    if(typeof current!=='function'||current.__rtListTransition1504)return;
    var base=current;
    function wrapped(){
      var page=document.getElementById('p-accounts'),myToken=++token,start=Date.now();
      if(page)page.classList.add('rt-partners-preparing1504');
      var result=base.apply(this,arguments);
      page=document.getElementById('p-accounts');
      if(page){
        page.classList.add('rt-partners-preparing1504');
        makeShell(page);
        requestAnimationFrame(function(){revealWhenReady(page,myToken,start);});
      }
      return result;
    }
    wrapped.__rtListTransition1504=true;wrapped.__rtBase=base;
    window.renderAccountsPage=wrapped;try{renderAccountsPage=wrapped;}catch(_){}
  }

  function guardExistingPaint(){
    var page=document.getElementById('p-accounts');
    if(!page||!page.classList.contains('on')||compactReady(page))return;
    var myToken=++token,start=Date.now();page.classList.add('rt-partners-preparing1504');makeShell(page);requestAnimationFrame(function(){revealWhenReady(page,myToken,start);});
  }

  function start(){installStyles();installRendererGuard();guardExistingPaint();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.5.04 Partners list legacy-paint guard loaded');
})();