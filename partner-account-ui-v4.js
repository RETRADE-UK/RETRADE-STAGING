/* RETRADE partner account UI v1.4.91
 * Finance-first Partner detail normaliser, scoped to #p-item.
 * No whole-app MutationObserver: account work only runs while account DOM changes.
 */
(function(){
  'use strict';
  if(window.__rtPartnerAccountV4_1491)return;
  window.__rtPartnerAccountV4_1491=true;

  var queued=false,observer=null;
  function text(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function roundMoney(n){return Math.round((Number(n)||0)*100)/100;}
  function money(n){try{if(typeof fmt==='function')return fmt(roundMoney(n));}catch(_){}return '£'+roundMoney(n).toFixed(2);}
  function setText(el,v){if(el)el.textContent=String(v==null?'':v);}
  function normaliseBackLabel(v){return String(v||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/^[←‹<]\s*/,'');}
  function findBack(page){
    if(!page)return null;var controls=page.querySelectorAll('button,a');
    for(var i=0;i<controls.length;i++){
      var raw=text(controls[i]).toLowerCase(),clean=normaliseBackLabel(raw),meta=(raw+' '+String(controls[i].getAttribute('aria-label')||'')+' '+String(controls[i].getAttribute('title')||'')).toLowerCase();
      if(clean==='accounts'||clean==='account'||clean==='partners'||clean==='partner')return controls[i];
      if(raw==='back to accounts'||raw==='back to account'||raw==='back to partners'||raw==='back to partner')return controls[i];
      if(/\bback\b/.test(meta)&&/\b(account|accounts|partner|partners)\b/.test(meta))return controls[i];
    }
    return null;
  }
  function activePage(){var p=document.getElementById('p-item');return p&&p.classList.contains('on')&&!p.hasAttribute('data-rt-account-transition')&&(p.querySelector('.account-group')||p.querySelector('.rt-partner-summary-v3')||findBack(p))?p:null;}
  function accountById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}
  function accountFromPage(page){
    if(!page)return null;var tagged=page.querySelector('[data-account-id],[data-accountid]');
    if(tagged){var id=tagged.getAttribute('data-account-id')||tagged.getAttribute('data-accountid'),a=accountById(id);if(a)return a;}
    var link=page.querySelector('.account-group [data-itemid][data-month]');
    if(link){try{var month=link.getAttribute('data-month'),itemId=link.getAttribute('data-itemid'),rows=(DB&&Array.isArray(DB[month]))?DB[month]:[];var item=rows.find(function(x){return x&&String(x.id)===String(itemId);});if(item&&item.accountId!=null){var aa=accountById(item.accountId);if(aa)return aa;}}catch(_){} }
    var h=page.querySelector('.page-title,h1,h2,h3'),name=text(h).toLowerCase();
    if(name){try{var m=(_accounts||[]).filter(function(a){var n=String(a&&a.name||'').trim().toLowerCase();return n&&(name===n||name.indexOf(n)!==-1||n.indexOf(name)!==-1);});if(m.length===1)return m[0];}catch(_){} }
    return null;
  }
  function accountItems(id){var out=[];try{(typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(month){((DB&&DB[month])||[]).forEach(function(i){if(i&&String(i.accountId)===String(id))out.push(i);});});}catch(_){}return out;}

  function installStyles(){
    if(document.getElementById('rt-partner-account-v4-style'))return;
    var s=document.createElement('style');s.id='rt-partner-account-v4-style';
    s.textContent='.rt-partner-v4-navrow{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;box-sizing:border-box!important;margin:0 0 12px!important}.rt-partner-v4-navrow>.rt-partner-statement-btn{margin:0 0 0 auto!important;flex:0 0 auto!important}.rt-partner-summary-v3.rt-partner-summary-v4{margin:12px 0 16px!important}.rt-partner-summary-v4 .rt-partner-summary-v3-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}.rt-partner-v4-hidden{display:none!important}@media(max-width:760px){.rt-partner-summary-v4 .rt-partner-summary-v3-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}}';
    document.head.appendChild(s);
  }
  function ensureTopNav(page){
    var back=findBack(page);if(!back)return;var row=back.closest('.rt-partner-v4-navrow');
    if(!row){var host=back.parentElement;if(!host)return;row=document.createElement('div');row.className='rt-partner-v4-navrow';host.insertBefore(row,back);row.appendChild(back);}
    var statement=page.querySelector('.rt-partner-statement-btn');if(statement&&statement.parentElement!==row)row.appendChild(statement);if(statement)statement.style.setProperty('margin-left','auto','important');
  }
  function removeLegacyAllocate(page){
    page.querySelectorAll('button,a').forEach(function(el){
      if(el.closest('.account-group,.rt-partner-v2-selection'))return;var label=text(el).toLowerCase(),action=String(el.getAttribute('onclick')||'').toLowerCase();
      if(/^allocate\s*&\s*settle\b/.test(label)||action.indexOf('_openconsignmentsettlementbuilder')!==-1||action.indexOf('settleallforaccount')!==-1){var p=el.parentElement;el.remove();if(p&&p!==page&&!p.children.length&&!text(p))p.remove();}
    });
  }

  function itemState(i){return String(i&&i.state||'').toLowerCase();}
  function partsCost(i){try{if(typeof calcPartsCost==='function')return Number(calcPartsCost(i))||0;}catch(_){}return (Array.isArray(i&&i.parts)?i.parts:[]).reduce(function(s,p){return s+(Number(p&&p.cost)||0);},0);}
  function accountTypeFor(i,a){try{if(typeof _itemAccountType==='function')return String(_itemAccountType(i)||'').toLowerCase();}catch(_){}return String((i&&i.accountType)||(a&&a.accountType)||'supplier').toLowerCase();}
  function positiveFirst(){for(var i=0;i<arguments.length;i++){var n=Number(arguments[i]);if(isFinite(n)&&n>0)return n;}return 0;}
  function potentialInfo(acct){
    var total=0,priced=0,listed=0,unlisted=0;
    accountItems(acct.id).forEach(function(item){
      if(!item||item.scrappedAt||item.scrapped_at)return;
      var state=itemState(item),price=state==='listed'?positiveFirst(item.salePrice,item.estSalePrice):state==='sourced'?positiveFirst(item.estSalePrice):0;if(!(price>0))return;
      var revenue=price+(Number(item.postage)||0),shipping=Math.max(0,Number(item.shippingCost)||0),packaging=Math.max(0,Number(item.packagingCost)||0),listingFee=Math.max(0,Number(item.listingFee)||0),promoPct=Math.max(0,Number(item.promoPercent)||0);if(promoPct>1)promoPct/=100;
      var parts=partsCost(item),type=accountTypeFor(item,acct),fixed=item.accountPaidAmount!=null&&item.accountPaidAmount!==''?Math.max(0,Number(item.accountPaidAmount)||0):null,purchase=type==='supplier'?(fixed!=null?fixed:Math.max(0,Number(item.costPrice)||0)):Math.max(0,Number(item.costPrice)||0),pool=revenue-purchase-shipping-packaging-listingFee-(price*promoPct)-parts,retrade=pool;
      if(type!=='supplier'){var partner=0;if(fixed!=null)partner=fixed;else{var pct=item.accountSplitPercent!=null?Number(item.accountSplitPercent):Number(acct.defaultSplitPercent);if(isFinite(pct))partner=Math.max(0,pool)*Math.max(0,Math.min(100,pct))/100;}retrade=pool-partner;}
      total+=Math.max(0,retrade);priced++;if(state==='listed')listed++;else unlisted++;
    });
    if(!priced)return {value:null,note:'No priced unsold items available for a reliable estimate'};
    var note=listed&&unlisted?'Estimated RETRADE profit from '+listed+' listed + '+unlisted+' estimated unlisted item'+(unlisted===1?'':'s'):listed?'Estimated RETRADE profit from '+listed+' listed item'+(listed===1?'':'s')+' at current asking price'+(listed===1?'':'s'):'Estimated RETRADE profit from '+unlisted+' estimated unlisted item'+(unlisted===1?'':'s');
    return {value:roundMoney(total),note:note};
  }
  function paidInfo(acct){var v=0,c=0;try{(acct.settlements||[]).forEach(function(tx){if(tx&&tx.paid===true){v+=Number(tx.partnerAmount)||0;c++;}});}catch(_){}return {value:roundMoney(v),count:c};}
  function findCard(summary,label,kind){var cards=summary.querySelectorAll('.rt-partner-summary-v3-card'),want=String(label||'').toLowerCase();for(var i=0;i<cards.length;i++){var l=text(cards[i].querySelector('.rt-partner-summary-v3-label')).toLowerCase();if((kind&&cards[i].getAttribute('data-kind')===kind)||l===want)return cards[i];}return null;}
  function ensurePaidCard(summary,acct){
    var grid=summary.querySelector('.rt-partner-summary-v3-grid');if(!grid)return null;var card=findCard(summary,'Paid to partner','paid');
    if(!card){card=document.createElement('div');card.className='rt-partner-summary-v3-card';card.setAttribute('data-kind','paid');card.innerHTML='<div class="rt-partner-summary-v3-label">Paid to partner</div><div class="rt-partner-summary-v3-value"></div><div class="rt-partner-summary-v3-sub"></div>';grid.appendChild(card);}
    var p=paidInfo(acct);setText(card.querySelector('.rt-partner-summary-v3-value'),money(p.value));setText(card.querySelector('.rt-partner-summary-v3-sub'),p.count+' completed payment'+(p.count===1?'':'s')+' recorded');card.setAttribute('data-kind','paid');return card;
  }
  function normaliseSummary(page,acct){
    var summary=page.querySelector('.rt-partner-summary-v3');if(!summary||!acct)return;summary.classList.add('rt-partner-summary-v4');
    summary.querySelectorAll('.rt-partner-summary-v3-card').forEach(function(card){var label=text(card.querySelector('.rt-partner-summary-v3-label')).toLowerCase(),kind=String(card.getAttribute('data-kind')||'').toLowerCase();if(kind==='stock'||label==='stock on hand')card.remove();});
    var potential=potentialInfo(acct),pc=findCard(summary,'Potential remaining','potential');if(pc){setText(pc.querySelector('.rt-partner-summary-v3-value'),potential.value==null?'—':money(potential.value));setText(pc.querySelector('.rt-partner-summary-v3-sub'),potential.note);pc.setAttribute('data-kind','potential');}
    var paid=paidInfo(acct),out=findCard(summary,'Partner outstanding','outstanding');if(out){out.setAttribute('data-kind','outstanding');if(paid.value>0){var sub=out.querySelector('.rt-partner-summary-v3-sub'),base=text(sub).replace(/\s*·\s*£[\d,.]+\s+paid$/i,'');setText(sub,base+' · '+money(paid.value)+' paid');}}
    var earned=findCard(summary,'RETRADE earned','earned');if(earned)earned.setAttribute('data-kind','earned');ensurePaidCard(summary,acct);
    var grid=summary.querySelector('.rt-partner-summary-v3-grid');if(grid)grid.setAttribute('data-card-count','4');
  }
  function hideLegacyStock(page){
    page.querySelectorAll('.account-stock-kpi,.account-stock-money').forEach(function(el){el.classList.add('rt-partner-v4-hidden');});
    var re=/\b\d+\s+listed\s*[·•]\s*\d+\s+unlisted(?:\s*[·•]\s*\d+\s+returned)?\b/i,best=null,bestLen=Infinity;
    page.querySelectorAll('div,section,article').forEach(function(el){if(el.closest('.rt-partner-summary-v3,.account-group,.rt-partner-v4-navrow,.rt-partner-v2-toolbar'))return;var t=text(el);if(re.test(t)&&t.length<bestLen&&t.length<200){best=el;bestLen=t.length;}});if(best)best.classList.add('rt-partner-v4-hidden');
  }

  function fix(){queued=false;installStyles();var page=activePage();if(!page)return;removeLegacyAllocate(page);ensureTopNav(page);var acct=accountFromPage(page);if(acct)normaliseSummary(page,acct);hideLegacyStock(page);}
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){requestAnimationFrame(fix);});}
  function start(){schedule();if(observer)return;var page=document.getElementById('p-item');if(page){observer=new MutationObserver(schedule);observer.observe(page,{childList:true,subtree:true});}window.addEventListener('hashchange',schedule);window.addEventListener('popstate',schedule);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  console.info('[RETRADE] v1.4.91 scoped finance-first partner account normaliser loaded');
})();