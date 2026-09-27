/* Cashflow is a view of source records. Inspect any movement; edit its owner
   so the ledger, item costs and partner allocations continue to reconcile. */
(function(){
  'use strict';
  function e(value){return esc(String(value==null?'':value));}
  function row(label,value){return '<div class="rt-transaction-fact"><dt>'+e(label)+'</dt><dd>'+e(value)+'</dd></div>';}
  function typeLabel(value){return (typeof CASH_TYPES!=='undefined'&&CASH_TYPES[value]&&CASH_TYPES[value].label)||String(value||'Cash movement').replace(/_/g,' ');}
  function button(label,id,primary){return '<button type="button" class="btn '+(primary?'btn-primary':'btn-secondary')+'" id="'+id+'">'+e(label)+'</button>';}

  window.openCashflowTransaction=function(eventId){
    var movement=_cashEventsAll().find(function(x){return String(x.id)===String(eventId);});
    if(!movement){toast('This movement has changed. Cashflow has been refreshed.');renderCash();return;}
    if(movement.source==='settlement'){
      var matches=[];
      (_accounts||[]).forEach(function(account){(account.settlements||[]).forEach(function(tx){
        if('settlement:'+tx.id===String(eventId))matches.push({account:account,tx:tx});
      });});
      if(matches.length===1){_openSettlementDetail(matches[0].account.id,matches[0].tx.id);return;}
    }
    var action=null,actionLabel='',details='',explanation='';
    if(movement.editableId){
      actionLabel='Edit entry';action=function(){editCashMove(movement.editableId);};
      explanation='This is a manually recorded cash movement.';
    }else if(movement.itemId){
      var record=_findItemRecordById(movement.itemId);
      if(record){
        details+=row('Item',record.item.item||'Untitled item');
        if(movement.saleNo)details+=row('Sale cycle',movement.saleNo);
        actionLabel='View / edit item';action=function(){closePanel();openItemPage(record.month,record.item.id,'p-cash');};
        explanation='This movement follows the item record. Open the item to review its costs, sale or return and make changes there.';
      }
    }else if(movement.type==='expense'){
      var expenseIndex=(DB.expenses||[]).findIndex(function(x){return 'expense:'+x.id===String(eventId);});
      if(expenseIndex>=0){
        var expense=DB.expenses[expenseIndex];details+=row('Category',typeof _expenseCanonLabel==='function'?_expenseCanonLabel(expense.category):expense.category);
        actionLabel='Edit expense';action=function(){editExpense(expenseIndex);};
        explanation='Changes to this expense also update Cashflow.';
      }
    }else if(movement.type==='trip_expense'){
      (DB.trips||[]).forEach(function(trip,index){(trip.expenses||[]).forEach(function(extra,extraIndex){
        if('tripexp:'+trip.id+':'+extraIndex!==String(eventId))return;
        details+=row('Trip',trip.description||'Sourcing trip')+row('Cost',extra.desc||extra.description||'Trip expense');
        actionLabel='Edit trip costs';action=function(){editTrip(index);};
        explanation='This is a cash cost recorded on the trip. Open the trip to amend its costs.';
      });});
    }
    if(!action)explanation='The source record is unavailable. These recorded details are shown for reference.';
    var isOut=movement.direction==='out';
    var html='<div class="rt-transaction-hero"><div class="rt-transaction-eyebrow">'+(isOut?'Money out':'Money in')+'</div><div class="rt-transaction-amount '+(isOut?'out':'in')+'">'+(isOut?'−':'+')+e(fmt(movement.amount))+'</div><div class="rt-transaction-description">'+e(movement.description||typeLabel(movement.type))+'</div></div>'+
      '<dl class="rt-transaction-facts">'+row('Date',movement.date||'Not recorded')+row('Type',typeLabel(movement.type))+details+'</dl>'+
      '<p class="rt-transaction-help">'+e(explanation)+'</p><div class="rt-transaction-actions">'+(action?button(actionLabel,'cash-transaction-edit',true):'')+button('Close','cash-transaction-close',false)+'</div>';
    openPanel('Transaction details',html);
    document.getElementById('cash-transaction-close').onclick=closePanel;
    if(action)document.getElementById('cash-transaction-edit').onclick=action;
  };
})();
