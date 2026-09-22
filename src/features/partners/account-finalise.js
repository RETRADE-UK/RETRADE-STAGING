/* RETRADE partner account finalise v1.4.91
 * Final authoritative Partner-account presentation pass.
 *
 * - removes legacy count-only supplier stock cards outside real stock groups;
 * - guarantees/classifies the four finance KPIs;
 * - exposes fixed-cost payment timing (Upfront / After sale) in account edit;
 * - stays scoped to the account surface instead of watching the whole app.
 *
 * No settlement, P&L or cashflow calculations are replaced here.
 */
(function(){
  'use strict';
  if(window.__rtPartnerAccountFinalise1491)return;
  window.__rtPartnerAccountFinalise1491=true;

  var queued=false,observer=null;

  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function money(v){
    v=Math.round((Number(v)||0)*100)/100;
    try{if(typeof fmt==='function')return fmt(v);}catch(_){}
    return '£'+v.toFixed(2);
  }
  function activePage(){var p=document.getElementById('p-item');return p&&p.classList.contains('on')?p:null;}
  function accountById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function accountFromPage(page){
    if(!page)return null;
    var tagged=page.querySelector('[data-account-id],[data-accountid]');
    if(tagged){var id=tagged.getAttribute('data-account-id')||tagged.getAttribute('data-accountid'),a=accountById(id);if(a)return a;}
    var link=page.querySelector('.account-group [data-itemid][data-month]');
    if(link){
      try{
        var month=link.getAttribute('data-month'),itemId=link.getAttribute('data-itemid');
        var rows=(typeof DB!=='undefined'&&DB&&Array.isArray(DB[month]))?DB[month]:[];
        var item=rows.find(function(x){return x&&String(x.id)===String(itemId);});
        if(item&&item.accountId!=null){var byItem=accountById(item.accountId);if(byItem)return byItem;}
      }catch(_){}
    }
    var h=page.querySelector('.page-title,h1,h2,h3'),name=text(h).toLowerCase();
    if(name){
      try{
        var matches=(_accounts||[]).filter(function(a){var n=String(a&&a.name||'').replace(/\s+/g,' ').trim().toLowerCase();return !!n&&(name===n||name.indexOf(n)!==-1||n.indexOf(name)!==-1);});
        if(matches.length===1)return matches[0];
      }catch(_){}
    }
    return null;
  }

  function removeLegacyCountCard(page){
    if(!page)return;
    var re=/\b\d+\s+listed\s*[·•]\s*\d+\s+unlisted(?:\s*[·•]\s*\d+\s+returned)?\b/i;
    var candidates=page.querySelectorAll('div,section,article'),best=null,bestLen=Infinity;
    for(var i=0;i<candidates.length;i++){
      var el=candidates[i];
      if(el.closest('.rt-partner-summary-v3,.account-group,.rt-partner-v4-navrow,.rt-partner-v2-toolbar'))continue;
      var t=text(el);if(!re.test(t)||t.length>180)continue;
      if(t.length<bestLen){best=el;bestLen=t.length;}
    }
    if(!best)return;
    var node=best;
    for(var depth=0;depth<4&&node&&node.parentElement;depth++){
      var parent=node.parentElement;
      if(parent===page||parent.closest('.rt-partner-summary-v3,.account-group,.rt-partner-v4-navrow,.rt-partner-v2-toolbar'))break;
      var pt=text(parent);if(!re.test(pt)||pt.length>220)break;node=parent;
    }
    node.classList.add('rt-partner-final-hide');
  }

  function paidInfo(acct){var total=0,count=0;try{(acct.settlements||[]).forEach(function(tx){if(tx&&tx.paid===true){total+=Number(tx.partnerAmount)||0;count++;}});}catch(_){}return {total:Math.round(total*100)/100,count:count};}
  function cardLabel(card){return text(card&&card.querySelector('.rt-partner-summary-v3-label')).toLowerCase();}
  function cardKind(card){
    var kind=String(card&&card.getAttribute('data-kind')||'').toLowerCase(),label=cardLabel(card);
    if(kind)return kind;
    if(label.indexOf('outstanding')!==-1)return 'outstanding';
    if(label.indexOf('potential')!==-1)return 'potential';
    if(label.indexOf('paid')!==-1)return 'paid';
    if(label.indexOf('earned')!==-1)return 'earned';
    return '';
  }
  function makePaidCard(acct){
    var p=paidInfo(acct),card=document.createElement('div');card.className='rt-partner-summary-v3-card';card.setAttribute('data-kind','paid');
    card.innerHTML='<div class="rt-partner-summary-v3-label">Paid to partner</div><div class="rt-partner-summary-v3-value">'+money(p.total)+'</div><div class="rt-partner-summary-v3-sub">'+p.count+' completed payment'+(p.count===1?'':'s')+' recorded</div>';
    return card;
  }
  function guaranteeFinanceCards(page,acct){
    var summary=page&&page.querySelector('.rt-partner-summary-v3'),grid=summary&&summary.querySelector('.rt-partner-summary-v3-grid');
    if(!grid||!acct)return;
    Array.prototype.slice.call(grid.querySelectorAll('.rt-partner-summary-v3-card')).forEach(function(card){
      var label=cardLabel(card),kind=cardKind(card),body=text(card).toLowerCase();
      if(kind==='stock'||label==='stock on hand'||(/\blisted\b/.test(body)&&/\bunlisted\b/.test(body)&&/\breturned\b/.test(body))){card.remove();return;}
      if(kind)card.setAttribute('data-kind',kind);
    });
    var cards=Array.prototype.slice.call(grid.querySelectorAll('.rt-partner-summary-v3-card'));
    var hasPaid=cards.some(function(c){return cardKind(c)==='paid';});if(!hasPaid)grid.appendChild(makePaidCard(acct));
    var paid=paidInfo(acct);
    Array.prototype.slice.call(grid.querySelectorAll('.rt-partner-summary-v3-card')).forEach(function(card){
      var kind=cardKind(card);if(kind)card.setAttribute('data-kind',kind);if(kind!=='paid')return;
      var v=card.querySelector('.rt-partner-summary-v3-value'),s=card.querySelector('.rt-partner-summary-v3-sub');if(v)v.textContent=money(paid.total);if(s)s.textContent=paid.count+' completed payment'+(paid.count===1?'':'s')+' recorded';
    });
    grid.classList.remove('rt-partner-finance-only-grid');
    grid.setAttribute('data-card-count','4');
    /* Do not set inline grid-template-columns here. Mobile presentation owns its
       own hierarchy; the old inline !important was what squeezed four desktop
       cards across an iPhone. */
    grid.style.removeProperty('grid-template-columns');
  }

  function ensurePaymentTiming(root){
    root=root||document;
    var type=root.querySelector?root.querySelector('#acc-type'):null;if(!type)return;
    var row=root.querySelector('#acc-terms-row'),select=root.querySelector('#acc-terms');
    if(!row){
      var fg=type.closest('.fg');if(!fg||!fg.parentElement)return;
      row=document.createElement('div');row.className='fg';row.id='acc-terms-row';
      row.innerHTML='<label for="acc-terms">Payment timing</label><select id="acc-terms"><option value="upfront">Upfront — payable when stock is received</option><option value="on_sale">After sale — payable only when the item sells</option></select><div class="hint" style="margin-top:6px;">Controls when the agreed fixed amount becomes outstanding.</div>';
      fg.parentElement.insertBefore(row,fg.nextSibling);select=row.querySelector('#acc-terms');
    }
    if(!select)return;
    var current=select.value;
    select.innerHTML='<option value="upfront">Upfront — payable when stock is received</option><option value="on_sale">After sale — payable only when the item sells</option>';
    var acctId='';
    try{var editBtn=document.querySelector('[onclick*="submitEditAccount"]');var m=editBtn&&String(editBtn.getAttribute('onclick')||'').match(/submitEditAccount\(['\"]?([^'\")]+)['\"]?\)/);if(m)acctId=m[1];}catch(_){}
    var acct=accountById(acctId),preferred=acct?(typeof _rtPartnerPaymentTiming==='function'?_rtPartnerPaymentTiming(acct):(acct.paymentTiming||acct.paymentTerms)):current;
    select.value=preferred==='on_sale'?'on_sale':'upfront';
    var fixed=type.value!=='consignment';row.style.display=fixed?'':'none';var label=row.querySelector('label');if(label)label.textContent='When does the fixed amount become payable?';
  }
  function hookEditAccount(){
    try{
      var fn=window.openEditAccount;if(typeof fn!=='function'||fn.__rtTerms1491)return;
      var wrapped=function(){var r=fn.apply(this,arguments);requestAnimationFrame(function(){ensurePaymentTiming(document);});return r;};wrapped.__rtTerms1491=true;wrapped.__rtBase=fn;window.openEditAccount=wrapped;try{openEditAccount=wrapped;}catch(_){}
    }catch(_){}
  }
  function onTypeChange(ev){if(ev&&ev.target&&ev.target.id==='acc-type')ensurePaymentTiming(document);}

  function fix(){queued=false;var page=activePage();if(!page||page.hasAttribute('data-rt-account-transition'))return;removeLegacyCountCard(page);guaranteeFinanceCards(page,accountFromPage(page));}
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){requestAnimationFrame(fix);});}
  function start(){
    if(!document.getElementById('rt-partner-finalise-style')){var s=document.createElement('style');s.id='rt-partner-finalise-style';s.textContent='.rt-partner-final-hide{display:none!important}.rt-partner-summary-v3-grid[data-card-count="4"]{grid-template-columns:repeat(4,minmax(0,1fr))!important}@media(max-width:760px){.rt-partner-summary-v3-grid[data-card-count="4"]{grid-template-columns:repeat(2,minmax(0,1fr))!important}}';document.head.appendChild(s);}
    document.addEventListener('change',onTypeChange,true);hookEditAccount();schedule();
    var page=document.getElementById('p-item');if(page){observer=new MutationObserver(schedule);observer.observe(page,{childList:true,subtree:true});}
    window.addEventListener('hashchange',schedule);window.addEventListener('popstate',schedule);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.4.91 scoped partner finance finaliser loaded');
})();