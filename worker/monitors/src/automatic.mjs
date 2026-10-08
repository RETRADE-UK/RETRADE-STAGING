import { managedPublicConnection, persistPublicSession, publicMessages } from './public-connection.mjs';
import { createVintedSource, scanCatalog } from './adapters/vinted-source.mjs';
import { matchListing } from './engine/match.mjs';

// One global bounded cycle; no credentials, raw provider errors or URLs in output.
export async function automaticScan({rpc,db,request,token,now=Date.now}) {
 const monitors=await rpc('monitor_auto_claim',{p_token:token});
 monitors.sort((a,b)=>(Date.parse(a.last_success_at||'1970-01-01')-Date.parse(b.last_success_at||'1970-01-01'))||String(a.id).localeCompare(String(b.id)));
 const accounts=new Map(),cache=new Map(),diagnostics=[];let requests=0,committed=0,renewals=0;
 for(const m of monitors){
  let account=accounts.get(m.user_id);
  if(account===undefined){
   const snapshot=await rpc('monitor_connection_worker',{p_user:m.user_id});
   account=null;
   if(snapshot){
    try{
     const result=await managedPublicConnection({rpc,request,userId:m.user_id,snapshot,now});
     if(result.diagnostics)diagnostics.push({monitorId:m.id,stage:'renewal',httpStatus:result.httpStatus,failure:result.diagnostics});
     if(result.renewed)renewals++;
     if(result.session) account={...snapshot,session:result.session,generation:result.generation,source:createVintedSource({request,publicSession:result.session,timeoutMs:10000,now})};
     else if(!result.deferred) await rpc('monitor_public_failure',{p_user:m.user_id,p_generation:result.generation || snapshot.generation,p_http:result.httpStatus||null,p_requests:0,
      p_status:result.state==='rate_limited'?'rate_limited':result.retryable?'degraded':'blocked',
      p_message:result.retryable?'Catalogue renewal was interrupted. The saved session will retry after a pause.':publicMessages[result.state] || publicMessages.unavailable,
      p_retry:result.retryAt || null,p_stop:!result.retryable});
    }catch{
     await rpc('monitor_public_failure',{p_user:m.user_id,p_generation:snapshot.generation,p_http:null,p_requests:0,p_status:'degraded',
      p_message:'Connection storage is temporarily unavailable. Monitoring will retry after a pause.',p_retry:new Date(now()+300000).toISOString(),p_stop:false});
    }
   }
   accounts.set(m.user_id,account);
  }
  if(!account)continue;
  const budget={async searchPage(q){
   const key=m.user_id+':'+JSON.stringify(q);
   if(cache.has(key))return cache.get(key);
   if(requests>=6)throw new Error('cycle_budget');
   requests++;const page=await account.source.searchPage(q);
   if(page.listings.some(l=>!l.title||!l.url||l.currency!=='GBP'||l.itemPricePence===null) || (m.recipe.conditions.length && page.listings.length && page.listings.every(l=>l.condition===null)))throw new Error('source_schema');
   if(!await persistPublicSession({rpc,userId:m.user_id,generation:account.generation,session:account.session,now}))throw new Error('session_changed');
   cache.set(key,page);return page;
  }};
  try{
   // Identical terms for one owner share a wider source window, then each recipe
   // applies its own exact price/model rules. Never share authenticated data across owners.
   const peers=monitors.filter(x=>x.user_id===m.user_id && JSON.stringify(x.recipe.searchTerms)===JSON.stringify(m.recipe.searchTerms));
   const sourceRecipe={...m.recipe,minPricePence:Math.min(...peers.map(x=>x.recipe.minPricePence)),
    maxPricePence:peers.some(x=>x.recipe.maxPricePence===null)?null:Math.max(...peers.map(x=>x.recipe.maxPricePence))};
   const seen=m.catalog_revision===m.revision?(m.catalog_seen_ids||[]):[];
   const scan=await scanCatalog({source:budget,recipe:sourceRecipe,maxPages:2,maxRequests:6,perPage:50,knownIds:new Set(seen)});
   const evaluated=scan.listings.map(listing=>({listing,result:matchListing(listing,m.recipe)}));
   const reasons={};for(const {result} of evaluated)reasons[result.reason]=(reasons[result.reason]||0)+1;
   diagnostics.push({monitorId:m.id,candidates:scan.listings.length,knownConditions:scan.listings.filter(x=>x.condition).length,
    incomplete:scan.incomplete,reasons});
   const ok=await rpc('monitor_catalog_commit',{p_user:m.user_id,p_generation:account.generation,p_id:m.id,p_revision:m.revision,p_token:token,
    p_items:evaluated.filter(x=>x.result.status==='match'),
    p_seen:scan.listings.map(x=>x.id),p_complete:scan.coverageComplete,p_requests:scan.requests});
   if(ok)committed++;
  }catch(e){
   if(e.message==='cycle_budget')break;
   diagnostics.push({monitorId:m.id,httpStatus:e.status||null,failure:e.diagnostics||null});
   const stop=[401,403,404].includes(e.status)||['source_schema','session_changed'].includes(e.message)||e.name==='ProviderContractError'||['session_invalid','session_destination','unexpected_content_type','invalid_json'].includes(e.code);
   const delay=Math.min(3600000,120000*2**Math.min(account.failures||0,5));
   await rpc('monitor_public_failure',{p_user:m.user_id,p_generation:account.generation,p_http:e.status||null,p_requests:requests,
    p_status:stop?'blocked':e.status===429?'rate_limited':'degraded',
    p_message:stop?(e.status ? `Vinted returned HTTP ${e.status}. Catalogue requests are paused; no account token is required.` : 'Catalogue data or session changed unexpectedly. Automatic requests are paused.'):e.status===429?'Vinted requested a pause. Scanning will resume after the retry time.':'Scan failed. The service will retry after a pause.',
    p_retry:stop?null:new Date(Math.max(now()+delay,e.retryAt||0)).toISOString(),p_stop:stop});
   accounts.set(m.user_id,null);
  }
 }
 return {requests,committed,renewals,diagnostics};
}
