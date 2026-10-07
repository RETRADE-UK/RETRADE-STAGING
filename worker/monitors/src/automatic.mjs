import { seal, unseal, renewConnection } from './connection.mjs';
import { createVintedSource, scanCatalog } from './adapters/vinted-source.mjs';
import { matchListing } from './engine/match.mjs';

// One global bounded cycle; no credentials, raw provider errors or URLs in output.
export async function automaticScan({rpc,db,request,token,now=Date.now}) {
 const monitors=await rpc('monitor_auto_claim',{p_token:token});
 monitors.sort((a,b)=>(Date.parse(a.last_success_at||'1970-01-01')-Date.parse(b.last_success_at||'1970-01-01'))||String(a.id).localeCompare(String(b.id)));
 const accounts=new Map(),cache=new Map();let requests=0,committed=0;
 for(const m of monitors){
  let account=accounts.get(m.user_id);
  if(account===undefined){
   const snapshot=await rpc('monitor_connection_worker',{p_user:m.user_id});
   account=null;
   if(snapshot){
    try{
     const key=await rpc('monitor_connection_key');
     let credentials;
     if(snapshot.state==='verified' && Date.parse(snapshot.expiresAt)>now()+120000){
      credentials=await unseal(snapshot.ciphertext,key,m.user_id);
     }else{
      const claim=await rpc('monitor_connection_begin',{p_user:m.user_id,p_ciphertext:null});
      if(claim.accepted){
       const result=await renewConnection({credentials:await unseal(claim.ciphertext,key,m.user_id),request,now});
       const saved=await rpc('monitor_connection_finish',{p_user:m.user_id,p_attempt:claim.attempt,p_generation:claim.generation,
        p_state:result.state,p_ciphertext:result.credentials?await seal(result.credentials,key,m.user_id):null,
        p_expires:result.expiresAt||null,p_retry:result.retryAt?new Date(result.retryAt).toISOString():null});
       if(saved && result.state==='verified'){credentials=result.credentials;snapshot.generation=claim.generation;}
      }
     }
     if(credentials) account={...snapshot,source:createVintedSource({request,accessToken:credentials.accessToken,userAgent:credentials.userAgent,timeoutMs:7000,now})};
    }catch{
     await rpc('monitor_scan_failure',{p_user:m.user_id,p_generation:snapshot.generation,p_status:'blocked',
      p_message:'Saved connection needs attention. Reconnect before automatic searches can resume.',p_retry:null,p_stop:true});
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
   if(page.listings.some(l=>!l.title||!l.url||l.currency!=='GBP'||l.itemPricePence===null))throw new Error('source_schema');
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
   const ok=await rpc('monitor_catalog_commit',{p_user:m.user_id,p_generation:account.generation,p_id:m.id,p_revision:m.revision,p_token:token,
    p_items:scan.listings.map(listing=>({listing,result:matchListing(listing,m.recipe)})).filter(x=>x.result.status==='match'),
    p_seen:scan.listings.map(x=>x.id),p_complete:scan.coverageComplete,p_requests:scan.requests});
   if(ok)committed++;
  }catch(e){
   if(e.message==='cycle_budget')break;
   const stop=[401,403,404].includes(e.status)||e.message==='source_schema'||e.name==='ProviderContractError'||['unexpected_content_type','invalid_json'].includes(e.code);
   const delay=Math.min(3600000,120000*2**Math.min(account.failures||0,5));
   await rpc('monitor_scan_failure',{p_user:m.user_id,p_generation:account.generation,
    p_status:stop?'blocked':e.status===429?'rate_limited':'degraded',
    p_message:stop?'Vinted refused the scan or returned an unsupported response. Automatic requests are paused.':e.status===429?'Vinted requested a pause. Scanning will resume after the retry time.':'Scan failed. The service will retry after a pause.',
    p_retry:stop?null:new Date(Math.max(now()+delay,e.retryAt||0)).toISOString(),p_stop:stop});
   accounts.set(m.user_id,null);
  }
 }
 return {requests,committed};
}
