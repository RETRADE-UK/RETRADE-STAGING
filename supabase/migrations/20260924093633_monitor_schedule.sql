-- RETRADE-STAGING only. The service itself also refuses any other project URL.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('retrade-monitor-minute','* * * * *',$job$
 select net.http_post(
  url:='https://dvnrxmdejxfuazmpnudj.supabase.co/functions/v1/monitor-service',
  headers:=jsonb_build_object('Content-Type','application/json','x-monitor-token',(select token from monitor_private.config where id)),
  body:='{"op":"tick"}'::jsonb,timeout_milliseconds:=120000
 );
$job$);
