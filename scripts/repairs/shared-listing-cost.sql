-- Targeted maintenance for a verified four-unit shared-listing order.
-- Call inside a transaction after SET LOCAL retrade.repair_user / repair_bundle.
-- Values are deliberately guarded; this is NOT a general backfill.
-- No schema/auth changes. Existing revision/sync triggers remain enabled.
-- Original fee and canonical cost are retained in each item's audit metadata.
-- The legacy client JSON.parses this JSONB column, so preserve its JSON-string
-- representation (the same format sent by _itemToRow).
do $$
declare
  owner_id uuid := current_setting('retrade.repair_user')::uuid;
  order_id text := current_setting('retrade.repair_bundle');
  affected_count integer;
begin
  perform id from public.items where user_id=owner_id and bundle_id=order_id for update;
  select count(*) into affected_count from public.items where user_id=owner_id and bundle_id=order_id;
  if affected_count<>4 then raise exception 'Expected exactly four verified order members'; end if;
  if (select count(*) from public.items where user_id=owner_id and bundle_id=order_id
      and listing_fee=0.09 and partner_agreed_amount=25
      and (case when jsonb_typeof(refresh_history)='string' then (refresh_history #>> '{}')::jsonb else coalesce(refresh_history,'[]'::jsonb) end) @> '[{"type":"bundle_listing_fee","repair":"20261023-shared-listing-cost"}]'::jsonb)=4 then
    return; -- Idempotent rerun.
  end if;
  if exists(select 1 from public.items where user_id=owner_id and bundle_id=order_id
      and (sale_price is distinct from 45 or bundle_total is distinct from 180
        or cost_price is distinct from 25 or partner_agreed_amount is distinct from 0
        or listing_fee is distinct from 0.36 or account_item_type is distinct from 'supplier'
        or account_paid_amount is not null or account_split_percent is not null
        or arrangement_model_override is not null or account_settled is true
        or is_returned is true or resale_sale_price is not null
        or coalesce(refresh_history,'[]')::jsonb <> '[]'::jsonb)) then
    raise exception 'Order changed since verification; no rows repaired';
  end if;
  if exists(select 1 from public.item_returns r join public.items i on i.id=r.item_id and i.user_id=r.user_id
      where i.user_id=owner_id and i.bundle_id=order_id) then
    raise exception 'Order has returns; review historical allocations first';
  end if;
  update public.items
    set listing_fee=0.09,partner_agreed_amount=cost_price,
      refresh_history=to_jsonb(jsonb_build_array(jsonb_build_object(
        'type','bundle_listing_fee','date',date_listed,'bundleId',bundle_id,'saleNo',1,
        'basis','shared','totalFee',0.36,'previousFee',listing_fee,'allocatedFee',0.09,
        'previousCanonicalAmount',partner_agreed_amount,'repair','20261023-shared-listing-cost'))::text)
    where user_id=owner_id and bundle_id=order_id;
  get diagnostics affected_count = row_count;
  if affected_count<>4 then raise exception 'Unexpected repair count'; end if;
end $$;
