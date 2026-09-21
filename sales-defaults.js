/* RETRADE Sales default-route refinement v1.5.20
 *
 * Core owns startup/reload restoration of the exact Sales sub-route.
 * This file only applies the "come back to the current month after a long break"
 * convenience during an already-running session. It MUST NOT change MONTHLY_VIEW
 * while cold boot hydration is painting its destination layout.
 */
(function(){
  'use strict';

  var IDLE_RESET_MS=15*60*1000;
  var LEFT_KEY='rt-sales-left-at-v1';
  var HIDDEN_KEY='rt-sales-hidden-at-v1';

  function wallNow(){return Date.now();}
  function activePageId(){var p=document.querySelector('.page.on');return p?p.id:'';}
  function currentMonth(){try{return typeof currentMonthKey==='function'?currentMonthKey():'';}catch(_){return '';}}
  function setStamp(key,value){try{sessionStorage.setItem(key,String(value));}catch(_){} }
  function getStamp(key){try{var v=Number(sessionStorage.getItem(key)||0);return isFinite(v)?v:0;}catch(_){return 0;}}
  function clearStamp(key){try{sessionStorage.removeItem(key);}catch(_){} }
  function contextualMonthOpen(){try{return !!_monthOpenFromContext;}catch(_){return false;}}

  function forceMonthly(){
    try{MONTHLY_VIEW='detail';}catch(_){}
    try{SELECTED_MONTH=currentMonth()||SELECTED_MONTH;}catch(_){}
    try{if(typeof _saveUIState==='function')_saveUIState();}catch(_){}
  }

  function renderMonthlyIfVisible(){
    if(activePageId()!=='p-monthly')return;
    try{if(typeof renderMonthlyPage==='function')renderMonthlyPage();}catch(_){}
  }

  /* Do not mutate anything on module load. The cold-start renderer has already
     selected the exact persisted route and may currently be skeletonising it. */

  try{
    if(typeof goToTab==='function'){
      var nativeGoToTab=goToTab;
      goToTab=function(name,sourceEl){
        var before=activePageId();
        if(before==='p-monthly'&&name!=='monthly')setStamp(LEFT_KEY,wallNow());

        if(name==='monthly'&&before!=='p-monthly'&&!contextualMonthOpen()){
          var leftAt=getStamp(LEFT_KEY);
          if(leftAt&&wallNow()-leftAt>=IDLE_RESET_MS)forceMonthly();
          clearStamp(LEFT_KEY);
        }
        return nativeGoToTab.apply(this,arguments);
      };
    }
  }catch(_){}

  try{
    document.addEventListener('visibilitychange',function(){
      if(document.hidden){
        if(activePageId()==='p-monthly')setStamp(HIDDEN_KEY,wallNow());
        return;
      }
      var hiddenAt=getStamp(HIDDEN_KEY);clearStamp(HIDDEN_KEY);
      if(activePageId()==='p-monthly'&&hiddenAt&&wallNow()-hiddenAt>=IDLE_RESET_MS){
        forceMonthly();
        renderMonthlyIfVisible();
      }
    },{passive:true});
  }catch(_){}

  console.info('[RETRADE] v1.5.20 Sales route defaults loaded');
})();