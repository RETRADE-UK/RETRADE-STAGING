-- Authenticated scanning is per account; no global source gate is cleared.
alter table monitor_private.connections add column auto_enabled boolean not null default false,
 add column scan_status text not null default 'waiting', add column scan_message text,
 add column scan_checked_at timestamptz, add column scan_retry_at timestamptz,
 add column scan_failures integer not null default 0, add column scan_requests integer not null default 0;

create or replace function public.monitor_connection_status(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('state',case when state='testing' and lease_until<=now() then 'reconnect' else state end,
 'checkedAt',checked_at,'retryAt',retry_at,'expiresAt',expires_at,'stored',ciphertext is not null,
 'automatic',auto_enabled,'scanStatus',scan_status,'scanMessage',scan_message,'scanCheckedAt',scan_checked_at,
 'scanRetryAt',scan_retry_at,'scanRequests',scan_requests)
 from monitor_private.connections where user_id=p_user),jsonb_build_object('state','disconnected','stored',false,'automatic',false));
$$;
create function public.monitor_connection_automatic(p_user uuid,p_enabled boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update monitor_private.connections set auto_enabled=p_enabled,scan_status='waiting',scan_retry_at=null,scan_failures=0,
 scan_message=case when p_enabled then 'Waiting for the next one-minute scan.' else 'Automatic searches paused.' end
 where user_id=p_user and (not p_enabled or state='verified');
 if not found then raise exception 'Monitor connection must be verified first'; end if;
end $$;
create function public.monitor_connection_worker(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('ciphertext',ciphertext,'generation',generation,'expiresAt',expires_at,'state',state,'failures',scan_failures)
 from monitor_private.connections where user_id=p_user and auto_enabled and state in ('verified','rate_limited')
 and (scan_retry_at is null or scan_retry_at<=now());
$$;
create function public.monitor_auto_claim(p_token uuid) returns setof public.monitor_recipes
language sql security invoker set search_path='' as $$
 update public.monitor_recipes set lease_token=p_token,lease_until=now()+interval '100 seconds',
 next_run_at=date_trunc('minute',now())+interval '1 minute'
 where id in(select m.id from public.monitor_recipes m join monitor_private.connections c on c.user_id=m.user_id
 where m.enabled and not m.archived and m.next_run_at<=now() and (m.lease_until is null or m.lease_until<now())
 and c.auto_enabled and c.state in ('verified','rate_limited') and (c.scan_retry_at is null or c.scan_retry_at<=now())
 and (c.state<>'rate_limited' or c.retry_at<=now()) order by m.next_run_at,m.last_success_at nulls first limit 5 for update of m skip locked)
 returning *;
$$;
create function public.monitor_scan_failure(p_user uuid,p_generation uuid,p_status text,p_message text,p_retry timestamptz,p_stop boolean)
returns void language sql security invoker set search_path='' as $$
 update monitor_private.connections set scan_status=p_status,scan_message=left(p_message,240),scan_retry_at=p_retry,
 scan_checked_at=now(),scan_failures=scan_failures+1,auto_enabled=auto_enabled and not p_stop
 where user_id=p_user and generation=p_generation;
$$;
create function public.monitor_auto_commit(p_user uuid,p_generation uuid,p_id uuid,p_revision integer,p_token uuid,p_items jsonb,p_complete boolean,p_requests integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c monitor_private.connections; ok boolean;
begin
 select * into c from monitor_private.connections where user_id=p_user for update;
 if not found or not c.auto_enabled or c.state<>'verified' or c.generation<>p_generation then return false; end if;
 perform 1 from public.monitor_recipes where id=p_id and user_id=p_user;
 if not found then return false; end if;
 ok:=public.monitor_commit(p_id,p_revision,p_token,p_items,p_complete,p_requests);
 if ok then
  update monitor_private.connections set scan_status=case when p_complete then 'ready' else 'limited' end,
   scan_message=case when p_complete then 'Checking enabled searches every minute. New confirmed matches can alert your devices.' else 'Search window checked; coverage is incomplete until known overlap is found.' end,
   scan_checked_at=now(),scan_retry_at=null,scan_failures=0,scan_requests=p_requests where user_id=p_user;
 end if;
 return ok;
end $$;

-- Receipts are capabilities scoped to one push job; they never grant account access.
alter table public.monitor_outbox add column receipt_token uuid not null default gen_random_uuid(),
 add column device_received_at timestamptz, add column device_displayed_at timestamptz,
 add column device_failed_at timestamptz;
create function public.monitor_push_receipt(p_id uuid,p_token uuid,p_status text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('received','displayed','failed') then return; end if;
 update public.monitor_outbox set device_received_at=coalesce(device_received_at,now()),
 device_displayed_at=case when p_status='displayed' then coalesce(device_displayed_at,now()) else device_displayed_at end,
 device_failed_at=case when p_status='failed' then coalesce(device_failed_at,now()) else device_failed_at end
 where id=p_id and receipt_token=p_token and attempts>0 and next_attempt_at>now()-interval '1 day';
end $$;
create function public.monitor_push_status(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'provider',case when s.endpoint like 'https://%.push.apple.com/%' then 'Apple device' else 'Windows / browser' end,
 'state',o.state,'sentAt',o.sent_at,'receivedAt',o.device_received_at,'displayedAt',o.device_displayed_at,'failedAt',o.device_failed_at,'error',o.error)), '[]'::jsonb)
 from public.monitor_push_subscriptions s left join lateral (
 select * from public.monitor_outbox where subscription_id=s.id order by next_attempt_at desc limit 1
 ) o on true where s.user_id=p_user;
$$;
revoke all on function public.monitor_connection_automatic(uuid,boolean),public.monitor_connection_worker(uuid),
 public.monitor_auto_claim(uuid),public.monitor_scan_failure(uuid,uuid,text,text,timestamptz,boolean),
 public.monitor_auto_commit(uuid,uuid,uuid,integer,uuid,jsonb,boolean,integer),public.monitor_push_receipt(uuid,uuid,text),public.monitor_push_status(uuid) from public,anon,authenticated;
grant execute on function public.monitor_connection_automatic(uuid,boolean),public.monitor_connection_worker(uuid),
 public.monitor_auto_claim(uuid),public.monitor_scan_failure(uuid,uuid,text,text,timestamptz,boolean),
 public.monitor_auto_commit(uuid,uuid,uuid,integer,uuid,jsonb,boolean,integer),public.monitor_push_receipt(uuid,uuid,text),public.monitor_push_status(uuid) to service_role;

-- Only connections explicitly activated after verification wake the scanner.
do $$ begin
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.alter_job(job_id:=(select jobid from cron.job where jobname='retrade-monitor-minute'),schedule:='* * * * *',command:=$job$
   select net.http_post(url:='https://dvnrxmdejxfuazmpnudj.supabase.co/functions/v1/monitor-service',
    headers:=jsonb_build_object('Content-Type','application/json','x-monitor-token',c.token),
    body:='{"op":"tick"}'::jsonb,timeout_milliseconds:=120000)
   from monitor_private.config c where c.id and (c.lease_until is null or c.lease_until<now()) and (
    exists(select 1 from public.monitor_recipes m join monitor_private.connections v on v.user_id=m.user_id
     where m.enabled and not m.archived and m.next_run_at<=now() and (m.lease_until is null or m.lease_until<now())
     and v.auto_enabled and v.state in ('verified','rate_limited') and (v.scan_retry_at is null or v.scan_retry_at<=now())
     and (v.state<>'rate_limited' or v.retry_at<=now()))
    or exists(select 1 from public.monitor_outbox where state in ('pending','sending') and next_attempt_at<=now()));
  $job$);
 end if;
end $$;
