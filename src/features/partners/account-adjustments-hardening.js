/* RETRADE partner account adjustment reconciliation hardening — v1.4.81 */
(function(){
  'use strict';
  if(window.__rtPartnerAccountAdjustmentsHardeningReady)return;
  window.__rtPartnerAccountAdjustmentsHardeningReady=true;

  function round(v){return Math.round((Number(v)||0)*100)/100;}
  function key(r){return String(r&&r.itemId)+'::'+Math.max(1,Number(r&&r.saleCycle)||1);}

  var adjusted=window.__rtBuildPartnerStatementV3Adjusted;
  if(typeof adjusted!=='function')return;

  window.__rtBuildPartnerStatementV3Adjusted=function(accountId,period){
    var s=adjusted(accountId,period);
    var base=window.__rtBuildPartnerStatementV3Base;
    if(!s||typeof base!=='function'||!s.totals)return s;

    var original;
    try{original=base(accountId,period);}catch(_){return s;}
    var byKey=Object.create(null);
    (original.sales||[]).forEach(function(r){byKey[key(r)]=r;});

    var rowCredits=0;
    (s.sales||[]).forEach(function(r){
      var source=byKey[key(r)];if(!source)return;
      var requested=Math.max(0,-Number(r.accountAdjustment||0));
      var grossPartner=Math.max(0,Number(source.partnerAmount)||0);
      var applied=Math.min(requested,grossPartner);
      r.accountAdjustment=round(-applied);
      r.partnerAmount=round(Math.max(0,grossPartner-applied));
      r.retrade=round((Number(r.preDistribution)||0)-r.partnerAmount);
      r.partnerPct=r.preDistribution!==0?round(r.partnerAmount/r.preDistribution*100):null;
      r.retradePct=r.preDistribution!==0?round(r.retrade/r.preDistribution*100):null;
      rowCredits=round(rowCredits+applied);
    });

    // Only the part of a credit that can actually reduce partner earnings may
    // increase RETRADE profit in this statement. Any excess remains an unused
    // account credit for future liabilities rather than becoming fake income.
    var grossPartnerEarned=Math.max(0,round(Number(s.totals.grossPartnerEarned)||0));
    var netPartnerEarned=Math.max(0,round(Number(s.totals.partnerEarned)||0));
    var effectiveCredit=Math.max(0,round(grossPartnerEarned-netPartnerEarned));
    var accountLevelCredit=Math.max(0,round(effectiveCredit-rowCredits));
    var requestedCredit=Math.max(0,round(-Number(s.totals.partnerAdjustment||0)));
    s.unusedAdjustmentCredit=Math.max(0,round(requestedCredit-effectiveCredit));

    var rowNet=round((s.sales||[]).reduce(function(sum,r){return sum+(Number(r.retrade)||0);},0)
      +(s.adjustments||[]).filter(function(a){return !a.matched;}).reduce(function(sum,a){return sum+(Number(a.profitImpact)||0);},0)
      +accountLevelCredit);

    s.accountLevelAdjustment=accountLevelCredit;
    s.totals.reconciledItemNet=rowNet;
    s.totals.reconciliationDifference=round((Number(s.totals.retradeEarned)||0)-rowNet);
    if(Math.abs(s.totals.reconciliationDifference)>0.01){
      console.error('[RETRADE] account-adjusted statement reconciliation mismatch',{
        account:accountId,period:period,difference:s.totals.reconciliationDifference,
        retrade:s.totals.retradeEarned,rowNet:rowNet,accountLevelCredit:accountLevelCredit,
        unusedAdjustmentCredit:s.unusedAdjustmentCredit
      });
    }
    return s;
  };

  console.info('[RETRADE] partner account adjustment reconciliation hardening loaded');
})();
