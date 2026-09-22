/* RETRADE Sales default-route refinement v1.5.47
 *
 * Normal navigation to Sales always opens the current month detail. Explicit
 * contextual month opens remain authoritative. Cold-boot hydration is left
 * untouched so startup can finish its truth/loading contract without a route race.
 */
(function(){
  'use strict';

  function activePageId(){var p=document.querySelector('.page.on');return p?p.id:'';}
  function currentMonth(){try{return typeof currentMonthKey==='function'?currentMonthKey():'';}catch(_){return '';}}
  function contextualMonthOpen(){try{return !!_monthOpenFromContext;}catch(_){return false;}}

  function forceMonthly(){
    try{MONTHLY_VIEW='detail';}catch(_){}
    try{SELECTED_MONTH=currentMonth()||SELECTED_MONTH;}catch(_){}
    try{if(typeof _saveUIState==='function')_saveUIState();}catch(_){}
  }

  try{
    if(typeof goToTab==='function'){
      var nativeGoToTab=goToTab;
      goToTab=function(name,sourceEl){
        var before=activePageId();
        if(name==='monthly'&&before!=='p-monthly'&&!contextualMonthOpen())forceMonthly();
        return nativeGoToTab.apply(this,arguments);
      };
    }
  }catch(_){}

  console.info('[RETRADE] v1.5.47 Sales defaults: normal entry opens current month');
})();