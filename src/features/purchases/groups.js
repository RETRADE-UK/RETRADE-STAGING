/* Purchase identity lives on each stock record and follows its existing outbox,
   conflict resolution and backup. Costs stay allocated to individual items. */
(function(){
  'use strict';
  function records(){return allDBKeys().flatMap(function(m){return (DB[m]||[]).map(function(i){return {month:m,item:i};});});}
  function members(id){return records().filter(function(r){return r.item.purchaseGroupId===id;});}
  function eligible(i){return !i.accountId&&!i.scrappedAt&&!i.purchaseGroupId&&(i.state==='sourced'||i.state==='listed')&&!i.dateSold;}
  function cents(v){var s=String(v).trim();return /^\d+(\.\d{1,2})?$/.test(s)&&Number.isSafeInteger(Math.round(Number(s)*100))?Math.round(Number(s)*100):null;}
  function field(label,id,value,type){return '<div class="fg"><label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+(type||'text')+'" value="'+esc(String(value==null?'':value))+'"'+(type==='number'?' min="0" step="0.01" inputmode="decimal"':'')+'></div>';}
  function button(text,id){return '<button type="button" class="btn btn-secondary" id="'+id+'">'+text+'</button>';}
  function refresh(){saveDB();renderStock();if(document.querySelector('#p-item.on')&&window._purchaseItemContext)renderItemPage(window._purchaseItemContext.month,window._purchaseItemContext.id);}
  window.purchaseGroupMembers=members;
  window.openPurchaseGroup=function(id,onReturn){
    if(!onReturn&&document.querySelector('#p-item.on')&&window._purchaseItemContext){
      var itemContext=window._purchaseItemContext,itemOrigin=_itemPageOrigin,itemReturn=_itemPageReturn;
      onReturn=function(){openItemPage(itemContext.month,itemContext.id,itemOrigin,itemReturn);};
    }
    var rows=members(id);if(!rows.length){closePanel(true);if(onReturn)onReturn();toast('Purchase no longer available');return;}
    var total=rows.reduce(function(s,r){return s+Math.round(Number(r.item.costPrice||0)*100);},0);
    openPanel('Purchase group','<p class="page-subtitle">'+esc(rows[0].item.purchaseGroupName||'Shared purchase')+'</p><h2>'+fmt(total/100)+'</h2><p>Allocated across '+rows.length+' separate items. Each item keeps its own listing, sale and profit.</p><div id="purchase-members"></div><p class="fg-hint">The total follows the allocated item costs. Cashflow combines purchases on the same date; changing an item’s source date shows it separately.</p>'+button('Close','purchase-close'));
    document.getElementById('slide-panel')._panelMeta={onClose:onReturn};
    var list=document.getElementById('purchase-members');
    rows.forEach(function(r){var div=document.createElement('div');div.className='purchase-member';var view=document.createElement('button');view.className='btn btn-secondary';view.textContent=r.item.item+' · '+fmt(r.item.costPrice||0)+' · '+r.item.state;view.onclick=function(){var origin=onReturn?'p-cash':(document.querySelector('.page.on')||{}).id;if(origin==='p-item')origin=_itemPageOrigin;closePanel(true);openItemPage(r.month,r.item.id,origin,function(){openPurchaseGroup(id,onReturn);});};div.append(view);var unlink=document.createElement('button');unlink.className='btn btn-secondary';unlink.textContent='Unlink';unlink.setAttribute('aria-label','Unlink '+r.item.item);unlink.onclick=async function(){if(!await showConfirm('Unlink item?','Its cost and listing stay unchanged. It will appear as a separate purchase in cashflow.',{okLabel:'Unlink'}))return;r.item.purchaseGroupId=null;r.item.purchaseGroupName=null;refresh();openPurchaseGroup(id,onReturn);};div.append(unlink);list.append(div);});
    document.getElementById('purchase-close').onclick=closePanel;
  };
  window.openPurchaseLink=function(ids){
    var rows=(ids||Array.from(STOCK_SELECTED)).map(_findItemRecordById).filter(Boolean);
    if(!rows.length||rows.some(function(r){return !eligible(r.item);})){toast('Choose ungrouped, unsold stock owned by you.','error');return;}
    var dates=new Set(rows.map(function(r){return r.item.dateSourced||r.item.dateListed;}));
    if(dates.size!==1||!Array.from(dates)[0]){toast('Items in one purchase must have the same source date.','error');return;}
    var date=Array.from(dates)[0],groups=new Map();records().forEach(function(r){if(r.item.purchaseGroupId&&!r.item.accountId&&(r.item.dateSourced||r.item.dateListed)===date)groups.set(r.item.purchaseGroupId,r.item.purchaseGroupName||'Shared purchase');});
    openPanel('Link to a purchase','<p>Link '+rows.length+' item(s) bought on '+esc(date)+'. Their costs and listings stay unchanged.</p><div class="fg"><label for="purchase-existing">Purchase</label><select id="purchase-existing"><option value="">Create a new group</option>'+Array.from(groups).map(function(g){return '<option value="'+esc(g[0])+'">'+esc(g[1])+'</option>';}).join('')+'</select></div>'+field('Purchase name','purchase-name','')+'<p>Selected cost: '+fmt(rows.reduce(function(s,r){return s+Number(r.item.costPrice||0);},0))+'</p><p id="purchase-error" role="alert"></p><button class="btn btn-primary" id="purchase-link-save">Link items</button>');
    document.getElementById('purchase-link-save').onclick=function(){
      var id=document.getElementById('purchase-existing').value,name=document.getElementById('purchase-name').value.trim();
      // Revalidate the current records before writing; an open form is not a snapshot lock.
      var fresh=rows.map(function(r){return _findItemRecordById(r.item.id);});
      if(fresh.some(function(r){return !r||!eligible(r.item)||(r.item.dateSourced||r.item.dateListed)!==date;})){document.getElementById('purchase-error').textContent='These items changed. Close and reopen this form.';return;}
      if(!id&&fresh.length<2){document.getElementById('purchase-error').textContent='Select at least two items for a new group, or choose an existing purchase.';return;}
      if(id){var group=members(id);if(!group.length||group.some(function(r){return r.item.accountId||(r.item.dateSourced||r.item.dateListed)!==date;})){document.getElementById('purchase-error').textContent='That purchase changed. Reopen this form.';return;}name=group[0].item.purchaseGroupName;}
      else if(!name){document.getElementById('purchase-error').textContent='Give this purchase a name.';return;}
      id=id||_newId('purchase');fresh.forEach(function(r){r.item.purchaseGroupId=id;r.item.purchaseGroupName=name;});refresh();openPurchaseGroup(id);
    };
  };
  window.openNewPurchase=function(){
    openPanel('New purchase','<p>Enter what you paid once, then allocate that cost to the separate items you will list.</p>'+field('Purchase name','purchase-name','')+field('Date purchased','purchase-date',new Date().toLocaleDateString('en-CA'),'date')+field('Total paid (£)','purchase-total','','number')+'<div id="purchase-lines"></div><div class="purchase-actions">'+button('Add item','purchase-add')+button('Split equally','purchase-split')+'</div><p id="purchase-balance" aria-live="polite"></p><p id="purchase-error" role="alert"></p><button class="btn btn-primary" id="purchase-save">Save purchase &amp; stock</button>');
    var list=document.getElementById('purchase-lines'),seq=0;
    function balance(){var total=cents(document.getElementById('purchase-total').value),sum=0;list.querySelectorAll('[data-cost]').forEach(function(e){sum+=cents(e.value)||0;});document.getElementById('purchase-balance').textContent=total===null?'Enter the total paid.':fmt(sum/100)+' allocated · '+fmt((total-sum)/100)+' remaining';}
    function add(){var n=++seq,div=document.createElement('div');div.className='purchase-line';div.innerHTML=field('Item title','purchase-title-'+n,'')+field('Allocated cost (£)','purchase-cost-'+n,'','number')+button('Remove','purchase-remove-'+n);div.querySelector('input[type=number]').dataset.cost='';div.querySelector('input[type=text]').dataset.title='';div.querySelector('button').onclick=function(){if(list.children.length<=2){toast('A shared purchase needs at least two items');return;}div.remove();balance();};list.append(div);div.addEventListener('input',balance);balance();}
    add();add();document.getElementById('purchase-add').onclick=add;document.getElementById('purchase-total').oninput=balance;
    document.getElementById('purchase-split').onclick=function(){var total=cents(document.getElementById('purchase-total').value),inputs=Array.from(list.querySelectorAll('[data-cost]'));if(total===null)return;inputs.forEach(function(e,n){e.value=((Math.floor(total/inputs.length)+(n<total%inputs.length?1:0))/100).toFixed(2);});balance();};
    document.getElementById('purchase-save').onclick=function(){
      var name=document.getElementById('purchase-name').value.trim(),date=document.getElementById('purchase-date').value,total=cents(document.getElementById('purchase-total').value),lines=Array.from(list.children).map(function(el){return {title:el.querySelector('[data-title]').value.trim(),cost:cents(el.querySelector('[data-cost]').value)};});
      var error=!name?'Give this purchase a name.':!date?'Choose the purchase date.':total===null?'Enter a valid total with up to two decimal places.':lines.some(function(l){return !l.title||l.cost===null;})?'Every item needs a title and a valid allocated cost.':lines.reduce(function(s,l){return s+l.cost;},0)!==total?'Allocated costs must exactly match the total paid.':'';
      if(error){document.getElementById('purchase-error').textContent=error;return;}
      document.getElementById('purchase-save').disabled=true;
      var id=_newId('purchase'),m=monthKeyFromDate(date);if(!Array.isArray(DB[m]))DB[m]=[];
      lines.forEach(function(l){var i={id:_newId('sqa'),gid:'R-'+String(getNextGID()).padStart(4,'0'),item:l.title,state:'sourced',dateSourced:date,costPrice:l.cost/100,purchaseGroupId:id,purchaseGroupName:name,category:autoCategory(l.title),parts:[],returnHistory:[],notes:'',dateListed:null,dateSold:null,salePrice:0,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,isReturned:false,grossProfit:null};_autoTagToActiveRun(i);DB[m].push(i);});
      refresh();openPurchaseGroup(id);
    };
  };
  window.renderPurchaseItemLink=function(m,id){
    var r=_findItemRecordById(id),page=document.getElementById('p-item');if(!r||!page)return;window._purchaseItemContext={month:m,id:id};
    var old=page.querySelector('.purchase-item-link');if(old)old.remove();
    if(!r.item.purchaseGroupId&&!eligible(r.item))return;
    var b=document.createElement('button');b.className='btn btn-secondary purchase-item-link';b.textContent=r.item.purchaseGroupId?'Purchase · '+(r.item.purchaseGroupName||'Shared purchase'):'Link to a purchase';b.onclick=function(){if(r.item.purchaseGroupId)openPurchaseGroup(r.item.purchaseGroupId);else openPurchaseLink([id]);};
    var anchor=page.querySelector('.ip-title');if(anchor)anchor.after(b);else {
      var back=page.querySelector('button[onclick="exitItemPage()"]');
      if(back){
        var nav=back.closest('.purchase-item-nav');
        if(!nav){nav=document.createElement('div');nav.className='purchase-item-nav';back.before(nav);nav.append(back);}
        b.title=b.textContent;nav.append(b);
      }else (page.firstElementChild||page).append(b);
    }
  };
})();
