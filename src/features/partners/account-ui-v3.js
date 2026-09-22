/* RETRADE partner account UI v1.4.68
 * Live Partner-account presentation layer.
 *
 * - pins Statement directly opposite Back to accounts in the top row;
 * - replaces ambiguous account KPIs with a clear RETRADE / partner position;
 * - restores a visible far-right row actions menu;
 * - reuses existing live row-specific partner actions rather than duplicating
 *   settlement / split accounting logic.
 */
(function(){
  'use strict';

  var activeAccountId=null;
  var enhanceQueued=false;
  var actionSeq=0;
  var actionRegistry=Object.create(null);

  function accountById(id){
    try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}
    catch(_){return null;}
  }

  function htmlEscape(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function money(value){
    try{if(typeof fmt==='function')return fmt(Number(value)||0);}catch(_){}
    return '£'+(Number(value)||0).toFixed(2);
  }

  function roundMoney(value){return Math.round((Number(value)||0)*100)/100;}
  function compactText(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}

  function findBackControl(page){
    if(!page)return null;
    var controls=page.querySelectorAll('button,a');
    for(var i=0;i<controls.length;i++){
      var el=controls[i];
      var text=compactText(el).toLowerCase();
      var meta=(text+' '+String(el.getAttribute('aria-label')||'')+' '+String(el.getAttribute('title')||'')).toLowerCase();
      if(text==='back to accounts'||text==='back to account'||text==='back to partners'||text==='back to partner')return el;
      if(/\bback\b/.test(meta)&&/\b(account|accounts|partner|partners)\b/.test(meta))return el;
    }
    return null;
  }

  function isAccountDetail(page){
    if(!page||!page.classList.contains('on'))return false;
    try{if(typeof _itemPageOrigin!=='undefined'&&_itemPageOrigin==='p-account-detail')return false;}catch(_){}
    return !!(findBackControl(page)||page.querySelector('.account-group'));
  }

  function accountItems(accountId){
    var out=[];
    try{
      (typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(month){
        var rows=(typeof DB!=='undefined'&&DB&&Array.isArray(DB[month]))?DB[month]:[];
        rows.forEach(function(item){
          if(item&&String(item.accountId)===String(accountId))out.push({item:item,month:month});
        });
      });
    }catch(_){}
    return out;
  }

  function accountDebt(item){
    if(!item||item.accountSettled===true)return 0;
    try{if(typeof _accountItemDebt==='function')return Math.max(0,Number(_accountItemDebt(item))||0);}catch(_){}
    try{if(typeof _accountItemOwed==='function')return Math.max(0,Number(_accountItemOwed(item))||0);}catch(_){}
    return 0;
  }

  function accountFromPage(page){
    var known=accountById(activeAccountId);if(known)return known;
    if(!page)return null;
    var tagged=page.querySelector('[data-account-id],[data-accountid]');
    if(tagged){
      var taggedId=tagged.getAttribute('data-account-id')||tagged.getAttribute('data-accountid');
      var taggedAcct=accountById(taggedId);if(taggedAcct)return taggedAcct;
    }
    var link=page.querySelector('.account-group [data-itemid][data-month]');
    if(link){
      try{
        var month=link.getAttribute('data-month'),itemId=link.getAttribute('data-itemid');
        var rows=(DB&&Array.isArray(DB[month]))?DB[month]:[];
        var item=rows.find(function(x){return x&&String(x.id)===String(itemId);});
        if(item&&item.accountId!=null)return accountById(item.accountId);
      }catch(_){}
    }
    return null;
  }

  function installStyles(){
    if(document.getElementById('rt-partner-account-v3-style'))return;
    var style=document.createElement('style');
    style.id='rt-partner-account-v3-style';
    style.textContent='\
      .rt-partner-v3-toprow{display:flex!important;align-items:center!important;gap:10px!important;width:100%;}\
      .rt-partner-v3-toprow>.rt-partner-statement-btn{margin-left:auto!important;flex:0 0 auto!important;}\
      .rt-partner-summary-v3{margin:0 0 14px;}\
      .rt-partner-summary-v3-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 0 8px;}\
      .rt-partner-summary-v3-title{font-size:12px;font-weight:800;letter-spacing:.02em;color:var(--text);}\
      .rt-partner-summary-v3-note{font-size:10.5px;color:var(--text-secondary);text-align:right;}\
      .rt-partner-summary-v3-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}\
      .rt-partner-summary-v3-card{min-width:0;border:1px solid var(--border);border-radius:12px;background:var(--surface);padding:11px 12px;}\
      .rt-partner-summary-v3-card[data-kind="outstanding"]{border-color:var(--accent);background:var(--surface2);}\
      .rt-partner-summary-v3-label{font-size:10.5px;font-weight:700;color:var(--text-secondary);line-height:1.2;margin-bottom:5px;}\
      .rt-partner-summary-v3-value{font-size:19px;font-weight:850;line-height:1.05;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\
      .rt-partner-summary-v3-card[data-kind="outstanding"] .rt-partner-summary-v3-value{color:var(--accent);}\
      .rt-partner-summary-v3-sub{font-size:9.8px;line-height:1.25;color:var(--text-secondary);margin-top:5px;min-height:25px;}\
      .rt-partner-v3-legacy-kpi{display:none!important;}\
      .account-group .metric-inline.rt-partner-v3-row{position:relative!important;padding-right:48px!important;overflow:visible!important;}\
      .rt-partner-row-menu-v3{position:absolute!important;right:6px!important;top:50%!important;transform:translateY(-50%)!important;width:34px!important;height:34px!important;min-width:34px!important;padding:0!important;margin:0!important;border:0!important;border-radius:9px!important;background:transparent!important;color:var(--text-secondary)!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:22px!important;font-weight:800!important;line-height:1!important;z-index:4!important;cursor:pointer!important;}\
      .rt-partner-row-menu-v3:hover,.rt-partner-row-menu-v3:focus{background:var(--surface2)!important;color:var(--text)!important;outline:none;}\
      .rt-partner-v3-original-action{display:none!important;}\
      .rt-partner-v3-menu-list{display:flex;flex-direction:column;gap:6px;}\
      .rt-partner-v3-menu-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;}\
      .rt-partner-v3-menu-btn.danger{color:var(--danger,#c33);}\
      .rt-partner-v3-menu-section{font-size:9.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--text-secondary);padding:8px 2px 2px;}\
      @media(max-width:760px){.rt-partner-summary-v3-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.rt-partner-summary-v3-value{font-size:18px;}}\
      @media(max-width:420px){.rt-partner-summary-v3-card{padding:10px}.rt-partner-summary-v3-note{display:none}}\
    ';
    document.head.appendChild(style);
  }

  function pinStatement(page){
    var back=findBackControl(page);if(!back)return;
    var host=back.parentElement;if(!host)return;
    host.classList.add('rt-partner-v3-toprow');
    var btn=page.querySelector('.rt-partner-statement-btn');
    if(btn){
      if(btn.parentElement!==host)host.appendChild(btn);
      btn.style.marginLeft='auto';
    }
    page.querySelectorAll('.rt-partner-statement-fallback').forEach(function(el){if(!el.children.length)el.remove();});
  }

  function parsePounds(text){
    var m=String(text||'').match(/£\s*(-?\d[\d,]*(?:\.\d{1,2})?)/);
    if(!m)return null;
    var n=Number(m[1].replace(/,/g,''));return isFinite(n)?n:null;
  }

  function isBeforeAnchor(anchor,el){
    if(!anchor||!el)return true;
    return !!(el.compareDocumentPosition(anchor)&Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function legacyMetric(page,anchor,re){
    var candidates=page.querySelectorAll('.kpi-card,.stat-card,.metric-card,.summary-card,.kpi,.stat,.metric,.card,[class*="kpi"],[class*="summary"]');
    var best=null,bestLen=Infinity;
    for(var i=0;i<candidates.length;i++){
      var el=candidates[i];
      if(!isBeforeAnchor(anchor,el))continue;
      if(el.closest('.account-group,.rt-partner-summary-v3,.rt-partner-v2-toolbar,.rt-partner-v2-selection'))continue;
      var txt=compactText(el);if(!re.test(txt)||txt.length>360)continue;
      var value=parsePounds(txt);if(value==null)continue;
      if(txt.length<bestLen){best={value:value,text:txt,el:el};bestLen=txt.length;}
    }
    return best;
  }

  function captureLegacyPosition(page,anchor){
    return {
      remaining:legacyMetric(page,anchor,/\b(remaining|still possible|potential remaining|future profit)\b/i),
      lifetime:legacyMetric(page,anchor,/\b(expected|estimated|projected|potential)\b[^£]{0,60}\b(profit|earnings?)\b|\b(profit|earnings?)\b[^£]{0,60}\b(expected|estimated|projected|potential)\b/i)
    };
  }

  function hideLegacyKpis(page,anchor){
    var selectors='.kpi-card,.stat-card,.metric-card,.summary-card,.kpi,.stat,[class*="kpi-card"],[class*="stat-card"],[class*="summary-card"]';
    page.querySelectorAll(selectors).forEach(function(el){
      if(!isBeforeAnchor(anchor,el))return;
      if(el.closest('.account-group,.rt-partner-summary-v3,.rt-partner-v2-toolbar,.rt-partner-v2-selection'))return;
      var txt=compactText(el);
      if(!/£\s*[-\d]/.test(txt))return;
      if(!/(profit|earned|earning|outstanding|owed|paid|potential|expected|projected|settled|revenue|value)/i.test(txt))return;
      if(/back to|statement/i.test(txt))return;
      el.classList.add('rt-partner-v3-legacy-kpi');
    });
    page.querySelectorAll('div').forEach(function(el){
      if(!isBeforeAnchor(anchor,el)||el.closest('.account-group')||el.classList.contains('rt-partner-summary-v3'))return;
      var kids=Array.prototype.slice.call(el.children||[]);
      if(kids.length<2||kids.length>8)return;
      var hidden=kids.filter(function(k){return k.classList&&k.classList.contains('rt-partner-v3-legacy-kpi');}).length;
      if(hidden>=2&&hidden===kids.length)el.classList.add('rt-partner-v3-legacy-kpi');
    });
  }

  function realizedRetradeProfit(acct){
    var total=0;
    try{
      if(typeof getSaleEventsInRange!=='function'||typeof _saleBreakdown!=='function')return null;
      getSaleEventsInRange(null,null).forEach(function(ev){
        if(!ev||!ev.item||String(ev.item.accountId)!==String(acct.id))return;
        var b=_saleBreakdown(ev);total+=Number(b&&b.netProfit)||0;
      });
      return roundMoney(total);
    }catch(_){return null;}
  }

  function positionData(acct,legacy){
    var items=accountItems(acct.id);
    var outstanding=roundMoney(items.reduce(function(sum,e){return sum+accountDebt(e.item);},0));
    var unpaidCount=items.filter(function(e){return accountDebt(e.item)>0;}).length;
    var paid=0,paidCount=0;
    (acct.settlements||[]).forEach(function(tx){
      if(!tx||tx.paid!==true)return;
      paid+=Number(tx.partnerAmount)||0;paidCount++;
    });
    paid=roundMoney(paid);
    var earned=realizedRetradeProfit(acct);
    var remaining=null,remainingNote='No reliable unsold-profit estimate available';
    if(legacy&&legacy.remaining){
      remaining=roundMoney(Math.max(0,legacy.remaining.value));
      remainingNote='Estimated RETRADE profit still available';
    }else if(legacy&&legacy.lifetime&&earned!=null){
      remaining=roundMoney(Math.max(0,legacy.lifetime.value-earned));
      remainingNote='Expected lifetime profit less profit already earned';
    }
    return {earned:earned,remaining:remaining,remainingNote:remainingNote,outstanding:outstanding,unpaidCount:unpaidCount,paid:paid,paidCount:paidCount};
  }

  function summaryCard(label,value,sub,kind){
    return '<div class="rt-partner-summary-v3-card" data-kind="'+htmlEscape(kind||'')+'">'+
      '<div class="rt-partner-summary-v3-label">'+htmlEscape(label)+'</div>'+
      '<div class="rt-partner-summary-v3-value">'+(value==null?'—':htmlEscape(money(value)))+'</div>'+
      '<div class="rt-partner-summary-v3-sub">'+htmlEscape(sub)+'</div></div>';
  }

  function buildSummary(page,acct,anchor,legacy){
    var old=page.querySelector('.rt-partner-summary-v3');if(old)old.remove();
    var p=positionData(acct,legacy);
    var wrap=document.createElement('section');
    wrap.className='rt-partner-summary-v3';
    wrap.setAttribute('aria-label','Partner account position');
    wrap.innerHTML='<div class="rt-partner-summary-v3-head"><div class="rt-partner-summary-v3-title">Account position</div><div class="rt-partner-summary-v3-note">RETRADE earnings and partner payments</div></div><div class="rt-partner-summary-v3-grid">'+
      summaryCard('RETRADE earned',p.earned,'Realised profit after partner share and sale costs','earned')+
      summaryCard('Potential remaining',p.remaining,p.remainingNote,'potential')+
      summaryCard('Partner outstanding',p.outstanding,p.unpaidCount+' unpaid item'+(p.unpaidCount===1?'':'s')+' currently due','outstanding')+
      summaryCard('Paid to partner',p.paid,p.paidCount+' completed payment'+(p.paidCount===1?'':'s')+' recorded','paid')+
      '</div>';
    anchor.parentNode.insertBefore(wrap,anchor);
  }

  function rowIdentity(row){
    var el=row.querySelector('[data-itemid][data-month]');
    if(!el)return null;
    var itemId=el.getAttribute('data-itemid'),month=el.getAttribute('data-month');
    return itemId&&month?{itemId:itemId,month:month}:null;
  }

  function owningItem(month,itemId){
    try{
      var rows=(DB&&Array.isArray(DB[month]))?DB[month]:[];
      return rows.find(function(x){return x&&String(x.id)===String(itemId);})||null;
    }catch(_){return null;}
  }

  function actionLabel(el){
    var text=compactText(el),aria=String(el.getAttribute('aria-label')||'').trim(),title=String(el.getAttribute('title')||'').trim();
    var label=text||aria||title;
    if(/^[⋯…\.]+$/.test(label)||/^(more|actions|more actions|item actions)$/i.test(label))return 'Partner actions';
    return label||'Partner action';
  }

  function captureOriginalActions(row){
    var found=[];
    row.querySelectorAll('button,a').forEach(function(el){
      if(el.classList.contains('rt-partner-row-menu-v3')||el.closest('.rt-partner-v2-selection'))return;
      var label=actionLabel(el),lower=label.toLowerCase();
      var href=String(el.getAttribute('href')||'');
      if(href&&href!=='#'&&!/^javascript:/i.test(href))return;
      if(lower==='select'||lower==='view'||lower==='edit'||lower==='delete'||lower==='duplicate'||lower==='dispose')return;
      var token=el.getAttribute('data-rt-v3-action-token');
      if(!token){token='pa_'+(++actionSeq);el.setAttribute('data-rt-v3-action-token',token);}
      el.classList.add('rt-partner-v3-original-action');
      actionRegistry[token]={element:el,label:label};
      found.push({token:token,label:label});
    });
    var seen=Object.create(null),dedup=[];
    found.forEach(function(a){var key=a.label.toLowerCase();if(!seen[key]){seen[key]=true;dedup.push(a);}});
    var meaningful=dedup.filter(function(a){return a.label!=='Partner actions';});
    return meaningful.length?meaningful:dedup;
  }

  function quoteArg(value){return String(value==null?'':value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
  function menuButton(label,action,danger){
    return '<button type="button" class="btn btn-secondary rt-partner-v3-menu-btn'+(danger?' danger':'')+'" onclick="'+action+'"><span>'+htmlEscape(label)+'</span><span aria-hidden="true">›</span></button>';
  }

  function openRowMenu(acct,month,itemId,partnerActions){
    var item=owningItem(month,itemId);if(!item){try{toast('Item not found','error');}catch(_){}return;}
    var m=quoteArg(month),id=quoteArg(itemId),aid=quoteArg(acct.id);
    var body='<div class="rt-partner-v3-menu-list">';
    if(partnerActions.length){
      body+='<div class="rt-partner-v3-menu-section">Partner</div>';
      partnerActions.forEach(function(a){body+=menuButton(a.label,"_rtPartnerV3RunOriginal('"+quoteArg(a.token)+"')",false);});
    }
    body+='<div class="rt-partner-v3-menu-section">Item</div>';
    body+=menuButton('View',"_rtPartnerV3Standard('view','"+m+"','"+id+"','"+aid+"')",false);
    if(typeof editItem==='function')body+=menuButton('Edit',"_rtPartnerV3Standard('edit','"+m+"','"+id+"','"+aid+"')",false);
    if(typeof confirmDupeItem==='function')body+=menuButton('Duplicate',"_rtPartnerV3Standard('duplicate','"+m+"','"+id+"','"+aid+"')",false);
    if(typeof openScrapModal==='function')body+=menuButton('Dispose',"_rtPartnerV3Standard('dispose','"+m+"','"+id+"','"+aid+"')",false);
    if(typeof deleteItem==='function')body+=menuButton('Delete',"_rtPartnerV3Standard('delete','"+m+"','"+id+"','"+aid+"')",true);
    body+='</div>';
    try{openPanel(htmlEscape(item.item||'Item')+' · Actions',body);}catch(err){console.warn('[RETRADE] partner row menu failed',err);}
  }

  window._rtPartnerV3RunOriginal=function(token){
    var rec=actionRegistry[token];if(!rec||!rec.element)return;
    var el=rec.element;
    try{if(typeof closePanel==='function')closePanel();}catch(_){}
    setTimeout(function(){try{el.click();}catch(err){console.warn('[RETRADE] partner action failed',err);}},0);
  };

  window._rtPartnerV3Standard=function(action,month,itemId,accountId){
    try{if(typeof closePanel==='function')closePanel();}catch(_){}
    setTimeout(function(){
      try{
        if(action==='view'){
          if(typeof window.openAccountItemPage==='function')window.openAccountItemPage(month,itemId,accountId);
          else if(typeof renderItemPage==='function')renderItemPage(month,itemId);
        }else if(action==='edit'&&typeof editItem==='function')editItem(month,itemId);
        else if(action==='duplicate'&&typeof confirmDupeItem==='function')confirmDupeItem(month,itemId);
        else if(action==='dispose'&&typeof openScrapModal==='function')openScrapModal(month,itemId);
        else if(action==='delete'&&typeof deleteItem==='function')deleteItem(month,itemId);
      }catch(err){console.warn('[RETRADE] partner standard item action failed',err);}
    },0);
  };

  function wireRowMenus(page,acct){
    var selecting=false;try{selecting=!!_acctSelectMode;}catch(_){}
    page.querySelectorAll('.account-group .metric-inline').forEach(function(row){
      var group=row.closest('.account-group');
      var groupTitle=compactText(group&&group.querySelector('.account-group-title')).toLowerCase();
      if(groupTitle.indexOf('settlement')!==-1)return;
      var identity=rowIdentity(row);if(!identity)return;
      var old=row.querySelector('.rt-partner-row-menu-v3');if(old)old.remove();
      row.classList.remove('rt-partner-v3-row');
      if(selecting)return;
      var partnerActions=captureOriginalActions(row);
      row.classList.add('rt-partner-v3-row');
      var btn=document.createElement('button');
      btn.type='button';btn.className='rt-partner-row-menu-v3';
      btn.setAttribute('aria-label','Item actions');btn.setAttribute('title','Item actions');btn.innerHTML='&#8943;';
      btn.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();openRowMenu(acct,identity.month,identity.itemId,partnerActions);});
      row.appendChild(btn);
    });
  }

  function enhance(acct){
    enhanceQueued=false;
    var page=document.getElementById('p-item');
    if(!acct||!isAccountDetail(page))return;
    activeAccountId=acct.id;
    installStyles();
    pinStatement(page);
    var anchor=page.querySelector('.rt-partner-v2-toolbar')||page.querySelector('.account-group');
    if(anchor){
      var legacy=captureLegacyPosition(page,anchor);
      hideLegacyKpis(page,anchor);
      buildSummary(page,acct,anchor,legacy);
    }
    wireRowMenus(page,acct);
  }

  function scheduleEnhance(acct){
    if(acct&&acct.id!=null)activeAccountId=acct.id;
    if(enhanceQueued)return;
    enhanceQueued=true;
    requestAnimationFrame(function(){
      var resolved=(acct&&acct.id!=null)?acct:accountFromPage(document.getElementById('p-item'));
      enhance(resolved);
    });
  }

  if(typeof _renderAccountPage==='function'){
    var baseRenderAccountPage=_renderAccountPage;
    _renderAccountPage=function(acct){
      if(acct&&acct.id!=null)activeAccountId=acct.id;
      var result=baseRenderAccountPage.apply(this,arguments);
      scheduleEnhance(acct);
      return result;
    };
  }

  installStyles();
  scheduleEnhance();
  console.info('[RETRADE] v1.4.68 partner account position + row actions loaded');
})();