/* RETRADE native gesture v3 revealed-action bridge.
 * Full swipes are owned by gesture-native-v3.js. This bridge makes a partial
 * reveal useful as well: tap the revealed lifecycle or Delete action.
 */
(function(){
  'use strict';
  function info(row){
    if(!row)return null;var id='',month='';
    var dd=row.querySelector('.ddwrap[id^="dd-"],[id^="dd-"]');if(dd&&dd.id.indexOf('dd-')===0)id=dd.id.slice(3);
    var code=String(row.getAttribute('onclick')||''),m=code.match(/openItemPage\(['\"]([^'\"]+)['\"],['\"]([^'\"]+)['\"]/);if(m){month=m[1];if(!id)id=m[2];}
    try{if(id&&typeof _findItemRecordById==='function'){var r=_findItemRecordById(id);if(r)return {id:id,month:r.month||month,item:r.item};}}catch(_){}
    try{if(id&&month&&typeof DB!=='undefined'){var it=(DB[month]||[]).find(function(x){return x.id===id;});if(it)return {id:id,month:month,item:it};}}catch(_){}
    return null;
  }
  function state(x){
    if(!x||!x.item)return '';
    try{if(typeof _itemLifecycleState==='function')return _itemLifecycleState(x.item);}catch(_){}
    if(x.item.isReturned)return 'returned';if(x.item.dateSold||x.item.resaleSalePrice)return 'sold';return x.item.state==='sourced'?'sourced':'listed';
  }
  function close(row){
    if(!row)return;row.style.setProperty('--rt-v3-x','0px');row.classList.remove('rt-v3-ready-primary','rt-v3-ready-delete');
    var rail=row.querySelector(':scope > .rt-v3-rail');if(rail)Array.prototype.forEach.call(rail.children,function(x){x.style.pointerEvents='none';});
  }
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('.rt-v3-action'):null;if(!a)return;
    var row=a.closest('.item-row'),x=info(row);if(!row||!x)return;
    e.preventDefault();e.stopImmediatePropagation();close(row);
    setTimeout(function(){
      try{
        if(a.classList.contains('trailing')){if(typeof deleteItem==='function')deleteItem(x.month,x.id);return;}
        var s=state(x);
        if(s==='sourced'&&typeof openListFromSourced==='function')openListFromSourced(x.month,x.id);
        else if(s==='listed'&&typeof markSold==='function')markSold(x.month,x.id);
        else if(s==='sold'&&typeof openReturn==='function')openReturn(x.month,x.id);
        else if(s==='returned'&&typeof openRelist==='function')openRelist(x.month,x.id);
      }catch(err){console.warn('[RETRADE] revealed gesture action failed',err);}
    },120);
  },true);
})();
