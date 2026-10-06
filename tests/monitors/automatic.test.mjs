import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticScan } from '../../worker/monitors/src/automatic.mjs';
import { seal,unseal } from '../../worker/monitors/src/connection.mjs';
import { canonBenchmark } from '../../worker/monitors/src/contracts.mjs';
const key=Buffer.alloc(32,42).toString('base64');
const credentials={refreshToken:'synthetic-refresh-token',accessToken:'synthetic-access-token',userAgent:'Synthetic Browser 1.0',country:'GB'};
const recipe={...canonBenchmark(),searchTerms:['Canon']};
const m={id:'monitor-a',user_id:'owner-a',revision:1,recipe};
async function fixture({expired=false,fail=null,second=false}={}){
 const encrypted=await seal(credentials,key,m.user_id), calls=[],commits=[],failures=[];
 const rpc=async(name,args)=>{
  calls.push({name,args});
  if(name==='monitor_auto_claim')return second?[m,{...m,id:'monitor-b',user_id:'owner-b'}]:[m];
  if(name==='monitor_connection_worker')return {state:'verified',generation:'generation',ciphertext:args.p_user==='owner-a'?encrypted:await seal({...credentials,accessToken:'second-owner-access-token'},key,'owner-b'),expiresAt:new Date(Date.now()+(expired?-1:3600000)).toISOString()};
  if(name==='monitor_connection_key')return key;
  if(name==='monitor_connection_begin')return {accepted:true,attempt:'attempt',generation:'generation',ciphertext:encrypted};
  if(name==='monitor_connection_finish')return true;
  if(name==='monitor_auto_commit'){commits.push(args);return true;}
  if(name==='monitor_scan_failure'){failures.push(args);return null;}
  throw new Error(name);
 };
 const cookies=[];let renewals=0;
 const request=async(url,opts)=>{
  if(url.pathname==='/oauth/token'){renewals++;return Response.json({access_token:'rotated-access-token-value',refresh_token:'rotated-refresh-token-value',expires_in:3600});}
  cookies.push(opts.headers.cookie);
  if(fail)return new Response('private body',{status:fail,headers:{'retry-after':'600'}});
  return Response.json({items:[{id:123,title:'Canon 600D',price:{amount:'80',currency_code:'GBP'}}]});
 };
 const result=await automaticScan({rpc,db:async()=>[],request,token:'lease'});
 return {result,calls,commits,failures,cookies,renewals};
}
test('valid saved connection scans with owner isolation and no unnecessary renewal',async()=>{
 const f=await fixture({second:true});assert.equal(f.renewals,0);assert.equal(f.result.committed,2);
 assert.deepEqual(f.cookies,['access_token_web=synthetic-access-token','access_token_web=second-owner-access-token']);
 assert.equal(f.commits[0].p_user,'owner-a');assert.equal(f.commits[1].p_user,'owner-b');
 assert(!JSON.stringify(f.commits).includes('access-token'));
});
test('expired connection rotates and persists before catalog use',async()=>{
 const f=await fixture({expired:true});assert.equal(f.renewals,1);
 assert.deepEqual(f.cookies,['access_token_web=rotated-access-token-value']);
 const finish=f.calls.find(c=>c.name==='monitor_connection_finish');
 assert.equal((await unseal(finish.args.p_ciphertext,key,'owner-a')).refreshToken,'rotated-refresh-token-value');
 assert(f.calls.findIndex(c=>c.name==='monitor_connection_finish')<f.calls.findIndex(c=>c.name==='monitor_auto_commit'));
});
test('403 stops and 429 persists retry time without retrying the source',async()=>{
 for(const status of [403,429]){const f=await fixture({fail:status});assert.equal(f.cookies.length,1);assert.equal(f.commits.length,0);
 assert.equal(f.failures[0].p_stop,status===403);assert(!JSON.stringify(f.failures).includes('private body'));
 if(status===429)assert(Date.parse(f.failures[0].p_retry)>Date.now()+590000);}
});
