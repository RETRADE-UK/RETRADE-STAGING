-- Staging-only monitor recovery. Existing evidence and accounting are preserved.
alter table public.monitor_matches add column confirmed_at timestamptz;
update public.monitor_matches set confirmed_at=observed_at where result->>'status'='match';

-- Pending candidates can become confirmed when more evidence arrives. Keep the
-- first candidate time distinct from confirmation, baseline silence and one alert.
create or replace function public.monitor_commit(p_id uuid,p_revision integer,p_token uuid,p_items jsonb,p_complete boolean,p_requests integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare m public.monitor_recipes; x jsonb; baseline boolean; was_confirmed boolean; now_confirmed boolean;
begin
 select * into m from public.monitor_recipes where id=p_id for update;
 if not found or m.revision<>p_revision or m.lease_token is distinct from p_token or m.lease_until<now() or not m.enabled or m.archived then return false; end if;
 baseline:=m.baseline_at is null;
 for x in select value from jsonb_array_elements(p_items) loop
  select confirmed_at is not null into was_confirmed from public.monitor_matches
   where monitor_id=m.id and revision=m.revision and listing_id=x->'listing'->>'id';
  insert into public.monitor_matches(monitor_id,revision,listing_id,listing,result,baseline,observed_at,confirmed_at)
  values(m.id,m.revision,x->'listing'->>'id',x->'listing',x->'result',baseline,(x->'listing'->>'observedAt')::timestamptz,
   case when x->'result'->>'status'='match' then (x->'listing'->>'observedAt')::timestamptz else null end)
  on conflict(monitor_id,revision,listing_id) do update set listing=excluded.listing,result=excluded.result,confirmed_at=excluded.confirmed_at
   where public.monitor_matches.result->>'status'='pending'
  returning result->>'status'='match' and not public.monitor_matches.baseline into now_confirmed;
  if coalesce(now_confirmed,false) and not coalesce(was_confirmed,false) and not baseline and m.notifications then
   insert into public.monitor_outbox(subscription_id,monitor_id,revision,listing_id,payload)
   select s.id,m.id,m.revision,x->'listing'->>'id',jsonb_build_object('userId',m.user_id,'title',m.name,'body',left(coalesce(x->'listing'->>'title','New Vinted listing'),180),'tag','monitor-'||m.id||'-'||(x->'listing'->>'id'))
   from public.monitor_push_subscriptions s where s.user_id=m.user_id on conflict do nothing;
  end if;
 end loop;
 update public.monitor_recipes set baseline_at=case when p_complete then coalesce(baseline_at,now()) else baseline_at end,
 last_success_at=now(),status=case when p_complete then 'ready' else 'limited' end,
 message=case when p_complete then 'Newest search window checked; detail-only matches remain unverified.' else 'Search window was full without known overlap. Coverage is incomplete.' end,
 lease_until=null,lease_token=null where id=m.id;
 return true;
end $$;
revoke all on function public.monitor_commit(uuid,integer,uuid,jsonb,boolean,integer) from public,anon,authenticated;
grant execute on function public.monitor_commit(uuid,integer,uuid,jsonb,boolean,integer) to service_role;

-- Exact identity lookups make the bounded Discord sample independent of feed size.
create or replace function public.monitor_feed_snapshot(p_user uuid,p_monitor uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.monitor_recipes; feed jsonb; comparator jsonb; evidence jsonb; clipped boolean;
begin
 select * into m from public.monitor_recipes where id=p_monitor and user_id=p_user and revision=p_revision;
 if not found then raise exception 'Monitor changed or is unavailable. Refresh and retry.'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into feed from (
  select * from public.monitor_matches where monitor_id=m.id and revision=m.revision
   and result->>'status' in ('match','pending') order by observed_at desc,listing_id limit 201
 ) x;
 select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into comparator from (
  select * from public.monitor_comparisons where monitor_id=m.id and revision=m.revision
   order by discord_at desc,listing_id limit 501
 ) x;
 clipped:=jsonb_array_length(feed)>200 or jsonb_array_length(comparator)>500;
 if jsonb_array_length(feed)>200 then feed:=feed-200; end if;
 if jsonb_array_length(comparator)>500 then comparator:=comparator-500; end if;
 select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into evidence
 from public.monitor_matches x where x.monitor_id=m.id and x.revision=m.revision
 and x.listing_id in (select v->>'listing_id' from jsonb_array_elements(comparator) v);
 return jsonb_build_object('matches',feed,'discord',comparator,'comparisonMatches',evidence,
  'truncated',clipped,'baselineAt',m.baseline_at);
end $$;
revoke all on function public.monitor_feed_snapshot(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.monitor_feed_snapshot(uuid,uuid,integer) to service_role;

-- Release scans skipped by the shared request budget or a source failure. They
-- stay due, ahead of completed scans, instead of waiting for abandoned leases.
create or replace function public.monitor_release_claims(p_token uuid) returns void
language sql security definer set search_path='' as $$
 update public.monitor_recipes set lease_token=null,lease_until=null,next_run_at=least(next_run_at,now())
 where lease_token=p_token;
$$;
revoke all on function public.monitor_release_claims(uuid) from public,anon,authenticated;
grant execute on function public.monitor_release_claims(uuid) to service_role;

-- A process can die after claiming its fifth attempt but before recording the
-- outcome. End that expired lease visibly; never leave it sending indefinitely.
create or replace function public.monitor_push_claim() returns setof public.monitor_outbox
language plpgsql security definer set search_path='' as $$
begin
 update public.monitor_outbox set state='failed',error='Delivery outcome unknown after final attempt'
 where state in ('pending','sending') and attempts>=5 and next_attempt_at<=now();
 return query update public.monitor_outbox set state='sending',attempts=attempts+1,next_attempt_at=now()+interval '2 minutes'
 where id in(select id from public.monitor_outbox where state in ('pending','sending') and next_attempt_at<=now() and attempts<5
 order by next_attempt_at limit 5 for update skip locked) returning *;
end $$;
revoke all on function public.monitor_push_claim() from public,anon,authenticated;
grant execute on function public.monitor_push_claim() to service_role;

-- Wake once to resolve an exhausted lease even if there is no other work.
-- This block is omitted only in the isolated database test without pg_cron.
do $$ begin
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.alter_job(
   job_id := (select jobid from cron.job where jobname='retrade-monitor-minute'),
   command := $job$
    select net.http_post(
     url:='https://dvnrxmdejxfuazmpnudj.supabase.co/functions/v1/monitor-service',
     headers:=jsonb_build_object('Content-Type','application/json','x-monitor-token',c.token),
     body:='{"op":"tick"}'::jsonb,timeout_milliseconds:=120000
    ) from monitor_private.config c where c.id
    and (c.lease_until is null or c.lease_until<now())
    and (
     (c.source_status<>'blocked' and (c.retry_at is null or c.retry_at<=now())
      and exists(select 1 from public.monitor_recipes where enabled and not archived and next_run_at<=now()
       and (lease_until is null or lease_until<now())))
     or exists(select 1 from public.monitor_outbox where state in ('pending','sending') and next_attempt_at<=now())
    );
   $job$
  );
 end if;
end $$;
