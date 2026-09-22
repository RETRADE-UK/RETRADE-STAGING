/* RETRADE partner arrangements v2 — v1.4.75
 * Canonical commercial model:
 *   fixed_cost   -> agreed £ amount per item; timing upfront or on_sale
 *   profit_share -> agreed % of distributable margin; payable on sale
 *
 * SAFETY RULE: canonical arrangement fields are additive. Existing legacy
 * supplier/consignment item mechanics remain untouched because they already
 * encode historical P&L, settlement and cashflow correctly. This module never
 * rewrites settlements, item assignments, accountSettled flags or cash ledger.
 */
(function(){
  'use strict';
  if(window.__rtPartnerArrangementsV2Ready)return;
  window.__rtPartnerArrangementsV2Ready=true;

  function num(v){v=Number(v);return isFinite(v)?v:null;}
  function model(v){return v==='fixed_cost'||v==='profit_share'?v:null;}
  function timing(v){return v==='upfront'||v==='on_sale'?v:null;}
  function acctById(id){try{return (_accounts||[]).find(function(a){return a&&String(a.id)===String(id);})||null;}catch(_){return null;}}

  function accountModel(a){
    if(!a)return 'fixed_cost';
    var direct=model(a.arrangementModel)||model(a.arrangement_model);
    if(direct)return direct;
    return String(a.accountType||a.account_type||'supplier').toLowerCase()==='supplier'?'fixed_cost':'profit_share';
  }
  function payTiming(a){
    if(!a)return 'upfront';
    if(accountModel(a)==='profit_share')return 'on_sale';
    return timing(a.paymentTiming)||timing(a.payment_timing)||timing(a.paymentTerms)||'upfront';
  }
  function hasCanonicalAccountModel(a){return !!(a&&(model(a.arrangementModel)||model(a.arrangement_model)));}

  function itemModel(i,a){
    a=a||acctById(i&&i.accountId);
    if(!i)return accountModel(a);
    var direct=model(i.arrangementModelOverride)||model(i.arrangement_model_override);
    if(direct)return direct;

    var am=accountModel(a);
    if(hasCanonicalAccountModel(a)){
      // Once an account has a canonical model, inherit it unless the item has
      // strong evidence of a deliberate per-item exception. This prevents old
      // account_item_type='consignment' rows from misclassifying fixed payouts.
      if(am==='fixed_cost'){
        if(i.accountSplitPercent!=null)return 'profit_share';
        return 'fixed_cost';
      }
      // Profit-share accounts only become fixed-cost per item when an explicit
      // canonical agreed amount exists, or a legacy supplier override carries
      // a real fixed cost. Historical paid amounts on sold profit-share items
      // are settlements, not evidence that the arrangement was fixed-cost.
      if(i.partnerAgreedAmount!=null||i.partner_agreed_amount!=null)return 'fixed_cost';
      var legacyType=String(i.accountType||i.account_item_type||'').toLowerCase();
      if(legacyType==='supplier'&&((num(i.costPrice)||0)>0))return 'fixed_cost';
      return 'profit_share';
    }

    var legacy=String(i.accountType||i.account_item_type||'').toLowerCase();
    if(legacy==='supplier')return 'fixed_cost';
    if(legacy==='consignment'||legacy==='hybrid')return 'profit_share';
    return am;
  }

  function agreed(i,a){
    if(!i||itemModel(i,a)!=='fixed_cost')return null;
    var vals=[i.partnerAgreedAmount,i.partner_agreed_amount,i.accountPaidAmount,i.account_paid_amount,i.costPrice,i.cost_price];
    for(var x=0;x<vals.length;x++){
      var n=num(vals[x]);
      if(n!=null&&n>=0&&(n>0||x<2))return Math.round(n*100)/100;
    }
    return 0;
  }
  function split(i,a){
    if(itemModel(i,a)!=='profit_share')return null;
    var n=i&&i.accountSplitPercent!=null?num(i.accountSplitPercent):null;
    if(n==null&&a&&a.defaultSplitPercent!=null)n=num(a.defaultSplitPercent);
    return n==null?null:Math.max(0,Math.min(100,n));
  }
  function label(a){
    if(accountModel(a)==='profit_share'){
      var p=split(null,a);
      return 'Profit share'+(p!=null?' · '+(p%1?p.toFixed(1):p.toFixed(0))+'%':'');
    }
    return 'Fixed cost · '+(payTiming(a)==='on_sale'?'Pay when sold':'Paid upfront');
  }

  window._rtArrangementForAccount=accountModel;
  window._rtArrangementForItem=itemModel;
  window._rtPartnerPaymentTiming=payTiming;
  window._rtPartnerAgreedAmount=agreed;
  window._rtPartnerSharePercent=split;
  window._rtArrangementLabel=label;

  /* Additive Supabase mapping. Never rewrite legacy compatibility fields on a
     normal save: old rows can legitimately use different legacy mechanics to
     represent the same canonical arrangement. */
  try{
    if(typeof _accountToRow==='function'&&!_accountToRow.__rtArrangementV2){
      var a2r=_accountToRow;
      _accountToRow=function(a){
        var r=a2r.apply(this,arguments)||{};
        r.arrangement_model=accountModel(a);
        r.payment_timing=payTiming(a);
        if(a&&a.__rtPreserveLegacyType&&a.__rtLegacyAccountType)r.account_type=a.__rtLegacyAccountType;
        return r;
      };
      _accountToRow.__rtArrangementV2=true;
    }
    if(typeof _rowToAccount==='function'&&!_rowToAccount.__rtArrangementV2){
      var r2a=_rowToAccount;
      _rowToAccount=function(r){
        var a=r2a.apply(this,arguments);if(!a)return a;
        a.arrangementModel=model(r&&r.arrangement_model)||accountModel(a);
        a.paymentTiming=timing(r&&r.payment_timing)||payTiming(a);
        // The old debt engine already understands supplier paymentTerms.
        a.paymentTerms=a.arrangementModel==='profit_share'?'on_sale':a.paymentTiming;
        return a;
      };
      _rowToAccount.__rtArrangementV2=true;
    }
    if(typeof _itemToRow==='function'&&!_itemToRow.__rtArrangementV2){
      var i2r=_itemToRow;
      _itemToRow=function(i,mth){
        var r=i2r.apply(this,arguments)||{},a=acctById(i&&i.accountId);
        var ov=model(i&&i.arrangementModelOverride)||model(i&&i.arrangement_model_override);
        if(!ov&&i&&a){
          var inferred=itemModel(i,a),base=accountModel(a);
          if(inferred!==base)ov=inferred;
        }
        r.arrangement_model_override=ov||null;
        var amt=i&&i.partnerAgreedAmount!=null?num(i.partnerAgreedAmount):(i&&i.partner_agreed_amount!=null?num(i.partner_agreed_amount):null);
        if(amt==null&&itemModel(i,a)==='fixed_cost'){
          // Preserve the explicit fixed amount separately without changing the
          // historical costPrice/accountPaidAmount representation.
          amt=agreed(i,a);
        }
        r.partner_agreed_amount=amt;
        return r;
      };
      _itemToRow.__rtArrangementV2=true;
    }
    if(typeof _rowToItem==='function'&&!_rowToItem.__rtArrangementV2){
      var r2i=_rowToItem;
      _rowToItem=function(r){
        var i=r2i.apply(this,arguments);if(!i)return i;
        i.arrangementModelOverride=model(r&&r.arrangement_model_override);
        i.partnerAgreedAmount=r&&r.partner_agreed_amount!=null?Number(r.partner_agreed_amount):null;
        return i;
      };
      _rowToItem.__rtArrangementV2=true;
    }
  }catch(e){console.warn('[RETRADE] arrangement mapper patch skipped',e);}

  // Keep the proven legacy P&L engine untouched. Only debt timing needs the
  // canonical setting so fixed-cost/pay-on-sale behaves like Matt's account.
  try{
    if(typeof _accountPaysOnSale==='function'){
      _accountPaysOnSale=function(a){return accountModel(a)==='profit_share'||payTiming(a)==='on_sale';};
      _accountPaysOnSale.__rtArrangementV2=true;
    }
  }catch(_){}

  /* Account create/edit UI: two economic arrangements only. Build the legacy
     form using a presentation clone so old compatibility account_type values
     cannot make a fixed-cost account appear as profit share. */
  try{
    if(typeof _accountModalFields==='function'&&!_accountModalFields.__rtArrangementV2){
      var baseFields=_accountModalFields;
      _accountModalFields=function(a){
        var view=a?Object.assign({},a):a;
        if(view){
          view.accountType=accountModel(a)==='fixed_cost'?'supplier':'consignment';
          view.paymentTerms=payTiming(a);
        }
        return (baseFields.call(this,view)||'')
          .replace(/Supplier — you pay upfront, no ongoing split/g,'Fixed cost — agreed £ amount per item')
          .replace(/Consignment — they supply, you split profit after sale/g,'Profit share — agreed % of net margin')
          .replace(/<option value="hybrid"[\s\S]*?<\/option>/g,'');
      };
      _accountModalFields.__rtArrangementV2=true;
    }
    if(typeof _accountTypeDisplay==='function')_accountTypeDisplay=function(a){return label(a);};
    if(typeof _accTypeChange==='function'&&!_accTypeChange.__rtArrangementV2){
      var baseTypeChange=_accTypeChange;
      _accTypeChange=function(v){
        var r=baseTypeChange.apply(this,arguments),h=document.getElementById('acc-type-hint');
        if(h){
          if(v==='supplier')h.textContent='Fixed cost: agree what this person receives for each item, then choose whether it is due upfront or only when the item sells.';
          else if(v==='consignment')h.textContent='Profit share: the agreed percentage is taken from margin after RETRADE selling, delivery, packaging and item-related costs.';
        }
        return r;
      };
      _accTypeChange.__rtArrangementV2=true;
    }
    if(typeof submitEditAccount==='function'&&!submitEditAccount.__rtArrangementV2){
      var baseEdit=submitEditAccount;
      submitEditAccount=function(id){
        var a=acctById(id),previous=a?accountModel(a):null,legacy=a&&a.accountType;
        var typeEl=document.getElementById('acc-type'),selected=typeEl&&typeEl.value==='consignment'?'profit_share':'fixed_cost';
        if(a){
          a.arrangementModel=selected;
          a.paymentTiming=selected==='profit_share'?'on_sale':(((document.getElementById('acc-terms')||{}).value)||'upfront');
          a.paymentTerms=selected==='profit_share'?'on_sale':a.paymentTiming;
          if(previous===selected){a.__rtPreserveLegacyType=true;a.__rtLegacyAccountType=legacy;}
        }
        var result=baseEdit.apply(this,arguments);
        if(a&&a.__rtPreserveLegacyType)a.accountType=legacy;
        if(a){delete a.__rtPreserveLegacyType;delete a.__rtLegacyAccountType;}
        return result;
      };
      submitEditAccount.__rtArrangementV2=true;
    }
  }catch(e){console.warn('[RETRADE] arrangement form patch skipped',e);}

  function normalise(){
    try{(_accounts||[]).forEach(function(a){
      if(!a)return;
      a.arrangementModel=model(a.arrangementModel)||accountModel(a);
      a.paymentTiming=timing(a.paymentTiming)||payTiming(a);
      a.paymentTerms=a.arrangementModel==='profit_share'?'on_sale':a.paymentTiming;
    });}catch(_){}
  }

  async function hydrate(){
    normalise();
    try{
      if(typeof _sb==='undefined'||typeof _currentUserId==='undefined'||!_currentUserId)return;
      var ar=await _sb.from('accounts').select('id,arrangement_model,payment_timing').eq('user_id',_currentUserId);
      if(!ar.error&&Array.isArray(ar.data))ar.data.forEach(function(r){
        var a=acctById(r.id);if(!a)return;
        a.arrangementModel=model(r.arrangement_model)||accountModel(a);
        a.paymentTiming=timing(r.payment_timing)||payTiming(a);
        a.paymentTerms=a.arrangementModel==='profit_share'?'on_sale':a.paymentTiming;
      });
      var ir=await _sb.from('items').select('id,arrangement_model_override,partner_agreed_amount').eq('user_id',_currentUserId);
      if(!ir.error&&Array.isArray(ir.data)){
        var map={};ir.data.forEach(function(r){map[String(r.id)]=r;});
        (typeof allDBKeys==='function'?allDBKeys():[]).forEach(function(k){(DB[k]||[]).forEach(function(i){
          var r=map[String(i.id)];if(!r)return;
          i.arrangementModelOverride=model(r.arrangement_model_override);
          i.partnerAgreedAmount=r.partner_agreed_amount!=null?Number(r.partner_agreed_amount):null;
        });});
      }
      try{if(typeof renderAccounts==='function')renderAccounts();}catch(_){}
    }catch(e){console.warn('[RETRADE] arrangement hydration skipped',e);}
  }

  function polish(root){
    root=root||document;
    var s=root.querySelector&&root.querySelector('#acc-type');
    if(s){
      Array.from(s.options||[]).forEach(function(o){
        if(o.value==='supplier')o.textContent='Fixed cost — agreed £ amount per item';
        if(o.value==='consignment')o.textContent='Profit share — agreed % of net margin';
        if(o.value==='hybrid')o.remove();
      });
      var lbl=s.closest('.fg')&&s.closest('.fg').querySelector('label');if(lbl)lbl.childNodes[0].nodeValue='Stock arrangement ';
    }
    var termsLabel=root.querySelector&&root.querySelector('#acc-terms-row label');if(termsLabel)termsLabel.textContent='When does the fixed amount become payable?';
    var itemType=root.querySelector&&root.querySelector('#item-type-override');
    if(itemType)Array.from(itemType.options||[]).forEach(function(o){
      if(o.value==='supplier')o.textContent='Fixed cost — agreed £ amount';
      if(o.value==='consignment')o.textContent='Profit share — % of net margin';
      if(o.value==='hybrid')o.remove();
      if(o.value==='')o.textContent=o.textContent.replace('Supplier','Fixed cost').replace('Consignment','Profit share').replace('Hybrid','Profit share');
    });

    root.querySelectorAll&&root.querySelectorAll('.rt-partner-terms').forEach(function(box){
      var a=acctById(box.getAttribute('data-account-id'));if(!a)return;
      var m=accountModel(a),title=box.querySelector('.rt-partner-terms-title');
      if(title)title.textContent=m==='fixed_cost'?'Fixed cost for this item':'Profit share for this item';
      var mode=box.querySelector('#rt-partner-mode');
      if(m==='profit_share'){
        if(mode)mode.value='percent';
        box.querySelectorAll('[data-mode="fixed"],#rt-partner-fixed-wrap').forEach(function(el){el.remove();});
        var p=box.querySelector('[data-mode="percent"]');if(p){p.textContent='Profit share %';p.classList.add('on');p.setAttribute('aria-pressed','true');}
        var h=box.querySelector('.rt-partner-term-hint');if(h)h.textContent='Percentage of margin after RETRADE selling, delivery, packaging and item-related costs.';
      }else{
        if(mode)mode.value='fixed';
        box.querySelectorAll('[data-mode="percent"],#rt-partner-percent-wrap').forEach(function(el){el.remove();});
        var f=box.querySelector('[data-mode="fixed"]');if(f){f.textContent='Fixed amount';f.classList.add('on');f.setAttribute('aria-pressed','true');}
        var fw=box.querySelector('#rt-partner-fixed-wrap');if(fw)fw.style.display='grid';
        var l=fw?fw.querySelector('label'):box.querySelector('label');if(l)l.innerHTML='Agreed amount (£) <span style="font-weight:400;">optional override</span>';
        var h2=box.querySelector('.rt-partner-term-hint');if(h2)h2.textContent='Leave blank to use the item buy price or existing agreed amount.';
      }
    });
  }

  // Arrangement controls only live in these hosts. Dashboard SVG/KPI mutations
  // must not wake partner-form work on every animation frame.
  try{var formObserver=new MutationObserver(function(rs){rs.forEach(function(r){r.addedNodes&&r.addedNodes.forEach(function(n){if(n&&n.nodeType===1)polish(n);});});});
    ['panel-content','p-item','p-accounts'].forEach(function(id){var host=document.getElementById(id);if(host)formObserver.observe(host,{childList:true,subtree:true});});
  }catch(_){}
  polish(document);normalise();setTimeout(hydrate,0);setTimeout(hydrate,1200);
  console.info('[RETRADE] fixed-cost / profit-share arrangements v1.4.75 loaded safely');
})();