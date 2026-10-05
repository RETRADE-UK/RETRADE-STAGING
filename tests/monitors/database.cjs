/* Real PostgreSQL semantics in isolated WASM; no network or staging data. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;
 insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20260924092111_monitor_mvp.sql",
      "utf8",
    ),
  );
  await db.exec(fs.readFileSync("supabase/migrations/20260928230920_monitor_recovery_audit.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20261005205508_monitor_history_inbox.sql", "utf8"));
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  const { preset } = await import(
    "../../worker/monitors/src/service-validation.mjs"
  );
  const data = { ...preset(), notifications: true };
  const save = async (user, id, revision, d) =>
    (
      await db.query("select * from public.monitor_save($1,$2,$3,$4)", [
        user,
        id,
        revision,
        JSON.stringify(d),
      ])
    ).rows[0];
  const m = await save(a, null, null, data);
  const other = await save(b, null, null, data);
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`,
  );
  assert.deepEqual(
    (await db.query("select id from public.monitor_recipes")).rows.map(
      (x) => x.id,
    ),
    [m.id],
  );
  await assert.rejects(
    db.query("update public.monitor_recipes set user_id=$1 where id=$2", [
      b,
      m.id,
    ]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select public.monitor_config()"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select * from public.monitor_push_subscriptions"),
    /permission denied/,
  );
  await db.exec("reset role;set role anon");
  await assert.rejects(
    db.query("select * from public.monitor_recipes"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select public.monitor_claim(gen_random_uuid())"),
    /permission denied/,
  );
  await db.exec("reset role");
  await assert.rejects(save(b, m.id, 1, data), /not found/);
  const sub = (
    await db.query(
      "insert into public.monitor_push_subscriptions(user_id,endpoint,subscription) values($1,'https://fcm.googleapis.com/test','{}') returning id",
      [a],
    )
  ).rows[0].id;
  const token = "33333333-3333-4333-8333-333333333333";
  const claim = async () =>
    (await db.query("select * from public.monitor_claim($1)", [token])).rows;
  const first = await claim();
  assert.equal(first.length, 2);
  assert.equal((await claim()).length, 0);
  const item = (id) => ({
    listing: { id, title: "Canon 600D", observedAt: new Date().toISOString() },
    result: { status: "match", warnings: [] },
  });
  const commit = async (items, rev = 1) =>
    (
      await db.query("select public.monitor_commit($1,$2,$3,$4,true,1) as ok", [
        m.id,
        rev,
        token,
        JSON.stringify(items),
      ])
    ).rows[0].ok;
  assert.equal(await commit([item("100")]), true);
  assert.equal(
    (await db.query("select * from public.monitor_outbox")).rows.length,
    0,
    "baseline never notifies",
  );
  assert.equal(
    await commit([item("101")]),
    false,
    "released lease cannot commit twice",
  );
  await db.query(
    "update public.monitor_recipes set next_run_at=now() where id=$1",
    [m.id],
  );
  await claim();
  assert.equal(await commit([item("100"), item("101")]), true);
  assert.equal(
    (await db.query("select * from public.monitor_outbox")).rows.length,
    1,
    "new unique match queues once",
  );
  const edit = await save(a, m.id, 1, { ...data, enabled: false });
  assert.equal(edit.revision, 2);
  assert.equal(
    (await db.query("select * from public.monitor_outbox")).rows.length,
    0,
    "pause cancels queued alerts",
  );
  assert.equal(
    (await db.query("select * from public.monitor_matches where revision=2"))
      .rows.length,
    2,
    "non-filter edits keep seen history",
  );
  assert.equal(
    await commit([item("102")]),
    false,
    "stale recipe commit denied",
  );
  await assert.rejects(save(a, m.id, 1, data), /changed elsewhere/);
  const changed = await save(a, m.id, 2, {
    ...data,
    recipe: { ...data.recipe, minPricePence: 5200 },
  });
  assert.equal(changed.baseline_at, null, "scope edit rebaselines");
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${b}',false);`,
  );
  assert.equal(
    (await db.query("select * from public.monitor_matches")).rows.length,
    0,
    "foreign evidence stays private",
  );
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','public.monitor_config(jsonb)','EXECUTE') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await assert.rejects(db.query("select public.monitor_feed_snapshot($1,$2,$3)",[b,m.id,3]),/unavailable/);
  await db.exec(`set role authenticated`);
  await assert.rejects(db.query("select public.monitor_feed_snapshot($1,$2,$3)",[a,m.id,3]),/permission denied/);
  await assert.rejects(db.query("select public.monitor_release_claims($1)",[token]),/permission denied/);
  await db.exec("reset role");
  await db.query("update public.monitor_recipes set lease_token=$1,lease_until=now()+interval '100 seconds',next_run_at=now()+interval '1 minute' where id=$2",[token,m.id]);
  await db.query("select public.monitor_release_claims($1)",[token]);
  const released=(await db.query("select lease_token, next_run_at<=now() as due from public.monitor_recipes where id=$1",[m.id])).rows[0];
  assert.equal(released.lease_token,null);assert.equal(released.due,true);
  await db.query("insert into public.monitor_outbox(subscription_id,payload,state,attempts,next_attempt_at) values($1,'{}','sending',5,now()-interval '1 second')",[sub]);
  await db.query("select public.monitor_push_claim()");
  assert.equal((await db.query("select state from public.monitor_outbox where attempts=5")).rows[0].state,'failed');
  await db.query(`insert into public.monitor_matches(monitor_id,revision,listing_id,listing,result,baseline,observed_at)
    select $1,3,g::text,'{}',jsonb_build_object('status',case when g>250 then 'reject' else 'match' end),g=1,now()+g*interval '1 second' from generate_series(1,300) g`,[m.id]);
  await db.query("insert into public.monitor_comparisons(monitor_id,revision,listing_id,discord_at) values($1,3,'1',now()),($1,3,'2',now())",[m.id]);
  const snap=(await db.query("select public.monitor_feed_snapshot($1,$2,3) as data",[a,m.id])).rows[0].data;
  assert.equal(snap.matches.length,200);assert.equal(snap.truncated,true);
  assert(snap.matches.every(x=>x.result.status==='match'),'Rejected candidates do not crowd out feed');
  assert.equal(snap.comparisonMatches.length,2,'Exact comparison lookup includes evidence outside display');
  assert(!snap.matches.some(x=>x.listing_id==='1'));
  assert.equal(snap.comparisonMatches.find(x=>x.listing_id==='1').baseline,true);
  // The first candidate timestamp is not its confirmation time.
  await db.query("update public.monitor_recipes set baseline_at=now(),enabled=true,next_run_at=now() where id=$1",[m.id]);
  await claim();
  const pending={listing:{id:'900',title:'Camera',observedAt:'2026-09-27T10:00:00Z'},result:{status:'pending'}};
  await commit([pending],3);
  const queueBefore=(await db.query("select count(*)::int as n from public.monitor_outbox")).rows[0].n;
  await db.query("update public.monitor_recipes set next_run_at=now() where id=$1",[m.id]);await claim();
  const confirmed={listing:{...pending.listing,title:'Canon 600D',observedAt:'2026-09-27T10:01:00Z'},result:{status:'match'}};
  await commit([confirmed],3);
  const promoted=(await db.query("select result,observed_at,confirmed_at from public.monitor_matches where monitor_id=$1 and revision=3 and listing_id='900'",[m.id])).rows[0];
  assert.equal(promoted.result.status,'match');
  assert.equal(new Date(promoted.observed_at).toISOString(),'2026-09-27T10:00:00.000Z');
  assert.equal(new Date(promoted.confirmed_at).toISOString(),'2026-09-27T10:01:00.000Z');
  assert.equal((await db.query("select count(*)::int as n from public.monitor_outbox")).rows[0].n,queueBefore+1);
  await db.query("update public.monitor_recipes set next_run_at=now() where id=$1",[m.id]);await claim();await commit([confirmed],3);
  assert.equal((await db.query("select count(*)::int as n from public.monitor_outbox")).rows[0].n,queueBefore+1,'Repeated confirmation never queues twice');
  const history = async (user=a,filter='all',query='',cursor=null) => (await db.query('select public.monitor_history($1,$2,$3,$4,$5) as data',[user,m.id,filter,query,cursor])).rows[0].data;
  await assert.rejects(history(b),/Monitor not found/);
  await assert.rejects(db.query('select public.monitor_set_item_state($1,$2,$3,true,null)',[b,m.id,'900']),/Monitor not found/);
  await assert.rejects(db.query('select public.monitor_set_item_state($1,$2,$3,true,null)',[a,m.id,'99999']),/listing not found/);
  const firstHistory = await history();
  assert.equal(firstHistory.rows.length,50); assert(firstHistory.nextCursor);
  const all = []; let cursor = null;
  do {const page = await history(a,'all','',cursor); all.push(...page.rows); cursor=page.nextCursor;} while(cursor);
  assert(all.length>200,'History reaches beyond the old feed limit');
  assert.equal(new Set(all.map(r=>r.listing_id)).size,all.length,'No identity appears twice');
  assert(!all.some(r=>r.result.status==='reject'));
  await db.query('select public.monitor_set_item_state($1,$2,$3,true,true)',[a,m.id,'900']);
  assert.equal((await history(a,'saved')).rows[0].listing_id,'900');
  assert(!(await history(a,'new','900')).rows.length,'Read item leaves unread filter');
  await db.query('select public.monitor_set_item_state($1,$2,$3,null,false)',[a,m.id,'900']);
  assert((await history(a,'new','900')).rows[0].saved,'Read toggle preserves saved flag');
  await db.query(`insert into public.monitor_matches(monitor_id,revision,listing_id,listing,result,baseline,observed_at)
    values($1,4,'900','{"id":"900","title":"Updated camera"}','{"status":"match"}',true,'2026-10-05T10:00:00Z')`,[m.id]);
  const same = (await history(a,'saved')).rows[0];
  assert.equal(same.listing.title,'Updated camera'); assert.equal(same.baseline,false);
  assert.equal(new Date(same.observed_at).toISOString(),'2026-09-27T10:00:00.000Z','Stable first-seen cursor across rule versions');
  assert.equal((await history(a,'all','Updated')).rows.length,1);
  assert.equal((await history(a,'all','%')).rows.length,0,'Search is literal, not wildcard SQL');
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${b}',false);`);
  assert.equal((await db.query('select * from public.monitor_item_state')).rows.length,0);
  await assert.rejects(history(),/permission denied/);
  await assert.rejects(db.query('select public.monitor_set_item_state($1,$2,$3,false,null)',[a,m.id,'900']),/permission denied/);
  await db.exec('reset role; set role service_role');
  assert.equal((await history(a,'saved')).rows.length,1,'Invoker RPC works as worker');
  await db.exec('reset role');
  await db.close();
  console.log(
    "Monitor database: ownership, privileged grants, leases, baseline, deduplication, pause and stale revisions passed.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
