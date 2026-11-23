-- Restore a missing partner-delete RPC, or upgrade the recorded legacy body.
-- A separately customised or newer body must retain its own migration history.
do $restore$
declare
  existing_body_hash text;
begin
  select pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r\n', E'\n'))
  into existing_body_hash
  from pg_catalog.pg_proc p
  where p.oid=pg_catalog.to_regprocedure('public.retrade_delete_my_account_record(text)');

  -- Hash of production's historical body after newline normalization.
  if existing_body_hash is null or existing_body_hash='760a74e2361492178b654eba53a987ae' then
    execute $definition$
CREATE OR REPLACE FUNCTION public.retrade_delete_my_account_record(p_account_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  deleted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Check and lock the caller's partner before detaching any linked stock.
  perform 1 from public.accounts
  where user_id=auth.uid() and id=p_account_id
  for update;
  if not found then
    return false;
  end if;

  update public.items
  set account_id=null,
      account_item_type=null,
      account_split_percent=null,
      account_settled=false,
      account_paid_amount=null
  where user_id=auth.uid()
    and account_id=p_account_id;

  delete from public.accounts
  where user_id=auth.uid()
    and id=p_account_id;
  get diagnostics deleted_count = row_count;

  return deleted_count>0;
end;
$function$
$definition$;
    alter function public.retrade_delete_my_account_record(text) owner to postgres;
    revoke execute on function public.retrade_delete_my_account_record(text) from public, anon;
    grant execute on function public.retrade_delete_my_account_record(text) to authenticated, service_role;
  end if;
end;
$restore$;
