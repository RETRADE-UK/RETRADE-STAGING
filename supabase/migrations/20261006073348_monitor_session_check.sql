-- No credentials or raw provider responses are stored. Diagnostics are private.
create table monitor_private.session_checks (
 user_id uuid primary key references auth.users(id) on delete cascade,
 check_id uuid not null, attempted_at timestamptz not null default now(),
 next_attempt_at timestamptz not null, completed_at timestamptz,
 status text not null default 'checking' check(status in
 ('checking','sample_received','empty','expired','blocked','rate_limited','endpoint_unavailable','schema_changed','timeout','unavailable')),
 http_status integer, received integer not null default 0
);
alter table monitor_private.session_checks enable row level security;
revoke all on monitor_private.session_checks from public,anon,authenticated;
grant usage on schema monitor_private to service_role;
grant select,insert,update,delete on monitor_private.session_checks to service_role;

-- Durable per-account cooldown across tabs and Edge instances. A crashed check
-- consumes its attempt, so it cannot become an uncontrolled retry loop.
create function public.monitor_session_claim(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c monitor_private.session_checks;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,44));
 select * into c from monitor_private.session_checks where user_id=p_user for update;
 if found and c.next_attempt_at>now() then
  return jsonb_build_object('accepted',false,'retryAt',c.next_attempt_at);
 end if;
 insert into monitor_private.session_checks(user_id,check_id,next_attempt_at)
 values(p_user,gen_random_uuid(),now()+interval '5 minutes')
 on conflict(user_id) do update set check_id=excluded.check_id,attempted_at=now(),
 next_attempt_at=excluded.next_attempt_at,completed_at=null,status='checking',http_status=null,received=0
 returning * into c;
 return jsonb_build_object('accepted',true,'checkId',c.check_id,'retryAt',c.next_attempt_at);
end $$;

-- Append a small sample to the existing inbox without changing scan leases,
-- enabling a monitor, finishing its baseline or creating notification work.
create function public.monitor_session_finish(p_user uuid,p_check uuid,p_monitor uuid,p_revision integer,
 p_status text,p_http integer,p_received integer,p_items jsonb,p_retry timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c monitor_private.session_checks; m public.monitor_recipes; x jsonb; n integer:=0;
begin
 select * into c from monitor_private.session_checks where user_id=p_user and check_id=p_check for update;
 if not found or c.completed_at is not null then return null; end if;
 select * into m from public.monitor_recipes where id=p_monitor and user_id=p_user for update;
 if not found or m.revision<>p_revision or m.archived then return null; end if;
 if p_status not in ('sample_received','empty','expired','blocked','rate_limited','endpoint_unavailable','schema_changed','timeout','unavailable')
 or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>20
 or p_received not between 0 and 20 or p_received<jsonb_array_length(p_items)
 or (p_status<>'sample_received' and (p_received<>0 or jsonb_array_length(p_items)<>0)) then
  raise exception 'Monitor sample invalid';
 end if;
 for x in select value from jsonb_array_elements(p_items) loop
  if x->'result'->>'status' is null or x->'result'->>'status' not in ('match','pending')
   or x->'listing'->>'captureMode' is distinct from 'session_check'
   or (x->'listing'->>'observedAt')::timestamptz<c.attempted_at-interval '1 minute'
   or (x->'listing'->>'observedAt')::timestamptz>now()+interval '1 minute' then
   raise exception 'Monitor sample invalid';
  end if;
  insert into public.monitor_matches(monitor_id,revision,listing_id,listing,result,baseline,observed_at,confirmed_at)
  values(m.id,m.revision,x->'listing'->>'id',x->'listing',x->'result',true,
   (x->'listing'->>'observedAt')::timestamptz,
   case when x->'result'->>'status'='match' then now() else null end)
  on conflict(monitor_id,revision,listing_id) do nothing;
  if found then n:=n+1; end if;
 end loop;
 update monitor_private.session_checks set completed_at=now(),status=p_status,http_status=p_http,
 received=p_received,next_attempt_at=greatest(next_attempt_at,p_retry) where user_id=p_user
 returning * into c;
 return jsonb_build_object('saved',n,'retryAt',c.next_attempt_at,'checkedAt',c.completed_at);
end $$;
revoke all on function public.monitor_session_claim(uuid),
 public.monitor_session_finish(uuid,uuid,uuid,integer,text,integer,integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.monitor_session_claim(uuid),
 public.monitor_session_finish(uuid,uuid,uuid,integer,text,integer,integer,jsonb,timestamptz) to service_role;
