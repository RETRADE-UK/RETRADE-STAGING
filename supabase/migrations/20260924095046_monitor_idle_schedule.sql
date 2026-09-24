-- Keep the minute-level wakeup, but make no Edge call when there is no due work.
select cron.alter_job(
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
   or exists(select 1 from public.monitor_outbox where state in ('pending','sending') and attempts<5 and next_attempt_at<=now())
  );
 $job$
);
