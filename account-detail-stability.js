/* RETRADE account detail stability / empty states v1.0.0
 *
 * Account groups used to re-render the entire account page just to open or close
 * one collapsible. That made every row, button and scroll anchor briefly become
 * a new DOM node. This layer keeps the renderer's persisted group-state model,
 * but applies the visible collapse locally to the existing DOM.
 *
 * It also makes zero-data groups explicit and keeps Payments & adjustments
 * visible even before the first transaction, so an empty section is informative
 * rather than looking broken.
 */
(function(){
  'use strict';

  var GROUPS={
    sales:{match:/^sales$/i,label:'Sales',empty:'No sales yet'},
    settlements:{match:/^(settlement history|payment history|payments\s*&\s*adjustments)$/i,label:'Payments & adjustments',empty:'No payments or adjustments yet'},
    listed:{match:/^listed stock$/i,label:'Listed stock',empty:'No listed items'},
    unlisted:{match:/^unlisted/i,label:'Unlisted · needs listing',empty:'No unlisted items'},
    returned:{match:/^return/i,label:'Returned · action needed',empty:'No returned items'}
  };

  function page(){return document.getElementById('p-item');}
  function titleOf(group){
    var t=group&&group.querySelector('.account-group-title');
    return String(t&&t.textContent||'').replace(/\s+/g,' ').trim();
  }
  function keyForGroup(group){
    var existing=group&&group.getAttribute('data-rt-account-key');
    if(existing&&GROUPS[existing])return existing;
    var title=titleOf(group),key='';
    Object.keys(GROUPS).some(function(k){if(GROUPS[k].match.test(title)){key=k;return true;}return false;});
    if(key&&group)group.setAttribute('data-rt-account-key',key);
    return key;
  }
  function findGroup(key){
    var p=page();if(!p)return null;
    var tagged=p.querySelector('.account-group[data-rt-account-key="'+key+'"]');
    if(tagged)return tagged;
    var found=null;
    Array.prototype.some.call(p.querySelectorAll('.account-group'),function(group){
      if(keyForGroup(group)===key){found=group;return true;}return false;
    });
    return found;
  }
  function countOf(group){
    var el=group&&group.querySelector('.account-group-count');
    var n=Number(String(el&&el.textContent||'').trim());
    return isFinite(n)?n:0;
  }
  function setCollapsed(group,collapsed){
    if(!group)return false;
    group.classList.toggle('collapsed',!!collapsed);
    var head=group.querySelector('.account-group-head');
    if(head)head.setAttribute('aria-expanded',collapsed?'false':'true');
    return true;
  }
  function emptyNode(message){
    var d=document.createElement('div');
    d.className='rt-account-empty-state';
    d.setAttribute('role','status');
    d.textContent=message;
    return d;
  }
  function ensureEmpty(group,key){
    if(!group||!GROUPS[key]||countOf(group)!==0)return;
    var body=group.querySelector('.account-group-body');if(!body)return;
    // A zero-count operational group has no actionable rows. Replacing whatever
    // legacy placeholder it contained is safe and gives every section one clear,
    // consistent empty-state treatment.
    body.innerHTML='';
    body.appendChild(emptyNode(GROUPS[key].empty));
  }

  function buildEmptySettlements(accountId){
    var wrap=document.createElement('div');
    wrap.className='panel-card account-group';
    wrap.setAttribute('data-rt-account-key','settlements');
    wrap.style.marginBottom='14px';
    var head=document.createElement('button');
    head.type='button';head.className='account-group-head';head.setAttribute('aria-expanded','true');
    head.innerHTML='<span class="account-group-title">Payments &amp; adjustments</span>'+
      '<span class="account-group-meta"><span class="account-group-count">0</span>'+
      '<span class="account-group-chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span></span>';
    head.addEventListener('click',function(){
      var collapsed=!wrap.classList.contains('collapsed');
      try{
        if(typeof _accountGroupState!=='undefined')_accountGroupState[String(accountId||'')+':settlements']=collapsed;
      }catch(_){}
      setCollapsed(wrap,collapsed);
    });
    var body=document.createElement('div');body.className='account-group-body';body.appendChild(emptyNode(GROUPS.settlements.empty));
    wrap.appendChild(head);wrap.appendChild(body);
    return wrap;
  }

  function decorateAccount(acct){
    var p=page();if(!p||!acct)return;
    var groups=Array.prototype.slice.call(p.querySelectorAll('.account-group'));
    groups.forEach(function(group){
      var key=keyForGroup(group);if(!key)return;
      var title=group.querySelector('.account-group-title');
      if(key==='settlements'&&title)title.textContent=GROUPS.settlements.label;
      ensureEmpty(group,key);
    });

    // Core historically omits settlement history entirely when there are no
    // transactions. Keep the section present so users know where future payments
    // and adjustments will live.
    if(!findGroup('settlements')){
      var sales=findGroup('sales');
      var empty=buildEmptySettlements(acct.id);
      if(sales&&sales.parentNode)sales.parentNode.insertBefore(empty,sales.nextSibling);
      else{
        var first=groups[0];
        if(first&&first.parentNode)first.parentNode.insertBefore(empty,first);
      }
    }
  }

  // Opening/closing a group is a local state change, not navigation. Preserve the
  // core state map so a later genuine account re-render keeps the same choice,
  // but never call _renderAccountPage merely to flip one class.
  try{
    if(typeof _toggleAccountGroup==='function'){
      var nativeToggle=_toggleAccountGroup;
      _toggleAccountGroup=function(accountId,key,defaultCollapsed){
        try{
          var current=(typeof _accountGroupIsCollapsed==='function')
            ?_accountGroupIsCollapsed(accountId,key,defaultCollapsed)
            :!!(findGroup(key)&&findGroup(key).classList.contains('collapsed'));
          var next=!current;
          if(typeof _accountGroupState!=='undefined')_accountGroupState[String(accountId||'')+':'+String(key||'')]=next;
          var group=findGroup(key);
          if(group){setCollapsed(group,next);return;}
        }catch(err){console.warn('[RETRADE] local account group toggle fallback',err);}
        return nativeToggle.apply(this,arguments);
      };
    }
  }catch(_){}

  try{
    if(typeof _renderAccountPage==='function'){
      var nativeRender=_renderAccountPage;
      _renderAccountPage=function(acct){
        var out=nativeRender.apply(this,arguments);
        try{decorateAccount(acct);}catch(err){console.warn('[RETRADE] account empty-state polish failed',err);}
        return out;
      };
    }
  }catch(_){}

  var style=document.createElement('style');style.id='rt-account-detail-stability-css';
  style.textContent=[
    '.rt .rt-account-empty-state{padding:18px 4px 4px;text-align:center;color:var(--text-tertiary);font-size:12px;line-height:18px;}',
    '.rt .account-group-body>.rt-account-empty-state:first-child{padding-top:16px;}',
    // Keep deliberate collapsible motion short and local. Nothing else on the
    // account page is re-rendered or animated when a group changes state.
    '.rt .account-group{transition:grid-template-rows 150ms var(--ease-out)!important;}',
    '.rt .account-group-body{transition:opacity 105ms ease-out,padding-bottom 150ms var(--ease-out),border-color 105ms ease-out!important;}'
  ].join('\n');
  document.head.appendChild(style);

  console.info('[RETRADE] account detail stability v1.0.0 loaded');
})();
