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
  await db.close();
  console.log(
    "Monitor database: ownership, privileged grants, leases, baseline, deduplication, pause and stale revisions passed.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
