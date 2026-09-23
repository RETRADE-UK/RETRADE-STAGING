import { createClient } from '@supabase/supabase-js';

function req(name){
  const v=process.env[name];
  if(!v)throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export function makeDb(){
  return createClient(req('SUPABASE_URL'),req('SUPABASE_SERVICE_ROLE_KEY'),{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
}

export async function loadActiveMonitors(sb){
  const {data,error}=await sb.from('monitors')
    .select('*')
    .eq('enabled',true)
    .eq('archived',false)
    .order('created_at',{ascending:true});
  if(error)throw new Error(`Load monitors failed: ${error.message}`);
  return data||[];
}

export async function markMonitorChecked(sb,monitor,{success=false,errorMessage=null}={}){
  const patch={last_checked_at:new Date().toISOString(),last_error:errorMessage||null};
  if(success)patch.last_success_at=new Date().toISOString();
  const {error}=await sb.from('monitors').update(patch).eq('id',monitor.id).eq('user_id',monitor.user_id);
  if(error)console.error('[db] heartbeat update failed',monitor.id,error.message);
}

function listingRow(userId,l){
  return {
    user_id:userId,
    platform:'vinted',
    platform_listing_id:String(l.id),
    url:l.url||null,
    title:l.title||'Vinted listing',
    description:l.description||null,
    item_price:l.itemPrice,
    delivered_price:l.totalPrice,
    currency:l.currency||'GBP',
    condition:l.condition||null,
    brand:l.brand||null,
    image_url:l.imageUrl||null,
    image_urls:Array.isArray(l.imageUrls)?l.imageUrls:[],
    seller_id:l.sellerId!=null?String(l.sellerId):null,
    seller_username:l.sellerUsername||null,
    seller_rating:l.sellerRating,
    seller_reviews:l.sellerReviews,
    seller_positive:l.sellerPositive,
    seller_neutral:l.sellerNeutral,
    seller_negative:l.sellerNegative,
    seller_created_at:l.sellerCreatedAt||null,
    raw_payload:l.raw||{},
    last_seen_at:new Date().toISOString()
  };
}

export async function ensureListing(sb,userId,l){
  const row=listingRow(userId,l);
  const ins=await sb.from('monitor_listings').insert(row).select('id').single();
  if(!ins.error)return {id:ins.data.id,isNew:true};

  // Unique collision = already seen by this RETRADE user. Update useful fields
  // but retain first_seen_at.
  if(String(ins.error.code)==='23505'){
    const existing=await sb.from('monitor_listings')
      .select('id')
      .eq('user_id',userId)
      .eq('platform','vinted')
      .eq('platform_listing_id',String(l.id))
      .single();
    if(existing.error)throw new Error(`Existing listing lookup failed: ${existing.error.message}`);
    await sb.from('monitor_listings').update(row)
      .eq('id',existing.data.id).eq('user_id',userId);
    return {id:existing.data.id,isNew:false};
  }
  throw new Error(`Listing insert failed: ${ins.error.message}`);
}

export async function ensureMatch(sb,userId,monitorId,listingId,evaluation,status='new'){
  const row={
    user_id:userId,
    monitor_id:monitorId,
    listing_id:listingId,
    matched_model:evaluation.matchedModel||null,
    decision:evaluation.decision,
    score:evaluation.score,
    seller_score:evaluation.seller.score,
    seller_risk:evaluation.seller.risk,
    landed_cost:evaluation.landedCost,
    resale_low:evaluation.resaleLow,
    resale_high:evaluation.resaleHigh,
    projected_profit:evaluation.projectedProfit,
    roi:evaluation.roi,
    reasoning:evaluation.reasoning||{},
    status:status
  };
  const {data,error}=await sb.from('monitor_matches').insert(row).select('id').single();
  if(!error)return {id:data.id,isNew:true};
  if(String(error.code)==='23505')return {id:null,isNew:false};
  throw new Error(`Match insert failed: ${error.message}`);
}

export async function logBenchmarkEvent(sb,userId,monitorId,listingId,listing,evaluation){
  const {error}=await sb.from('monitor_benchmark_events').insert({
    user_id:userId,
    monitor_id:monitorId,
    listing_id:listingId,
    platform_listing_id:String(listing.id),
    retrade_detected_at:new Date().toISOString(),
    listing_title:listing.title||null,
    item_price:listing.itemPrice,
    decision:evaluation?.decision||null,
    seller_reviews:listing.sellerReviews,
    seller_rating:listing.sellerRating
  });
  if(error&&String(error.code)!=='23505')console.error('[db] benchmark event insert failed',error.message);
}
