/* RETRADE Accounts sort control polish v1.4.82
 * Keeps the account-management dashboard distinct in content while restoring
 * RETRADE's familiar pill/dropdown control language for sorting.
 */
(function(){
  'use strict';
  if(window.__rtAccountsSortPolish1482)return;
  window.__rtAccountsSortPolish1482=true;

  var queued=false;
  var LABELS={attention:'Priority',owed:'Amount due',recent:'Recent activity',name:'Name',stock:'Stock on hand'};

  function currentValue(select){
    return select&&select.value&&LABELS[select.value]?select.value:'attention';
  }
  function sortIcon(){
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h10M8 12h7M8 18h4"/><path d="M4 5v14"/><path d="M2 17l2 2 2-2"/></svg>';
  }
  function patch(){
    queued=false;
    var page=document.getElementById('p-accounts');
    if(!page||!page.classList.contains('on'))return;
    var controls=page.querySelector('.rt-acct-op-controls');
    if(!controls)return;
    if(controls.querySelector('.rt-acct-op-sort-dd'))return;

    var select=controls.querySelector('select[aria-label="Sort accounts"]');
    if(!select)return;
    var value=currentValue(select);

    var wrap=document.createElement('div');
    wrap.className='filter-pill-dd rt-acct-op-sort-dd';
    wrap.id='rt-acct-op-sort';
    wrap.innerHTML=''
      +'<div class="filter-pill-dd-backdrop" onclick="closeFilterPill(\'rt-acct-op-sort\')"></div>'
      +'<button class="filter-pill-dd-btn rt-acct-op-sort-btn" type="button" aria-label="Sort accounts" onclick="event.stopPropagation();toggleFilterPill(\'rt-acct-op-sort\')">'
        +'<span class="fpdd-label">'+sortIcon()+'<span class="rt-acct-op-sort-prefix">Sort</span><span class="rt-acct-op-sort-current">'+LABELS[value]+'</span></span>'
        +'<span class="fpdd-chev">▾</span>'
      +'</button>'
      +'<div class="filter-pill-dd-menu rt-acct-op-sort-menu" onclick="event.stopPropagation()">'
        +Object.keys(LABELS).map(function(k){
          return '<button class="filter-pill-dd-opt'+(k===value?' active':'')+'" type="button" onclick="_rtAcctOpSort(\''+k+'\');closeFilterPill(\'rt-acct-op-sort\')">'
            +'<span class="rt-acct-op-sort-check">'+(k===value?'✓':'')+'</span>'+LABELS[k]
          +'</button>';
        }).join('')
      +'</div>';
    select.replaceWith(wrap);
  }
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(function(){requestAnimationFrame(patch);});
  }
  function installStyles(){
    if(document.getElementById('rt-accounts-sort-polish-style'))return;
    var s=document.createElement('style');
    s.id='rt-accounts-sort-polish-style';
    s.textContent='\
      .rt-acct-op-sort-dd{min-width:174px}.rt-acct-op-sort-btn{min-height:40px;height:100%;display:flex!important;align-items:center;justify-content:space-between;gap:10px}.rt-acct-op-sort-btn .fpdd-label{display:flex;align-items:center;gap:7px;min-width:0}.rt-acct-op-sort-prefix{font-weight:650;color:var(--text-secondary)}.rt-acct-op-sort-current{font-weight:700;color:var(--text);white-space:nowrap}.rt-acct-op-sort-menu{min-width:205px;right:0;left:auto}.rt-acct-op-sort-check{display:inline-flex;width:17px;justify-content:center;margin-right:6px;color:var(--accent);font-weight:800}.rt-acct-op-sort-dd .filter-pill-dd-opt{display:flex;align-items:center}.rt-acct-op-sort-dd .filter-pill-dd-opt.active{font-weight:750}\
      @media(max-width:760px){.rt-acct-op-sort-dd{min-width:0}.rt-acct-op-sort-current{display:none}.rt-acct-op-sort-prefix{color:var(--text);font-weight:700}.rt-acct-op-sort-btn{padding-left:11px;padding-right:11px}.rt-acct-op-sort-menu{min-width:200px}}\
    ';
    document.head.appendChild(s);
  }
  function start(){
    installStyles();
    var page=document.getElementById('p-accounts');
    if(page)new MutationObserver(schedule).observe(page,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('click',function(){schedule();},true);
    schedule();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  console.info('[RETRADE] v1.4.82 Accounts RETRADE-style sort control loaded');
})();