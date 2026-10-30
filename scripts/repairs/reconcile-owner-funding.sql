-- Bounded historical reconciliation; payload belongs in the private evidence archive.
-- Back up and simulate first. Set retrade.cash_bridge_repair locally inside one
-- transaction, then execute this block. Existing rows must match the backup.
-- Normal ownership/revision/sync triggers remain enabled. Never replay after success.
do $cash_bridge_repair$
declare
 p jsonb := nullif(current_setting('retrade.cash_bridge_repair',true),'')::jsonb;
 owner_id uuid; tab text; changes jsonb; d jsonb; oldrow jsonb; a jsonb;
 cols text; assignments text; selected text; allowed text[]; n integer; changed integer:=0;
begin
 if p is null then raise exception 'Private verified payload required'; end if;
 owner_id := (p->>'owner_id')::uuid;
 if owner_id is null then raise exception 'Owner required'; end if;
 for tab,changes in select key,value from jsonb_each(p->'changes') loop
  if tab not in ('items','item_returns','expenses','accounts','cash_ledger')
   or jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>40 then
   raise exception 'Unexpected or oversized repair scope';
  end if;
  allowed := case tab
   when 'items' then array['id','user_id','gid','month','item','category','location','source','state','cost_price','date_sourced','date_listed','date_sold','sale_price','postage','shipping_cost','packaging_cost','promo_percent','listing_fee','resale_listing_fee','default_platform','sale_platform','sold_on_platform','account_id','account_item_type','account_settled','is_returned','notes','parts','refresh_history','gross_profit','resale_date_sold','resale_sale_price','resale_postage','resale_platform','resale_shipping_cost','resale_packaging_cost','resale_promo_percent']
   when 'item_returns' then array['id','user_id','item_id','sale_no','type','logged_at','refund_amount','return_postage','date_sold_at_return','sale_price_at_return','postage_at_return','platform_at_return','promo_percent_at_return','shipping_cost_at_return','packaging_cost_at_return','listing_fee_at_return','notes']
   when 'expenses' then array['id','user_id','date','description','amount','category','sourcing_run_id']
   when 'cash_ledger' then array['id','user_id','date','type','category','amount','direction','description','reconcile_anchor']
   when 'accounts' then array['notes'] end;
  for d in select value from jsonb_array_elements(changes) loop
   a:=d->'after';
   if (a->>'user_id')::uuid is distinct from owner_id then raise exception 'Owner mismatch'; end if;
   execute format('select to_jsonb(t) from public.%I t where t.id::text=$1 and t.user_id=$2 for update',tab)
    into oldrow using a->>'id',owner_id;
   if d->'before'='null'::jsonb then
    if oldrow is not null then raise exception 'Already inserted % %',tab,a->>'id'; end if;
    if tab='accounts' then raise exception 'Accounts may only be annotated'; end if;
    if tab='items' and (exists(select 1 from public.items where user_id=owner_id and gid=a->>'gid')
       or (a->>'cost_price')::numeric<0 or (a->>'date_sold')::date<date '2026-04-01') then
      raise exception 'Invalid business stock identity or economics'; end if;
    if tab='cash_ledger' and (a->>'type' not in ('owner_draw','owner_contribution') or (a->>'amount')::numeric<=0) then
      raise exception 'Only positive documented owner flows allowed'; end if;
    if exists(select 1 from jsonb_object_keys(a) k where not k=any(allowed)) then raise exception 'Unexpected insert field'; end if;
    select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k)
      into cols,selected from jsonb_object_keys(a) k;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r',tab,cols,selected,tab) using a;
   else
    if oldrow is distinct from d->'before' then raise exception 'Changed since backup % %',tab,a->>'id'; end if;
    if tab not in ('expenses','accounts') then raise exception 'Unexpected update target'; end if;
    select string_agg(format('%I=r.%I',k,k),',' order by k) into assignments
      from unnest(allowed) k where k not in ('id','user_id');
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=r.id and t.user_id=$2',tab,assignments,tab) using a,owner_id;
   end if;
   get diagnostics n=row_count;
   if n<>1 then raise exception 'Incomplete repair'; end if;
   changed:=changed+1;
  end loop;
 end loop;
 if changed<1 or changed>100 then raise exception 'Unexpected repair count'; end if;
end
$cash_bridge_repair$;
