/* One acquisition, separate stock records. Purchase identity and paid dates use
   the normal item mapper/outbox; no extra cash movement or expense is created. */
(function(){
  'use strict';
  function records(){return allDBKeys().flatMap(function(m){return (DB[m]||[]).map(function(i){return {month:m,item:i};});});}
  function members(id){return records().filter(function(r){return r.item.purchaseGroupId===id;});}
  function groupName(rows){var named=rows.find(function(r){return String(r.item.purchaseGroupName||'').trim();});return named?named.item.purchaseGroupName:'Shared purchase';}
  function owner(){return typeof _currentUserId==='undefined'?null:_currentUserId;}
  function cents(v){var s=String(v==null?'':v).trim();return /^\d+(\.\d{1,2})?$/.test(s)&&Number.isSafeInteger(Math.round(Number(s)*100))?Math.round(Number(s)*100):null;}
  function itemCost(i){return cents(i.costPrice==null?0:i.costPrice);}
  function snapshot(i){return JSON.stringify(Object.assign({},i,{refreshHistory:i.refreshHistory||[]}));}
  function review(rows){return rows.map(function(r){return {id:r.item.id,month:r.month,before:snapshot(r.item)};});}
  function unchanged(rows){return rows.every(function(r){var now=_findItemRecordById(r.id);return now&&now.month===r.month&&snapshot(now.item)===r.before;});}
  function groupSnapshot(id){return JSON.stringify(review(members(id)).sort(function(a,b){return a.id.localeCompare(b.id);}));}
  function field(label,id,value,type){return '<div class="fg"><label for="'+id+'">'+esc(label)+'</label><input id="'+id+'" type="'+(type||'text')+'" value="'+esc(String(value==null?'':value))+'"'+(type==='number'?' min="0" step="0.01" inputmode="decimal"':'')+'></div>';}
  function button(label,id){return '<button type="button" class="btn btn-secondary" id="'+id+'">'+esc(label)+'</button>';}
  function error(message){var el=document.getElementById('purchase-error');if(el)el.textContent=message;else toast(message,'error');return false;}
  function paid(i){return _itemPurchasePaymentDate(i);}
  function total(rows){return rows.reduce(function(sum,r){return sum+itemCost(r.item);},0);}
  function ownReason(i){
    if(!i)return 'This stock item is no longer available.';
    if(i.accountId)return 'Partner stock uses its account payment. Open the partner account to manage that payment.';
    if(itemCost(i)===null)return 'Check the item’s purchase cost before assigning a payment.';
    return '';
  }
  function splitReason(i){
    var reason=ownReason(i);if(reason)return reason;
    if(typeof _activeJobLotMembership==='function'&&_activeJobLotMembership(i.id))return 'Manage stock in a Job Lot from its Job Lot page first.';
    if(!['sourced','listed'].includes(_itemLifecycleState(i))||i.dateSold||i.resaleDateSold||i.resaleSalePrice||i.isReturned||i.scrappedAt||i.state==='sold'||i.state==='returned')return 'Only never-sold active stock can be split. Sale and return history must stay with its original item.';
    if((i.returnHistory||[]).length||_itemHasGroupedSale(i))return 'Items with sale or return history cannot be split. Review the original item or order.';
    if((i.refreshHistory||[]).some(function(h){return h.type==='verified_sale_fees'||h.type==='verified_cash_events'||h.type==='bundle_sale_delivery';}))return 'This item has recorded sale evidence. Review its history before splitting.';
    if(i.supplierRefund||i.accountSettled||Number(i.accountPaidAmount)>0||typeof _hasSettlementHistoryForItem==='function'&&_hasSettlementHistoryForItem(i.id))return 'This item has a recorded refund or partner payment. Review its history before splitting.';
    if((typeof _saleReconciliations==='undefined'?[]:_saleReconciliations||[]).some(function(r){return r.attachedItemId===i.id||r.targetSaleItemId===i.id||(r.resultingAllocation||[]).some(function(a){return a.itemId===i.id;});}))return 'This item has a reconciled sale. Review its history before splitting.';
    return '';
  }
  window.purchaseCanSplit=function(i){return !splitReason(i);};
  window.purchaseGroupMembers=members;

  function refresh(){
    if(typeof STOCK_SELECTED!=='undefined')STOCK_SELECTED.clear();
    if(typeof STOCK_SELECTION_MODE!=='undefined')STOCK_SELECTION_MODE=false;
    if(document.querySelector('#p-stock.on'))renderStock();
    if(document.querySelector('#p-item.on')&&window._purchaseItemContext){
      var r=_findItemRecordById(window._purchaseItemContext.id);if(r)renderItemPage(r.month,r.item.id);
    }
  }
  // Mutations are staged together through the existing synchronous durable save.
  // An explicit failure restores just these records, leaving the form reviewable.
  function commit(updates,creates,buttonEl){
    var before=updates.map(function(u){return {item:u.item,copy:JSON.parse(JSON.stringify(u.item))};});
    var createdMonths=[],expected=[];
    if(buttonEl)buttonEl.disabled=true;
    try{
      updates.forEach(function(u){Object.assign(u.item,u.values);});
      creates.forEach(function(r){if(!Array.isArray(DB[r.month])){DB[r.month]=[];createdMonths.push(r.month);}DB[r.month].push(r.item);});
      var fingerprints=_dbFingerprint();
      expected=updates.map(function(u){return u.item.id;}).concat(creates.map(function(r){return r.item.id;})).map(function(id){return {key:'item:'+id,fingerprint:fingerprints['item:'+id]};});
      if(saveDB()===false)throw new Error('save rejected');
    }catch(e){
      // saveDB stages the durable queue before rendering. If that render fails,
      // keep the fully queued change; rolling memory back would contradict the
      // pending writes and make a retry create duplicate children.
      var queued=typeof _outboxRead==='function'?_outboxRead():{};
      var staged=expected.length&&expected.every(function(r){var q=queued[r.key];return q&&q.op==='save'&&q.json+'|'+q.month===r.fingerprint;});
      if(staged){
        if(! _previewMode){clearTimeout(_saveTimer);_saveTimer=setTimeout(_persistChanges,200);}
        try{refresh();}catch(renderError){}
        toast('Purchase saved on this device. Sync will retry.');
        return true;
      }
      before.forEach(function(b){Object.keys(b.item).forEach(function(k){delete b.item[k];});Object.assign(b.item,b.copy);});
      creates.forEach(function(r){var arr=DB[r.month],n=arr&&arr.findIndex(function(i){return i.id===r.item.id;});if(n>=0)arr.splice(n,1);});
      createdMonths.forEach(function(m){if(DB[m]&&!DB[m].length)delete DB[m];});
      if(buttonEl)buttonEl.disabled=false;
      return error('This change could not be saved. Your original items are unchanged. Try again.');
    }
    refresh();return true;
  }

  window.openPurchaseGroup=function(id,onReturn){
    if(!onReturn&&document.querySelector('#p-item.on')&&window._purchaseItemContext){
      var itemContext=window._purchaseItemContext,itemOrigin=_itemPageOrigin,itemReturn=_itemPageReturn;
      onReturn=function(){openItemPage(itemContext.month,itemContext.id,itemOrigin,itemReturn);};
    }
    var rows=members(id),user=owner(),panelReview=review(rows);
    if(!rows.length){closePanel(true);if(onReturn)onReturn();toast('Purchase no longer available');return;}
    var dates=Array.from(new Set(rows.map(function(r){return paid(r.item).date;}))),estimated=rows.some(function(r){return paid(r.item).dateEstimated;});
    var timing=dates.length===1&&dates[0]?'Payment date: '+dates[0]+(estimated?' · includes an estimated date':''):'This purchase has different or missing payment dates. Cashflow keeps those dates separate.';
    openPanel('Purchase group','<p class="page-subtitle">'+esc(groupName(rows))+'</p><h2>'+fmt(total(rows)/100)+'</h2><p>Allocated across '+rows.length+' separate items. Each item keeps its own listing, sale and profit.</p><p class="fg-hint">'+esc(timing)+'</p><div id="purchase-members"></div><p class="fg-hint">To add stock to this payment, select a member and the items to add in Stock, then choose Assign to payment.</p><p id="purchase-error" role="alert"></p><div class="purchase-actions">'+button('Edit payment','purchase-edit')+button('Close','purchase-close')+'</div>');
    document.getElementById('slide-panel')._panelMeta={onClose:onReturn};
    var list=document.getElementById('purchase-members');
    rows.forEach(function(r){
      var div=document.createElement('div');div.className='purchase-member';
      var view=document.createElement('button');view.className='btn btn-secondary';view.textContent=r.item.item+' · '+fmt(r.item.costPrice||0)+' · '+r.item.state;
      view.onclick=function(){var current=_findItemRecordById(r.item.id);if(!current)return error('This item is no longer available.');var origin=onReturn?'p-cash':(document.querySelector('.page.on')||{}).id;if(origin==='p-item')origin=_itemPageOrigin;closePanel(true);openItemPage(current.month,current.item.id,origin,function(){openPurchaseGroup(id,onReturn);});};
      div.append(view);
      var unlink=document.createElement('button');unlink.className='btn btn-secondary';unlink.textContent='Unlink';unlink.setAttribute('aria-label','Unlink '+r.item.item);
      unlink.onclick=async function(){
        var reviewed=panelReview.filter(function(x){return x.id===r.item.id;}),current=_findItemRecordById(r.item.id);
        if(owner()!==user||!current||current.item.purchaseGroupId!==id||!unchanged(reviewed))return error('This item changed. Reopen the purchase before unlinking.');
        if(!await showConfirm('Unlink item?','Its cost, payment date and listing stay unchanged. It will appear as a separate purchase in Cashflow.',{okLabel:'Unlink'}))return;
        if(owner()!==user||!unchanged(reviewed)||_findItemRecordById(r.item.id).item.purchaseGroupId!==id)return error('This item changed. Reopen the purchase before unlinking.');
        var fresh=_findItemRecordById(r.item.id);
        if(commit([{item:fresh.item,values:{purchaseGroupId:null,purchaseGroupName:null}}],[],unlink))openPurchaseGroup(id,onReturn);
      };
      div.append(unlink);list.append(div);
    });
    document.getElementById('purchase-edit').onclick=function(){
      if(owner()!==user||!unchanged(panelReview))return error('This payment changed. Reopen it to review the current items.');
      editPayment(id,[],onReturn,true);
    };
    document.getElementById('purchase-close').onclick=function(){closePanel();};
  };

  function editPayment(id, additions, onReturn, fromGroup){
    var existing=members(id), rows=existing.concat(additions);
    if(!existing.length)return error('This payment is no longer available.');
    var reason=rows.map(function(r){return ownReason(r.item);}).find(Boolean);
    if(reason){toast(reason,'error');return;}
    var user=owner(), before=groupSnapshot(id), newReview=review(additions);
    var name=groupName(existing), dates=new Set(existing.map(function(r){return paid(r.item).date;}));
    var commonDate=dates.size===1?(paid(existing[0].item).date||''):'';
    var estimatedOnly=commonDate&&existing.every(function(r){return paid(r.item).dateEstimated;});
    var date=estimatedOnly?'':commonDate;
    var dateHelp='Changing the date moves the whole payment to that day in Cashflow.';
    if(estimatedOnly)dateHelp='Cashflow estimates '+commonDate+' from the stock records. Enter the actual date paid to confirm it for the whole payment.';
    else if(!date)dateHelp='These items have different or missing payment dates. Choose a date to apply it to the whole payment.';
    var lines=rows.map(function(r,index){
      var title=r.item.item||'Untitled stock';
      var heading=index===0?'<h3>Already in this payment</h3>':'';
      if(index===existing.length)heading='<h3>Adding to this payment</h3>';
      return heading+field(title,'purchase-allocation-'+index,(itemCost(r.item)/100).toFixed(2),'number');
    }).join('');
    var showGroup=function(){openPurchaseGroup(id,onReturn);};
    openPanel(additions.length?'Add to existing payment':'Edit existing payment',
      field('Purchase name','purchase-name',name)+field('Date paid','purchase-paid-date',date,'date')+
      '<p class="fg-hint">'+dateHelp+'</p><p>Review the purchase cost in pounds for each item.</p>'+
      '<div id="purchase-allocations">'+lines+'</div>'+
      '<p id="purchase-link-total" class="purchase-summary" aria-live="polite"></p><p id="purchase-error" role="alert"></p>'+
      '<div class="purchase-actions">'+button('Cancel','purchase-cancel')+
      '<button type="button" class="btn btn-primary" id="purchase-link-save">Save payment</button></div>',
      false,{onClose:fromGroup?showGroup:null});
    var allocations=document.getElementById('purchase-allocations');
    var inputs=Array.from(allocations.querySelectorAll('input'));
    function amounts(){return inputs.map(function(input){return cents(input.value);});}
    function updateTotal(){
      var costs=amounts();
      document.getElementById('purchase-link-total').textContent=costs.includes(null)?'Enter a cost for every item.':
        'Payment total '+fmt(costs.reduce(function(sum,value){return sum+value;},0)/100)+' · '+rows.length+(rows.length===1?' item':' items');
    }
    allocations.oninput=updateTotal;
    updateTotal();
    document.getElementById('purchase-cancel').onclick=function(){closePanel();};
    document.getElementById('purchase-link-save').onclick=function(){
      if(this.disabled)return;
      if(owner()!==user||groupSnapshot(id)!==before||!unchanged(newReview))
        return error('This payment or its items changed. Close and reopen it to review the current amounts.');
      var fresh=rows.map(function(r){return _findItemRecordById(r.item.id).item;});
      var reason=fresh.map(ownReason).find(Boolean);
      if(reason)return error(reason);
      var nextName=document.getElementById('purchase-name').value.trim();
      var nextDate=document.getElementById('purchase-paid-date').value, costs=amounts();
      if(!nextName)return error('Give this purchase a name.');
      if((additions.length||nextDate!==date)&&!_reportDateValid(nextDate))return error('Choose a valid payment date.');
      if(costs.includes(null))return error('Enter a purchase cost with up to two decimal places for every item.');
      var updates=[];
      fresh.forEach(function(item,index){
        var adding=index>=existing.length, values={};
        if(adding)values.purchaseGroupId=id;
        if(adding||nextName!==name)values.purchaseGroupName=nextName;
        if(adding||nextDate!==date)values.purchasePaidDate=nextDate;
        if(costs[index]!==itemCost(item)){
          values.costPrice=costs[index]/100;
          if(item.dateSold||item.isReturned||item.resaleSalePrice)
            values.grossProfit=calcGrossProfit(Object.assign({},item,values));
        }
        if(Object.keys(values).length)updates.push({item:item,values:values});
      });
      if(!updates.length||commit(updates,[],this))showGroup();
    };
  }

  function paymentGroups(){
    var ids=Array.from(new Set(records().map(function(r){return r.item.purchaseGroupId;}).filter(Boolean)));
    return ids.map(function(id){
      var rows=members(id),dates=Array.from(new Set(rows.map(function(r){return paid(r.item).date;})));
      if(rows.some(function(r){return ownReason(r.item);})||dates.length!==1||!dates[0])return null;
      return {id:id,name:groupName(rows),date:dates[0],estimatedOnly:rows.every(function(r){return paid(r.item).dateEstimated;}),total:total(rows),before:groupSnapshot(id)};
    }).filter(Boolean).sort(function(a,b){return b.date.localeCompare(a.date)||a.name.localeCompare(b.name);});
  }
  window.openPurchaseLink=function(ids){
    ids=Array.from(new Set(ids||Array.from(STOCK_SELECTED)));
    var rows=ids.map(_findItemRecordById),user=owner();
    if(!rows.length||rows.some(function(r){return !r;})){toast('Select the stock items from this purchase.','error');return;}
    var reason=rows.map(function(r){return ownReason(r.item);}).find(Boolean);if(reason){toast(reason,'error');return;}
    var groupIds=new Set(rows.map(function(r){return r.item.purchaseGroupId;}).filter(Boolean));
    if(groupIds.size>1){toast('These items belong to different payments. Select items from one payment at a time.','error');return;}
    if(groupIds.size){
      var existingId=groupIds.values().next().value;
      var additions=rows.filter(function(r){return !r.item.purchaseGroupId;});
      return editPayment(existingId,additions);
    }
    var reviewed=review(rows),groups=paymentGroups(),amount=total(rows);
    var dates=Array.from(new Set(rows.map(function(r){return paid(r.item).date;}))),defaultDate=dates.length===1&&dates[0]?dates[0]:'';
    var summary='<ul class="purchase-review">'+rows.map(function(r){return '<li><span>'+esc(r.item.item||'Untitled stock')+'</span><strong>'+fmt(itemCost(r.item)/100)+'</strong></li>';}).join('')+'</ul>';
    openPanel('Assign to payment','<p>Join these stock items under one purchase payment. The amount comes from their allocated purchase costs.</p>'+summary+'<div class="fg"><label for="purchase-existing">Payment</label><select id="purchase-existing"><option value="">Create one payment for these items</option>'+groups.map(function(g){return '<option value="'+esc(g.id)+'">'+esc(g.name)+' · '+fmt(g.total/100)+' · '+esc(g.date)+(g.estimatedOnly?' (estimated)':'')+'</option>';}).join('')+'</select></div>'+field('Purchase name','purchase-name',rows[0].item.item+(rows.length>1?' + '+(rows.length-1)+' more':''))+field('Date paid','purchase-paid-date',defaultDate,'date')+'<p class="fg-hint" id="purchase-date-help">Confirm when you paid for this purchase. Each item keeps its original sourced and listed dates.</p><p id="purchase-link-total" class="purchase-summary" aria-live="polite"></p><p id="purchase-error" role="alert"></p><div class="purchase-actions">'+button('Cancel','purchase-cancel')+'<button type="button" class="btn btn-primary" id="purchase-link-save">Assign to payment</button></div>');
    var select=document.getElementById('purchase-existing'),nameEl=document.getElementById('purchase-name'),dateEl=document.getElementById('purchase-paid-date'),newName=nameEl.value;
    function selected(){return groups.find(function(g){return g.id===select.value;});}
    select.onchange=function(){
      var g=selected();
      if(g&&g.estimatedOnly){
        if(owner()!==user||!unchanged(reviewed)||groupSnapshot(g.id)!==g.before)
          return error('This payment or its items changed. Close and reopen this form.');
        return editPayment(g.id,rows);
      }
      if(!nameEl.readOnly)newName=nameEl.value;
      nameEl.readOnly=!!g;dateEl.readOnly=!!g;nameEl.value=g?g.name:newName;dateEl.value=g?g.date:defaultDate;
      document.getElementById('purchase-date-help').textContent=g?'Uses this payment’s existing date. Previously linked items keep their costs and dates.':'Confirm when you paid for this purchase. Each item keeps its original sourced and listed dates.';
      document.getElementById('purchase-link-total').textContent=g?'Add '+fmt(amount/100)+' · payment total '+fmt((g.total+amount)/100):'One payment · '+fmt(amount/100);
    };
    select.onchange();document.getElementById('purchase-cancel').onclick=function(){closePanel();};
    document.getElementById('purchase-link-save').onclick=function(){
      if(this.disabled)return;
      if(owner()!==user||!unchanged(reviewed))return error('These items or your signed-in account changed. Close and reopen this form.');
      var g=selected(),date=dateEl.value,name=nameEl.value.trim();
      if(select.value&&!g)return error('Choose an available payment.');
      if(!g&&rows.length<2)return error('Select at least two items for a new payment, or choose an existing purchase.');
      if(!name)return error('Give this purchase a name.');
      if(!_reportDateValid(date))return error('Choose a valid payment date.');
      if(g&&(g.estimatedOnly||groupSnapshot(g.id)!==g.before||date!==g.date))return error('That payment changed. Close and reopen this form.');
      var fresh=ids.map(_findItemRecordById);
      if(fresh.some(function(r){return !r||ownReason(r.item)||r.item.purchaseGroupId;}))return error('These items changed. Close and reopen this form.');
      var id=g?g.id:_newId('purchase');
      if(commit(fresh.map(function(r){return {item:r.item,values:{purchaseGroupId:id,purchaseGroupName:name,purchasePaidDate:date}};}),[],this))openPurchaseGroup(id);
    };
  };

  // Shared line editor conserves integer pennies for both new and existing lots.
  function lineEditor(options){
    var list=document.getElementById('purchase-lines'),seq=0;
    function allocation(){return Array.from(list.children).map(function(el){return {title:el.querySelector('[data-title]').value.trim(),cost:cents(el.querySelector('[data-cost]').value),category:el.querySelector('select').value,location:el.querySelector('input[id$="-location"]').value.trim()};});}
    function balance(){var amount=options.total(),sum=allocation().reduce(function(s,l){return s+(l.cost||0);},0);document.getElementById('purchase-balance').textContent=amount===null?'Enter the total paid.':fmt(sum/100)+' allocated · '+fmt((amount-sum)/100)+' remaining';}
    function add(title){
      if(list.children.length>=50){toast('Split up to 50 items at a time.','error');return;}
      var n=++seq,div=document.createElement('section');div.className='purchase-line';
      div.innerHTML='<h3>Item '+n+(options.split&&n===1?' · original record':'')+'</h3>'+field('Item title','purchase-title-'+n,title||'')+field('Allocated cost (£)','purchase-cost-'+n,'','number')+_stockDetailsFieldsHTML('purchase-'+n,options.details)+button('Remove item','purchase-remove-'+n);
      div.querySelector('#purchase-cost-'+n).dataset.cost='';div.querySelector('#purchase-title-'+n).dataset.title='';
      var remove=div.querySelector('button');if(options.split&&n===1)remove.hidden=true;
      remove.onclick=function(){if(list.children.length<=2){toast('A shared purchase needs at least two items.');return;}div.remove();balance();};
      list.append(div);div.addEventListener('input',balance);balance();
    }
    function equal(){var amount=options.total(),inputs=Array.from(list.querySelectorAll('[data-cost]'));if(amount===null)return error('Enter a valid total paid first.');_splitPennies(amount,inputs.length).forEach(function(n,k){inputs[k].value=(n/100).toFixed(2);});balance();}
    add(options.title||'');add(options.title?options.title+' - 2':'');
    document.getElementById('purchase-add').onclick=function(){add();};document.getElementById('purchase-split').onclick=equal;
    if(options.split)equal();
    return {allocation:allocation,balance:balance};
  }
  function validateLines(lines,amount){
    if(amount===null)return 'Enter a valid total with up to two decimal places.';
    if(lines.length<2||lines.length>50)return 'Enter between 2 and 50 items.';
    if(lines.some(function(l){return !l.title||l.cost===null;}))return 'Every item needs a title and a valid allocated cost.';
    if(lines.reduce(function(sum,l){return sum+l.cost;},0)!==amount)return 'Allocated costs must exactly match the total paid.';
    if(lines.some(function(l){return !ITEM_CATEGORIES.includes(l.category)||!l.location;}))return 'Every item needs a category and location.';
    return '';
  }
  function editorBody(){return '<div id="purchase-lines"></div><div class="purchase-actions">'+button('Add item','purchase-add')+button('Split equally','purchase-split')+'</div><p id="purchase-balance" class="purchase-summary" aria-live="polite"></p><p id="purchase-error" role="alert"></p><div class="purchase-actions">'+button('Cancel','purchase-cancel')+'<button type="button" class="btn btn-primary" id="purchase-save">Save purchase &amp; stock</button></div>';}
  function stockItem(line,values,gid){return Object.assign({id:_newId('sqa'),gid:'R-'+String(gid).padStart(4,'0'),item:line.title,state:'sourced',costPrice:line.cost/100,category:line.category,location:line.location,parts:[],returnHistory:[],refreshHistory:[],notes:'',dateListed:null,dateSold:null,salePrice:0,listingFee:0,postage:0,shippingCost:0,packagingCost:0,promoPercent:0,isReturned:false,grossProfit:null},values);}
  window.openNewPurchase=function(){
    var user=owner(),today=_todayISO();
    openPanel('New purchase','<label class="stock-purchase-choice"><input type="checkbox" id="purchase-multiple" checked><span><strong>Multiple items in one purchase</strong><span class="fg-hint">One payment, separate stock records.</span></span></label><p>Enter the total paid once, including purchase delivery and buyer fees. Allocate it across the separate items you will list.</p>'+field('Purchase name','purchase-name','')+field('Date sourced','purchase-date',today,'date')+field('Date paid','purchase-paid-date',today,'date')+field('Total paid (£)','purchase-total','','number')+editorBody());
    document.getElementById('purchase-multiple').onchange=async function(){
      const toggle=this,dirty=Array.from(document.querySelectorAll('#panel-content input:not([type=checkbox]):not([type=date])')).some(function(el){return el.value.trim();});
      if(dirty&&!await showConfirm('Switch to one item?','The unsaved purchase fields will be cleared. No stock or payment has been saved.',{okLabel:'Switch to one item',danger:false})){toggle.checked=true;return;}
      openStockQuickAdd();
    };
    var editor=lineEditor({total:function(){return cents(document.getElementById('purchase-total').value);}});
    var sourceEl=document.getElementById('purchase-date'),paidEl=document.getElementById('purchase-paid-date'),paidTouched=false;
    paidEl.oninput=function(){paidTouched=true;};
    sourceEl.onchange=function(){if(!paidTouched)paidEl.value=sourceEl.value;};
    document.getElementById('purchase-total').oninput=editor.balance;document.getElementById('purchase-cancel').onclick=function(){closePanel();};
    document.getElementById('purchase-save').onclick=function(){
      if(this.disabled)return;
      if(owner()!==user)return error('Your signed-in account changed. Close and reopen this form.');
      var name=document.getElementById('purchase-name').value.trim(),date=sourceEl.value,payment=paidEl.value,amount=cents(document.getElementById('purchase-total').value),lines=editor.allocation();
      var reason=!name?'Give this purchase a name.':!_reportDateValid(date)?'Choose a valid sourced date.':!_reportDateValid(payment)?'Choose a valid payment date.':validateLines(lines,amount);
      if(reason)return error(reason);
      var id=_newId('purchase'),month=monthKeyFromDate(date),gid=getNextGID();
      var creates=lines.map(function(l,n){var item=stockItem(l,{dateSourced:date,purchasePaidDate:payment,purchaseGroupId:id,purchaseGroupName:name,defaultPlatform:DEFAULT_PLATFORM},gid+n);_autoTagToActiveRun(item);return {month:month,item:item};});
      if(commit([],creates,this))openPurchaseGroup(id);
    };
  };

  window.openPurchaseSplit=function(id){
    var record=_findItemRecordById(id),source=record&&record.item,reason=splitReason(source);
    if(reason){toast(reason,'error');return;}
    var user=owner(),reviewed=review([record]),amount=itemCost(source),groupId=source.purchaseGroupId,groupBefore=groupId?groupSnapshot(groupId):null;
    openPanel('Split purchase','<p>Turn this bundle into separately listed stock. Allocate its existing '+fmt(amount/100)+' purchase cost across the items.</p>'+field('Purchase name','purchase-split-name',groupId?groupName(members(groupId)):source.item)+'<p class="fg-hint">The first item keeps this record’s listing, repair costs and history. New items start as Unlisted. Existing payment and sourced dates are preserved; estimates are divided equally.</p>'+editorBody());
    if(groupId)document.getElementById('purchase-split-name').readOnly=true;
    var editor=lineEditor({split:true,title:source.item,details:source,total:function(){return amount;}});
    document.getElementById('purchase-save').textContent='Split purchase';document.getElementById('purchase-cancel').onclick=function(){closePanel();};
    document.getElementById('purchase-save').onclick=function(){
      if(this.disabled)return;
      var fresh=_findItemRecordById(id);
      if(owner()!==user||!unchanged(reviewed)||groupId&&groupSnapshot(groupId)!==groupBefore)return error('This item or purchase changed. Close and reopen this form.');
      var reason=splitReason(fresh&&fresh.item);if(reason)return error(reason);
      var name=document.getElementById('purchase-split-name').value.trim(),lines=editor.allocation();
      reason=!name?'Give this purchase a name.':validateLines(lines,amount);if(reason)return error(reason);
      source=fresh.item;var shared=groupId||_newId('purchase'),gid=getNextGID();
      var currentAsking=_itemLifecycleState(source)==='listed'&&Number(source.salePrice)>0;
      var estimate=currentAsking?Math.round(Number(source.salePrice)*100):Number(source.estSalePrice)>0?Math.round(Number(source.estSalePrice)*100):0;
      var estimates=_splitPennies(estimate,lines.length),asking=Number(source.salePrice)>0?_splitPennies(Math.round(Number(source.salePrice)*100),lines.length):null;
      var values={item:lines[0].title,costPrice:lines[0].cost/100,category:lines[0].category,location:lines[0].location,purchaseGroupId:shared,purchaseGroupName:name};
      if(estimate)values.estSalePrice=estimates[0]/100;if(asking)values.salePrice=asking[0]/100;
      var creates=lines.slice(1).map(function(l,n){return {month:fresh.month,item:stockItem(l,{dateSourced:source.dateSourced||null,purchasePaidDate:source.purchasePaidDate||null,purchaseGroupId:shared,purchaseGroupName:name,source:source.source||'',notes:source.notes||'',condition:source.condition||'',defaultPlatform:source.defaultPlatform||DEFAULT_PLATFORM,sourcingRunId:source.sourcingRunId||null,estSalePrice:estimates[n+1]/100},gid+n)};});
      if(commit([{item:source,values:values}],creates,this))openPurchaseGroup(shared);
    };
  };

  window.renderPurchaseItemLink=function(m,id){
    var r=_findItemRecordById(id),page=document.getElementById('p-item');if(!r||!page)return;window._purchaseItemContext={month:m,id:id};
    var old=page.querySelector('.purchase-item-link');if(old)old.remove();
    if(!r.item.purchaseGroupId&&ownReason(r.item))return;
    var b=document.createElement('button');b.className='btn btn-secondary purchase-item-link';b.textContent=r.item.purchaseGroupId?'Purchase · '+(r.item.purchaseGroupName||'Shared purchase'):'Assign to payment';
    b.onclick=function(){if(r.item.purchaseGroupId)openPurchaseGroup(r.item.purchaseGroupId);else openPurchaseLink([id]);};
    var anchor=page.querySelector('.ip-title');if(anchor)anchor.after(b);else{
      var back=page.querySelector('button[onclick="exitItemPage()"]');
      if(back){var nav=back.closest('.purchase-item-nav');if(!nav){nav=document.createElement('div');nav.className='purchase-item-nav';back.before(nav);nav.append(back);}b.title=b.textContent;nav.append(b);}
      else (page.firstElementChild||page).append(b);
    }
  };
})();
