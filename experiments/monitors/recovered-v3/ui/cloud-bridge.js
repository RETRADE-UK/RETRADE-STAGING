// ============================================================================
// RETRADE MONITORS — Supabase bridge
// ----------------------------------------------------------------------------
// Monitors UI lives in monitors.js, but RETRADE's existing architecture keeps
// every Supabase call in THIS file. This bridge is the only cloud surface the
// Monitors module can see. If the migration has not been applied yet, callers
// receive {ok:false, reason:'schema_missing'} and remain safely on localStorage.
// ============================================================================
function _monitorSchemaMissing(err){
  if(!err)return false;
  const code=String(err.code||'');
  const msg=String(err.message||'').toLowerCase();
  return code==='42P01'||code==='PGRST205'||msg.includes('does not exist')||msg.includes('schema cache');
}
function _monitorJsonArray(v){
  return Array.isArray(v)?v:[];
}
function _monitorRowToClient(r){
  if(!r)return null;
  return {
    id:r.id,
    name:r.name||'Monitor',
    platform:r.platform||'vinted',
    enabled:r.enabled!==false,
    archived:r.archived===true,
    templateKey:r.template_key||'blank',
    category:r.category||'Other',
    brand:r.brand||'',
    models:_monitorJsonArray(r.models),
    customModels:_monitorJsonArray(r.custom_models),
    searchTerms:_monitorJsonArray(r.search_terms),
    priceMin:r.price_min!=null?Number(r.price_min):0,
    priceMax:r.price_max!=null?Number(r.price_max):100,
    minProfit:r.min_profit!=null?Number(r.min_profit):0,
    minROI:r.min_roi!=null?Number(r.min_roi):0,
    sellerMinReviews:r.seller_min_reviews!=null?Number(r.seller_min_reviews):5,
    sellerMinRating:r.seller_min_rating!=null?Number(r.seller_min_rating):4.5,
    zeroReviewMode:r.zero_review_mode||'risky',
    allowedConditions:_monitorJsonArray(r.allowed_conditions),
    notifyLevels:_monitorJsonArray(r.notify_levels),
    rejectKeywords:_monitorJsonArray(r.reject_keywords),
    warningKeywords:_monitorJsonArray(r.warning_keywords),
    pollIntervalSeconds:r.poll_interval_seconds!=null?Number(r.poll_interval_seconds):60,
    config:(r.config&&typeof r.config==='object')?r.config:{},
    lastCheckedAt:r.last_checked_at||null,
    lastSuccessAt:r.last_success_at||null,
    lastError:r.last_error||null,
    createdAt:r.created_at||null,
    updatedAt:r.updated_at||null
  };
}
function _monitorClientToRow(m){
  return {
    id:m.id,
    user_id:_currentUserId,
    name:(m.name||'Monitor').trim(),
    platform:m.platform||'vinted',
    enabled:m.enabled!==false,
    archived:m.archived===true,
    template_key:m.templateKey||'blank',
    category:m.category||'Other',
    brand:m.brand||'',
    models:Array.isArray(m.models)?m.models:[],
    custom_models:Array.isArray(m.customModels)?m.customModels:[],
    search_terms:Array.isArray(m.searchTerms)?m.searchTerms:[],
    price_min:Number(m.priceMin)||0,
    price_max:Number(m.priceMax)||0,
    min_profit:Number(m.minProfit)||0,
    min_roi:Number(m.minROI)||0,
    seller_min_reviews:Math.max(0,Math.round(Number(m.sellerMinReviews)||0)),
    seller_min_rating:Math.max(0,Math.min(5,Number(m.sellerMinRating)||0)),
    zero_review_mode:m.zeroReviewMode||'risky',
    allowed_conditions:Array.isArray(m.allowedConditions)?m.allowedConditions:[],
    notify_levels:Array.isArray(m.notifyLevels)?m.notifyLevels:[],
    reject_keywords:Array.isArray(m.rejectKeywords)?m.rejectKeywords:[],
    warning_keywords:Array.isArray(m.warningKeywords)?m.warningKeywords:[],
    poll_interval_seconds:Math.max(30,Math.round(Number(m.pollIntervalSeconds)||60)),
    config:(m.config&&typeof m.config==='object')?m.config:{},
    updated_at:new Date().toISOString()
  };
}
function _monitorListingToDeal(match,listing){
  const reasoning=(match&&match.reasoning&&typeof match.reasoning==='object')?match.reasoning:{};
  return {
    id:match.id,
    monitorId:match.monitor_id,
    listingId:listing&&listing.platform_listing_id,
    title:(listing&&listing.title)||'Vinted listing',
    description:(listing&&listing.description)||'',
    itemPrice:listing&&listing.item_price!=null?Number(listing.item_price):null,
    deliveredPrice:match&&match.landed_cost!=null?Number(match.landed_cost):(listing&&listing.delivered_price!=null?Number(listing.delivered_price):null),
    resaleLow:match&&match.resale_low!=null?Number(match.resale_low):null,
    resaleHigh:match&&match.resale_high!=null?Number(match.resale_high):null,
    projectedProfit:match&&match.projected_profit!=null?Number(match.projected_profit):null,
    roi:match&&match.roi!=null?Number(match.roi):null,
    matchedModel:match&&match.matched_model||null,
    sellerRating:listing&&listing.seller_rating!=null?Number(listing.seller_rating):null,
    sellerReviews:listing&&listing.seller_reviews!=null?Number(listing.seller_reviews):null,
    sellerUsername:listing&&listing.seller_username||'',
    sellerScore:match&&match.seller_score!=null?Number(match.seller_score):null,
    sellerRisk:match&&match.seller_risk||null,
    decision:match&&match.decision||'check',
    score:match&&match.score!=null?Number(match.score):null,
    reason:reasoning.summary||reasoning.reason||'',
    detectedAt:match&&match.detected_at||null,
    ageLabel:'live',
    url:listing&&listing.url||'',
    imageUrl:listing&&listing.image_url||'',
    status:match&&match.status||'new'
  };
}
async function _monitorCloudLoadState(){
  if(!_currentUserId)return {ok:false,reason:'signed_out'};
  const uid=_currentUserId;
  const [monsRes,matchesRes]=await Promise.all([
    _sb.from('monitors').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
    _sb.from('monitor_matches').select('*').eq('user_id',uid).neq('status','dismissed').order('detected_at',{ascending:false}).limit(200)
  ]);
  if(monsRes.error||matchesRes.error){
    const err=monsRes.error||matchesRes.error;
    if(_monitorSchemaMissing(err))return {ok:false,reason:'schema_missing',error:err.message};
    return {ok:false,reason:'cloud_error',error:err.message};
  }
  const matches=matchesRes.data||[];
  const ids=[...new Set(matches.map(function(m){return m.listing_id;}).filter(Boolean))];
  let listings=[];
  if(ids.length){
    const lr=await _sb.from('monitor_listings').select('*').eq('user_id',uid).in('id',ids);
    if(lr.error){
      if(_monitorSchemaMissing(lr.error))return {ok:false,reason:'schema_missing',error:lr.error.message};
      return {ok:false,reason:'cloud_error',error:lr.error.message};
    }
    listings=lr.data||[];
  }
  const byId={};listings.forEach(function(r){byId[r.id]=r;});
  return {
    ok:true,
    monitors:(monsRes.data||[]).map(_monitorRowToClient).filter(Boolean),
    deals:matches.map(function(m){return _monitorListingToDeal(m,byId[m.listing_id]);})
  };
}
async function _monitorCloudSaveMonitor(m){
  if(!_currentUserId)return {ok:false,reason:'signed_out'};
  const row=_monitorClientToRow(m);
  const {data,error}=await _sb.from('monitors').upsert(row,{onConflict:'id'}).select('*').single();
  if(error){
    if(_monitorSchemaMissing(error))return {ok:false,reason:'schema_missing',error:error.message};
    return {ok:false,reason:'cloud_error',error:error.message};
  }
  return {ok:true,monitor:_monitorRowToClient(data)};
}
async function _monitorCloudDismissDeal(matchId){
  if(!_currentUserId)return {ok:false,reason:'signed_out'};
  const {error}=await _sb.from('monitor_matches').update({status:'dismissed'}).eq('id',matchId).eq('user_id',_currentUserId);
  if(error){
    if(_monitorSchemaMissing(error))return {ok:false,reason:'schema_missing',error:error.message};
    return {ok:false,reason:'cloud_error',error:error.message};
  }
  return {ok:true};
}
window.RetradeMonitorCloud={
  isReady:function(){return !!_currentUserId;},
  loadState:_monitorCloudLoadState,
  saveMonitor:_monitorCloudSaveMonitor,
  dismissDeal:_monitorCloudDismissDeal
};
