-- Staging catalogue v1.4: isolated public sessions; no account-token fallback.
alter table monitor_private.connections add column source_mode text not null default 'account'
 check(source_mode in ('account','public'));
-- Old authenticated searches cannot resume through the new public worker.
update monitor_private.connections set auto_enabled=false where source_mode='account';

create function public.monitor_public_snapshot(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('mode',source_mode,'state',case when state='testing' and lease_until<=now() then 'unavailable' else state end,
 'ciphertext',case when source_mode='public' then ciphertext end,'generation',generation,'expiresAt',expires_at,'retryAt',retry_at)
 from monitor_private.connections where user_id=p_user;
$$;
create function public.monitor_public_begin(p_user uuid,p_manual boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c monitor_private.connections;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,45));
 insert into monitor_private.connections(user_id) values(p_user) on conflict do nothing;
 select * into c from monitor_private.connections where user_id=p_user for update;
 if c.retry_at>now() or c.lease_until>now() then return jsonb_build_object('accepted',false,'generation',c.generation,'retryAt',greatest(c.retry_at,c.lease_until)); end if;
 if not p_manual and (c.source_mode<>'public' or c.state not in ('verified','rate_limited') or not c.auto_enabled) then raise exception 'Catalogue access needs a manual check'; end if;
 update monitor_private.connections set source_mode='public',ciphertext=null,generation=gen_random_uuid(),
 auto_enabled=case when source_mode='account' then false else auto_enabled end,
 search_status='unchecked',search_checked_at=null,search_http_status=null,expires_at=null,
 attempt=gen_random_uuid(),state='testing',lease_until=now()+interval '90 seconds',retry_at=now()+interval '5 minutes'
 where user_id=p_user returning * into c;
 return jsonb_build_object('accepted',true,'attempt',c.attempt,'generation',c.generation);
end $$;
create function public.monitor_public_persist(p_user uuid,p_generation uuid,p_ciphertext jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_ciphertext) is distinct from 'object' or length(p_ciphertext::text)>30000 then raise exception 'Invalid catalogue session'; end if;
 update monitor_private.connections set ciphertext=p_ciphertext
 where user_id=p_user and generation=p_generation and source_mode='public' and state='verified';
 return found;
end $$;
create function public.monitor_public_failure(p_user uuid,p_generation uuid,p_status text,p_message text,p_retry timestamptz,p_stop boolean,p_http integer,p_requests integer) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform public.monitor_scan_failure(p_user,p_generation,p_status,p_message,p_retry,p_stop);
 update monitor_private.connections set search_http_status=p_http,scan_requests=p_requests
 where user_id=p_user and generation=p_generation and source_mode='public';
end $$;
revoke all on function public.monitor_public_snapshot(uuid),public.monitor_public_begin(uuid,boolean),public.monitor_public_persist(uuid,uuid,jsonb),public.monitor_public_failure(uuid,uuid,text,text,timestamptz,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.monitor_public_snapshot(uuid),public.monitor_public_begin(uuid,boolean),public.monitor_public_persist(uuid,uuid,jsonb),public.monitor_public_failure(uuid,uuid,text,text,timestamptz,boolean,integer,integer) to service_role;

create or replace function public.monitor_connection_status(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('mode',source_mode,'state',case when state='testing' and lease_until<=now() then 'unavailable' else state end,
 'checkedAt',checked_at,'retryAt',retry_at,'expiresAt',expires_at,'stored',ciphertext is not null,
 'checkRetryAt',(select next_attempt_at from monitor_private.session_checks where user_id=p_user),'searchStatus',search_status,'searchCheckedAt',search_checked_at,'searchHttpStatus',search_http_status,
 'canStart',state='verified' and search_status='ready' and search_checked_at>now()-interval '5 minutes' and expires_at>now()+interval '30 seconds',
 'trialStartedAt',trial_started_at,'trialEndsAt',trial_ends_at,'scanChecks',scan_checks,'scanErrors',scan_errors,'automatic',auto_enabled and (trial_ends_at is null or trial_ends_at>clock_timestamp()),'scanStatus',scan_status,'scanMessage',scan_message,'scanCheckedAt',scan_checked_at,
 'scanRetryAt',scan_retry_at,'scanRequests',scan_requests)
 from monitor_private.connections where user_id=p_user and source_mode='public'),jsonb_build_object('mode','public','state','disconnected','stored',false,'automatic',false));
$$;

create or replace function public.monitor_connection_worker(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('mode',source_mode,'ciphertext',ciphertext,'generation',generation,'expiresAt',expires_at,'state',state,'failures',scan_failures,'trialEndsAt',trial_ends_at)
 from monitor_private.connections where user_id=p_user and source_mode='public' and auto_enabled and (trial_ends_at is null or trial_ends_at>clock_timestamp()) and state in ('verified','rate_limited')
 and (scan_retry_at is null or scan_retry_at<=now());
$$;

create or replace function public.monitor_auto_claim(p_token uuid) returns setof public.monitor_recipes
language plpgsql security invoker set search_path='' as $$
begin
 update monitor_private.connections set auto_enabled=false,scan_status='completed',scan_message='12-hour trial finished. Automatic searches are paused.' where auto_enabled and trial_ends_at<=clock_timestamp();
 return query
 update public.monitor_recipes set lease_token=p_token,lease_until=now()+interval '100 seconds',
 next_run_at=date_trunc('minute',now())+interval '1 minute'
 where id in(select m.id from public.monitor_recipes m join monitor_private.connections c on c.user_id=m.user_id
 where m.enabled and not m.archived and m.next_run_at<=now() and (m.lease_until is null or m.lease_until<now())
 and c.source_mode='public' and c.auto_enabled and (c.trial_ends_at is null or c.trial_ends_at>clock_timestamp()) and c.state in ('verified','rate_limited') and (c.scan_retry_at is null or c.scan_retry_at<=now())
 and (c.state<>'rate_limited' or c.retry_at<=now()) order by m.next_run_at,m.last_success_at nulls first limit 5 for update of m skip locked)
 returning *;
end $$;

create or replace function public.monitor_trial_start(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.monitor_recipes where user_id=p_user and enabled and notifications and not archived and coalesce((recipe->>'setupRequired')::boolean,false)=false) then
  raise exception 'Enable a completed monitor with alerts before starting the trial';
 end if;
 update monitor_private.connections set auto_enabled=true,trial_started_at=clock_timestamp(),
  trial_ends_at=clock_timestamp()+interval '12 hours',scan_status='waiting',scan_message='Starting 12-hour trial. The initial baseline is silent.',
  scan_checks=0,scan_errors=0,scan_failures=0,scan_retry_at=null
 where user_id=p_user and source_mode='public' and state='verified' and search_status='ready' and search_checked_at>now()-interval '5 minutes' and expires_at>now()+interval '30 seconds';
 if not found then raise exception 'Check catalogue access successfully before starting the trial'; end if;
 return public.monitor_connection_status(p_user);
end $$;

create or replace function public.monitor_session_finish(p_user uuid,p_check uuid,p_monitor uuid,p_revision integer,
 p_status text,p_http integer,p_received integer,p_items jsonb,p_retry timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c monitor_private.session_checks; m public.monitor_recipes; x jsonb; n integer:=0;
begin
 select * into c from monitor_private.session_checks where user_id=p_user and check_id=p_check for update;
 if not found or c.completed_at is not null then return null; end if;
 select * into m from public.monitor_recipes where id=p_monitor and user_id=p_user for update;
 if not found or m.revision<>p_revision or m.archived then return null; end if;
 if p_status not in ('sample_received','empty','expired','access_rejected','blocked','rate_limited','endpoint_unavailable','schema_changed','timeout','unavailable')
 or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>20
 or p_received not between 0 and 100 or p_received<jsonb_array_length(p_items)
 or (p_status<>'sample_received' and (p_received<>0 or jsonb_array_length(p_items)<>0)) then
  raise exception 'Monitor sample invalid';
 end if;
 for x in select value from jsonb_array_elements(p_items) loop
  if x->'result'->>'status' is null or x->'result'->>'status' <> 'match'
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
