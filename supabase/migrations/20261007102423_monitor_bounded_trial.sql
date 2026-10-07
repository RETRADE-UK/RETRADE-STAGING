-- Additive, service-only trial bounds. Credentials and provider payloads stay private.
alter table monitor_private.connections add column trial_started_at timestamptz,
 add column trial_ends_at timestamptz, add column scan_checks bigint not null default 0,
 add column scan_errors bigint not null default 0;
create or replace function public.monitor_connection_status(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('state',case when state='testing' and lease_until<=now() then 'reconnect' else state end,
 'checkedAt',checked_at,'retryAt',retry_at,'expiresAt',expires_at,'stored',ciphertext is not null,
 'trialStartedAt',trial_started_at,'trialEndsAt',trial_ends_at,'scanChecks',scan_checks,'scanErrors',scan_errors,'automatic',auto_enabled and (trial_ends_at is null or trial_ends_at>clock_timestamp()),'scanStatus',scan_status,'scanMessage',scan_message,'scanCheckedAt',scan_checked_at,
 'scanRetryAt',scan_retry_at,'scanRequests',scan_requests)
 from monitor_private.connections where user_id=p_user),jsonb_build_object('state','disconnected','stored',false,'automatic',false));
$$;

create or replace function public.monitor_connection_automatic(p_user uuid,p_enabled boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update monitor_private.connections set auto_enabled=p_enabled,trial_started_at=case when p_enabled then null else trial_started_at end,trial_ends_at=case when p_enabled then null else trial_ends_at end,scan_status='waiting',scan_retry_at=null,scan_failures=0,
 scan_message=case when p_enabled then 'Waiting for the next one-minute scan.' else 'Automatic searches paused.' end
 where user_id=p_user and (not p_enabled or state='verified');
 if not found then raise exception 'Monitor connection must be verified first'; end if;
end $$;

create or replace function public.monitor_connection_worker(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('ciphertext',ciphertext,'generation',generation,'expiresAt',expires_at,'state',state,'failures',scan_failures,'trialEndsAt',trial_ends_at)
 from monitor_private.connections where user_id=p_user and auto_enabled and (trial_ends_at is null or trial_ends_at>clock_timestamp()) and state in ('verified','rate_limited')
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
 and c.auto_enabled and (c.trial_ends_at is null or c.trial_ends_at>clock_timestamp()) and c.state in ('verified','rate_limited') and (c.scan_retry_at is null or c.scan_retry_at<=now())
 and (c.state<>'rate_limited' or c.retry_at<=now()) order by m.next_run_at,m.last_success_at nulls first limit 5 for update of m skip locked)
 returning *;
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
   scan_checks=scan_checks+1,scan_checked_at=now(),scan_retry_at=null,scan_failures=0,scan_requests=p_requests where user_id=p_user;
 end if;
 return ok;
end $$;

create or replace function public.monitor_scan_failure(p_user uuid,p_generation uuid,p_status text,p_message text,p_retry timestamptz,p_stop boolean)
returns void language sql security invoker set search_path='' as $$
 update monitor_private.connections set scan_status=p_status,scan_message=left(p_message,240),scan_retry_at=p_retry,
 scan_checked_at=now(),scan_failures=scan_failures+1,scan_errors=scan_errors+1,auto_enabled=auto_enabled and not p_stop
 where user_id=p_user and generation=p_generation;
$$;
create function public.monitor_trial_start(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.monitor_recipes where user_id=p_user and enabled and notifications and not archived and coalesce((recipe->>'setupRequired')::boolean,false)=false) then
  raise exception 'Enable a completed monitor with alerts before starting the trial';
 end if;
 update monitor_private.connections set auto_enabled=true,trial_started_at=clock_timestamp(),
  trial_ends_at=clock_timestamp()+interval '12 hours',scan_status='waiting',scan_message='Starting 12-hour trial. The initial baseline is silent.',
  scan_checks=0,scan_errors=0,scan_failures=0,scan_retry_at=null
 where user_id=p_user and state='verified';
 if not found then raise exception 'Monitor connection must be verified first'; end if;
 return public.monitor_connection_status(p_user);
end $$;
revoke all on function public.monitor_trial_start(uuid) from public,anon,authenticated;
grant execute on function public.monitor_trial_start(uuid) to service_role;
