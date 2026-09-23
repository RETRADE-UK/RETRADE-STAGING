import 'dotenv/config';
import { makeDb,loadActiveMonitors,markMonitorChecked,ensureListing,ensureMatch,logBenchmarkEvent } from './db.mjs';
import { VintedAdapter,VintedAccessError } from './adapters/vinted.mjs';
import { basicMatch,buildQueries } from './engine/match.mjs';
import { evaluateListing } from './engine/score.mjs';

const sb=makeDb();
const adapter=new VintedAdapter({baseUrl:process.env.VINTED_BASE_URL||'https://www.vinted.co.uk'});
const LOOP_MS=Math.max(2000,Number(process.env.LOOP_INTERVAL_MS)||5000);
const DEFAULT_POLL=Math.max(30,Number(process.env.DEFAULT_POLL_SECONDS)||60);
const MAX_RESULTS=Math.max(5,Math.min(100,Number(process.env.MAX_RESULTS_PER_SEARCH)||50));
const RUN_ONCE=process.env.RUN_ONCE==='1';
let stop=false,blockedUntil=0;

process.on('SIGINT',()=>{stop=true;});
process.on('SIGTERM',()=>{stop=true;});

const log=(...a)=>console.log(new Date().toISOString(),...a);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function due(mon){
  const every=Math.max(30,Number(mon.poll_interval_seconds)||DEFAULT_POLL)*1000;
  if(!mon.last_checked_at)return true;
  const at=Date.parse(mon.last_checked_at);
  return !Number.isFinite(at)||Date.now()-at>=every;
}
function uniqueListings(arr){
  const m=new Map();
  for(const l of arr)if(l?.id&&!m.has(String(l.id)))m.set(String(l.id),l);
  return [...m.values()];
}

async function runMonitor(mon,queryCache){
  const firstRun=!mon.last_success_at;
  const queries=buildQueries(mon);
  if(!queries.length){
    await markMonitorChecked(sb,mon,{errorMessage:'No search wording configured'});
    return;
  }
  let candidates=[];
  for(const q of queries){
    const cacheKey=JSON.stringify([q,mon.price_min,mon.price_max,MAX_RESULTS]);
    let rows=queryCache.get(cacheKey);
    if(!rows){
      rows=await adapter.search({
        searchText:q,
        priceFrom:Number(mon.price_min)||0,
        priceTo:Number(mon.price_max)||100,
        perPage:MAX_RESULTS
      });
      queryCache.set(cacheKey,rows);
    }
    candidates.push(...rows);
  }
  candidates=uniqueListings(candidates);

  let matched=0,newMatches=0;
  for(const raw of candidates){
    let initial=basicMatch(raw,mon);
    if(!initial.ok)continue;

    let listing=raw;
    try{ listing=await adapter.enrich(raw); }
    catch(e){
      // If enrichment itself is blocked/rate-limited, preserve the health signal.
      if(e instanceof VintedAccessError&&(e.status===403||e.status===429))throw e;
    }
    const full=basicMatch(listing,mon);
    if(!full.ok)continue;
    matched++;

    const stored=await ensureListing(sb,mon.user_id,listing);
    let evaluation=evaluateListing(listing,mon,full);

    // First-run baseline MUST be recorded per monitor, not merely skipped.
    // Otherwise the second poll would treat every current catalogue row as new.
    if(firstRun&&String(process.env.FIRST_RUN_MODE||'silent').toLowerCase()==='silent'){
      if(evaluation.hidden){
        evaluation={
          hidden:false,decision:'risky',score:0,seller:evaluation.seller,
          matchedModel:full.matchedModel,landedCost:listing.totalPrice??listing.itemPrice,
          resaleLow:null,resaleHigh:null,projectedProfit:null,roi:null,
          reasoning:{summary:'First-run baseline; intentionally suppressed.',baseline:true}
        };
      }else{
        evaluation.reasoning={...(evaluation.reasoning||{}),baseline:true};
      }
      await ensureMatch(sb,mon.user_id,mon.id,stored.id,evaluation,'dismissed');
      continue;
    }

    if(evaluation.hidden)continue;
    const created=await ensureMatch(sb,mon.user_id,mon.id,stored.id,evaluation,'new');
    if(created.isNew){
      newMatches++;
      if(mon.config&&mon.config.benchmarkMode){
        await logBenchmarkEvent(sb,mon.user_id,mon.id,stored.id,listing,evaluation);
      }
      log(`[match] ${evaluation.decision.toUpperCase()} ${mon.name}: ${listing.title} £${listing.itemPrice ?? '?'} seller=${listing.sellerReviews ?? 'unknown'} reviews`);
    }
  }
  await markMonitorChecked(sb,mon,{success:true});
  log(`[monitor] ${mon.name}: ${candidates.length} fetched, ${matched} matched, ${newMatches} new`);
}

async function cycle(){
  if(Date.now()<blockedUntil)return;
  const monitors=(await loadActiveMonitors(sb)).filter(due);
  if(!monitors.length)return;
  const cache=new Map();
  for(const mon of monitors){
    if(stop)break;
    try{
      await runMonitor(mon,cache);
    }catch(e){
      if(e instanceof VintedAccessError){
        const wait=e.status===403?5*60_000:e.status===429?2*60_000:60_000;
        blockedUntil=Date.now()+wait;
        await markMonitorChecked(sb,mon,{errorMessage:e.message});
        log(`[vinted] ${e.kind||'error'} HTTP ${e.status||'?'} — backing off ${Math.round(wait/1000)}s`);
        break;
      }
      await markMonitorChecked(sb,mon,{errorMessage:e?.message||String(e)});
      log('[error]',mon.name,e?.stack||e);
    }
  }
}

log('RETRADE monitor worker starting');
do{
  await cycle();
  if(RUN_ONCE)break;
  if(!stop)await sleep(LOOP_MS);
}while(!stop);
log('RETRADE monitor worker stopped');
