-- Separate renewable credentials from demonstrated catalogue access.
-- No credential values or upstream response bodies are added to diagnostics.
alter table monitor_private.connections
 add column search_status text not null default 'unchecked' check(search_status in ('unchecked','ready','empty','access_rejected','blocked','rate_limited','endpoint_unavailable','schema_changed','timeout','unavailable')),
 add column search_checked_at timestamptz,
 add column search_http_status integer;
-- Existing refused searches remain refused; a successful renewal is not a passed search.
update monitor_private.connections set search_status=case when scan_message like '%HTTP 401%' then 'access_rejected' when scan_status='blocked' then 'blocked' else 'unchecked' end,
 search_checked_at=case when scan_status='blocked' then scan_checked_at end,
 search_http_status=case when scan_message like '%HTTP 401%' then 401 end;
alter table monitor_private.session_checks drop constraint session_checks_status_check;
alter table monitor_private.session_checks add constraint session_checks_status_check check(status in
 ('checking','sample_received','empty','expired','access_rejected','blocked','rate_limited','endpoint_unavailable','schema_changed','timeout','unavailable'));

create function public.monitor_connection_snapshot(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('state',case when state='testing' and lease_until<=now() then 'unavailable' else state end,
 'ciphertext',ciphertext,'generation',generation,'expiresAt',expires_at,'retryAt',retry_at)
 from monitor_private.connections where user_id=p_user;
$$;

create function public.monitor_connection_access(p_user uuid,p_generation uuid,p_status text,p_http integer) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('sample_received','empty','access_rejected','blocked','rate_limited','endpoint_unavailable','schema_changed','timeout','unavailable') then raise exception 'Invalid connection check'; end if;
 update monitor_private.connections set search_status=case when p_status='sample_received' then 'ready' else p_status end,
 search_checked_at=now(),search_http_status=p_http
 where user_id=p_user and generation=p_generation and state='verified';
 return found;
end $$;
revoke all on function public.monitor_connection_snapshot(uuid),public.monitor_connection_access(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.monitor_connection_snapshot(uuid),public.monitor_connection_access(uuid,uuid,text,integer) to service_role;

create or replace function public.monitor_connection_status(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('state',case when state='testing' and lease_until<=now() then 'unavailable' else state end,
 'checkedAt',checked_at,'retryAt',retry_at,'expiresAt',expires_at,'stored',ciphertext is not null,
 'checkRetryAt',(select next_attempt_at from monitor_private.session_checks where user_id=p_user),'searchStatus',search_status,'searchCheckedAt',search_checked_at,'searchHttpStatus',search_http_status,
 'canStart',state='verified' and search_status='ready' and search_checked_at>now()-interval '5 minutes' and expires_at>now()+interval '30 seconds',
 'trialStartedAt',trial_started_at,'trialEndsAt',trial_ends_at,'scanChecks',scan_checks,'scanErrors',scan_errors,'automatic',auto_enabled and (trial_ends_at is null or trial_ends_at>clock_timestamp()),'scanStatus',scan_status,'scanMessage',scan_message,'scanCheckedAt',scan_checked_at,
 'scanRetryAt',scan_retry_at,'scanRequests',scan_requests)
 from monitor_private.connections where user_id=p_user),jsonb_build_object('state','disconnected','stored',false,'automatic',false));
$$;

create or replace function public.monitor_connection_begin(p_user uuid,p_ciphertext jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c monitor_private.connections;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,45));
 insert into monitor_private.connections(user_id) values(p_user) on conflict do nothing;
 select * into c from monitor_private.connections where user_id=p_user for update;
 if c.retry_at>now() then return jsonb_build_object('accepted',false,'retryAt',c.retry_at); end if;
 if p_ciphertext is null and (c.ciphertext is null or c.state not in ('verified','rate_limited')) then
  raise exception 'Saved connection needs review before renewal';
 end if;
 if p_ciphertext is not null and (jsonb_typeof(p_ciphertext) is distinct from 'object' or length(p_ciphertext::text)>30000) then
  raise exception 'Monitor connection invalid';
 end if;
 update monitor_private.connections set ciphertext=coalesce(p_ciphertext,ciphertext),
 generation=gen_random_uuid(),search_status='unchecked',search_checked_at=null,search_http_status=null,
 attempt=gen_random_uuid(),state='testing',lease_until=now()+interval '90 seconds',retry_at=now()+interval '5 minutes'
 where user_id=p_user returning * into c;
 return jsonb_build_object('accepted',true,'attempt',c.attempt,'generation',c.generation,'ciphertext',c.ciphertext);
end $$;

create or replace function public.monitor_connection_disconnect(p_user uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,45));
 -- Keep cooldown, erase ciphertext and fence every in-flight completion.
 update monitor_private.connections set ciphertext=null,generation=gen_random_uuid(),state='disconnected',
 attempt=null,lease_until=null,expires_at=null,auto_enabled=false,search_status='unchecked',search_checked_at=null,search_http_status=null where user_id=p_user;
end $$;

create or replace function public.monitor_auto_commit(p_user uuid,p_generation uuid,p_id uuid,p_revision integer,p_token uuid,p_items jsonb,p_complete boolean,p_requests integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c monitor_private.connections; ok boolean;
begin
 select * into c from monitor_private.connections where user_id=p_user for update;
 if not found or (c.trial_ends_at is not null and c.trial_ends_at<=clock_timestamp()) or not c.auto_enabled or c.state<>'verified' or c.generation<>p_generation then return false; end if;
 perform 1 from public.monitor_recipes where id=p_id and user_id=p_user;
 if not found then return false; end if;
 ok:=public.monitor_commit(p_id,p_revision,p_token,p_items,p_complete,p_requests);
 if ok then
  update monitor_private.connections set scan_status=case when p_complete then 'ready' else 'limited' end,
   scan_message=case when p_complete then 'Checking enabled searches every minute. New confirmed matches can alert your devices.' else 'Search window checked; coverage is incomplete until known overlap is found.' end,
   search_status='ready',search_checked_at=now(),search_http_status=200,scan_checks=scan_checks+1,scan_checked_at=now(),scan_retry_at=null,scan_failures=0,scan_requests=p_requests where user_id=p_user;
 end if;
 return ok;
end $$;

create or replace function public.monitor_scan_failure(p_user uuid,p_generation uuid,p_status text,p_message text,p_retry timestamptz,p_stop boolean)
returns void language sql security invoker set search_path='' as $$
 update monitor_private.connections set scan_status=p_status,scan_message=left(p_message,240),scan_retry_at=p_retry,
 search_status=case when p_message like '%(401)%' or p_message like '%HTTP 401%' then 'access_rejected' when p_status='rate_limited' then 'rate_limited' when p_status='blocked' then 'blocked' else 'unavailable' end,search_checked_at=now(),
 scan_checked_at=now(),scan_failures=scan_failures+1,scan_errors=scan_errors+1,auto_enabled=auto_enabled and not p_stop
 where user_id=p_user and generation=p_generation;
$$;

create or replace function public.monitor_trial_start(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.monitor_recipes where user_id=p_user and enabled and notifications and not archived and coalesce((recipe->>'setupRequired')::boolean,false)=false) then
  raise exception 'Enable a completed monitor with alerts before starting the trial';
 end if;
 update monitor_private.connections set auto_enabled=true,trial_started_at=clock_timestamp(),
  trial_ends_at=clock_timestamp()+interval '12 hours',scan_status='waiting',scan_message='Starting 12-hour trial. The initial baseline is silent.',
  scan_checks=0,scan_errors=0,scan_failures=0,scan_retry_at=null
 where user_id=p_user and state='verified' and search_status='ready' and search_checked_at>now()-interval '5 minutes' and expires_at>now()+interval '30 seconds';
 if not found then raise exception 'Check the saved search successfully before starting the trial'; end if;
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
 or p_received not between 0 and 20 or p_received<jsonb_array_length(p_items)
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

-- Commit a saved-session sample and its connection health under the same fence.
create function public.monitor_saved_session_finish(p_user uuid,p_generation uuid,p_check uuid,p_monitor uuid,p_revision integer,
 p_status text,p_http integer,p_received integer,p_items jsonb,p_retry timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 perform 1 from monitor_private.connections where user_id=p_user and generation=p_generation and state='verified' for update;
 if not found then return null; end if;
 result:=public.monitor_session_finish(p_user,p_check,p_monitor,p_revision,p_status,p_http,p_received,p_items,p_retry);
 if result is not null then perform public.monitor_connection_access(p_user,p_generation,p_status,p_http); end if;
 return result;
end $$;
revoke all on function public.monitor_saved_session_finish(uuid,uuid,uuid,uuid,integer,text,integer,integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.monitor_saved_session_finish(uuid,uuid,uuid,uuid,integer,text,integer,integer,jsonb,timestamptz) to service_role;
