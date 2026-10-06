/* Synthetic PostgreSQL state/grant tests. Vault encryption verified in staging separately. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create schema monitor_private;
 grant usage on schema monitor_private to service_role;
 insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261006202339_monitor_connection.sql','utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 const rpc=async(name,args=[],placeholders=args.map((_,i)=>'$'+(i+1)).join(','))=>(await db.query(`select public.${name}(${placeholders}) as result`,args)).rows[0].result;
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  for(const [fn,args] of [['monitor_connection_key',[]],['monitor_connection_read',[a]],['monitor_connection_status',[a]],['monitor_connection_begin',[a,null]],['monitor_connection_disconnect',[a]],['monitor_connection_finish',[a,a,a,'verified',{},null,null]]]) await assert.rejects(rpc(fn,args),/permission denied/);
  await assert.rejects(db.query('select * from monitor_private.connections'),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 const first=await rpc('monitor_connection_begin',[a,{v:1,iv:'synthetic',data:'ciphertext'}]);assert.equal(first.accepted,true);
 assert.equal((await rpc('monitor_connection_begin',[a,{}])).accepted,false,'cooldown across workers');
 assert.deepEqual(await rpc('monitor_connection_status',[b]),{state:'disconnected',stored:false});
 assert.equal(await rpc('monitor_connection_finish',[b,first.attempt,first.generation,'verified',{v:1},new Date(Date.now()+3600000),null]),false,'wrong owner');
 assert.equal(await rpc('monitor_connection_finish',[a,first.attempt,first.generation,'verified',{v:1,data:'rotated'},new Date(Date.now()+3600000),null]),true);
 assert.equal((await rpc('monitor_connection_status',[a])).state,'verified');
 assert.equal(JSON.stringify(await rpc('monitor_connection_status',[a])).includes('rotated'),false);
 await rpc('monitor_connection_disconnect',[a]);
 assert.equal((await rpc('monitor_connection_status',[a])).stored,false);
 assert.equal(await rpc('monitor_connection_finish',[a,first.attempt,first.generation,'verified',{},new Date(Date.now()+3600000),null]),false,'late result cannot reconnect');
 assert.equal((await rpc('monitor_connection_begin',[a,{}])).accepted,false,'disconnect preserves cooldown');
 await db.exec(`update monitor_private.connections set retry_at=now()-interval '1 minute' where user_id='${a}'`);
 const second=await rpc('monitor_connection_begin',[a,{v:1,data:'second'}]);
 await db.exec(`update monitor_private.connections set lease_until=now()-interval '1 minute',retry_at=now()-interval '1 minute' where user_id='${a}'`);
 assert.equal((await rpc('monitor_connection_status',[a])).state,'reconnect');
 await assert.rejects(rpc('monitor_connection_begin',[a,null]),/fresh credentials/);
 assert.equal(await rpc('monitor_connection_finish',[a,second.attempt,second.generation,'verified',{},new Date(Date.now()+3600000),null]),false);
 await db.exec(`reset role;delete from auth.users where id='${a}'`);
 assert.equal((await db.query('select count(*)::int as n from monitor_private.connections')).rows[0].n,0,'account deletion erases encrypted credentials');
 await db.close();console.log('Connection isolation, cooldown, rotation, disconnect and crash fencing passed');
})().catch(e=>{console.error(e);process.exit(1);});
