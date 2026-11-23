-- Restore the historical partner-deletion RPC on an existing RETRADE database.
-- Its signature, definer, search path and privileges match production.
-- An existing deployment owns its function and is left alone.
do $restore$
begin
  if pg_catalog.to_regprocedure('public.retrade_delete_my_account_record(text)') is null then
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
