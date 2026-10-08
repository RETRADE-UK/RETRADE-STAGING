-- Public-session continuity, durable expiry, and bounded transient recovery.
-- No changes to account credentials, source refusals or the 12-hour trial bound.
create function public.monitor_public_due(p_user uuid) returns boolean
language sql security invoker set search_path='' as $$
 select coalesce((select source_mode='public' and auto_enabled
  and (trial_ends_at is null or trial_ends_at>clock_timestamp())
  and (scan_retry_at is null or scan_retry_at<=now())
  and (state='verified'
    or (state in ('rate_limited','unavailable') and retry_at<=now())
    or (state='testing' and lease_until<=now() and retry_at<=now()))
 from monitor_private.connections where user_id=p_user),false);
$$;

create or replace function public.monitor_public_begin(p_user uuid,p_manual boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c monitor_private.connections;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,45));
 insert into monitor_private.connections(user_id) values(p_user) on conflict do nothing;
 select * into c from monitor_private.connections where user_id=p_user for update;
 if c.retry_at>now() or c.lease_until>now() then return jsonb_build_object('accepted',false,'generation',c.generation,'retryAt',greatest(c.retry_at,c.lease_until)); end if;
 if not p_manual and not public.monitor_public_due(p_user) then raise exception 'Catalogue access needs a manual check'; end if;
 update monitor_private.connections set source_mode='public',
 ciphertext=case when source_mode='public' then ciphertext else null end,
 generation=gen_random_uuid(),auto_enabled=case when source_mode='account' then false else auto_enabled end,
 search_status='unchecked',search_checked_at=null,search_http_status=null,
 attempt=gen_random_uuid(),state='testing',lease_until=now()+interval '90 seconds',retry_at=now()+interval '5 minutes'
 where user_id=p_user returning * into c;
 return jsonb_build_object('accepted',true,'attempt',c.attempt,'generation',c.generation);
end $$;

create function public.monitor_public_session_save(p_user uuid,p_generation uuid,p_ciphertext jsonb,p_expires timestamptz) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_ciphertext) is distinct from 'object' or length(p_ciphertext::text)>30000
  or p_expires is null or not isfinite(p_expires) or p_expires>now()+interval '1 day' then
  raise exception 'Invalid catalogue session';
 end if;
 update monitor_private.connections set ciphertext=p_ciphertext,expires_at=p_expires
 where user_id=p_user and generation=p_generation and source_mode='public' and state='verified';
 return found;
end $$;
revoke all on function public.monitor_public_due(uuid),public.monitor_public_session_save(uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.monitor_public_due(uuid),public.monitor_public_session_save(uuid,uuid,jsonb,timestamptz) to service_role;

create or replace function public.monitor_connection_worker(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('mode',source_mode,'ciphertext',ciphertext,'generation',generation,'expiresAt',expires_at,
 'state',state,'failures',scan_failures,'trialEndsAt',trial_ends_at)
 from monitor_private.connections where user_id=p_user and public.monitor_public_due(p_user);
$$;

create or replace function public.monitor_auto_claim(p_token uuid) returns setof public.monitor_recipes
language plpgsql security invoker set search_path='' as $$
begin
 update monitor_private.connections set auto_enabled=false,scan_status='completed',scan_message='12-hour trial finished. Automatic searches are paused.'
 where auto_enabled and trial_ends_at<=clock_timestamp();
 return query
 update public.monitor_recipes set lease_token=p_token,lease_until=now()+interval '100 seconds',next_run_at=date_trunc('minute',now())+interval '1 minute'
 where id in(select m.id from public.monitor_recipes m where m.enabled and not m.archived and m.next_run_at<=now()
 and (m.lease_until is null or m.lease_until<now()) and public.monitor_public_due(m.user_id)
 order by m.next_run_at,m.last_success_at nulls first limit 5 for update of m skip locked)
 returning *;
end $$;

create or replace function public.monitor_public_failure(p_user uuid,p_generation uuid,p_status text,p_message text,p_retry timestamptz,p_stop boolean,p_http integer,p_requests integer) returns void
language plpgsql security invoker set search_path='' as $$
declare was_running boolean;
begin
 select auto_enabled into was_running from monitor_private.connections
 where user_id=p_user and generation=p_generation and source_mode='public' for update;
 if not found then return; end if;
 perform public.monitor_scan_failure(p_user,p_generation,p_status,p_message,p_retry,p_stop);
 update monitor_private.connections set search_http_status=p_http,scan_requests=p_requests
 where user_id=p_user and generation=p_generation and source_mode='public';
 if was_running and p_stop then
  insert into public.monitor_outbox(subscription_id,payload)
  select s.id,jsonb_build_object('userId',p_user,'title','RETRADE · Vinted monitoring paused',
   'body','Catalogue access needs attention. Open Monitors settings to review the connection.',
   'tag','monitor-connection-paused','kind','connection_status')
  from public.monitor_push_subscriptions s where s.user_id=p_user;
 end if;
end $$;

-- The wakeup, claim and credential reader share the same recoverability predicate.
do $$ begin
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.alter_job(job_id:=(select jobid from cron.job where jobname='retrade-monitor-minute'),schedule:='* * * * *',command:=$job$
   select net.http_post(url:='https://dvnrxmdejxfuazmpnudj.supabase.co/functions/v1/monitor-service',
    headers:=jsonb_build_object('Content-Type','application/json','x-monitor-token',c.token),
    body:='{"op":"tick"}'::jsonb,timeout_milliseconds:=120000)
   from monitor_private.config c where c.id and (c.lease_until is null or c.lease_until<now()) and (
    exists(select 1 from public.monitor_recipes m where m.enabled and not m.archived and m.next_run_at<=now()
     and (m.lease_until is null or m.lease_until<now()) and public.monitor_public_due(m.user_id))
    or exists(select 1 from monitor_private.connections v where v.auto_enabled and v.trial_ends_at<=clock_timestamp())
    or exists(select 1 from public.monitor_outbox where state in ('pending','sending') and attempts<5 and next_attempt_at<=now()));
  $job$);
 end if;
end $$;
