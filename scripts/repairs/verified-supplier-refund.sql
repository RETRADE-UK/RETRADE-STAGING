-- Evidence-backed repair for one never-received, own-stock purchase.
-- This is a guarded maintenance template, not an automatic backfill.
-- It captures the supplier-refund repair method used during the October audit.
-- Actual identifiers, amounts, receipts and executed statements remain private.
--
-- Run in a caller-owned transaction. Set every setting below with
-- SELECT set_config('<setting>', '<verified value>', true) before this script:
--   retrade.repair_user             UUID of the verified owner
--   retrade.repair_item             Exact item ID
--   retrade.repair_revision         Revision read immediately before repair
--   retrade.repair_cost             Full refund amount; must equal purchase cost
--   retrade.repair_old_source_date  Source date in that pre-repair snapshot
--   retrade.repair_source_date      Purchase date verified from evidence
--   retrade.repair_refund_date      Refund date verified from evidence
--   retrade.repair_note             Evidence summary and date-basis limitations
--
-- Example workflow: BEGIN; set all settings; run this script; inspect the
-- read-back row; COMMIT only if verified, otherwise ROLLBACK.
-- Missing settings, stale data, existing refunds or unexpected economics abort.
-- Repeated application is deliberately rejected rather than duplicating notes.
-- Existing revision, sync, ownership and audit triggers remain enabled.
-- No cash-ledger row is inserted: the item refund is the canonical cash source.

do $repair$
declare
  owner_id uuid := nullif(current_setting('retrade.repair_user', true), '')::uuid;
  target_id text := nullif(current_setting('retrade.repair_item', true), '');
  expected_revision bigint := nullif(current_setting('retrade.repair_revision', true), '')::bigint;
  verified_cost numeric := nullif(current_setting('retrade.repair_cost', true), '')::numeric;
  old_source_date date := nullif(current_setting('retrade.repair_old_source_date', true), '')::date;
  verified_source_date date := nullif(current_setting('retrade.repair_source_date', true), '')::date;
  verified_refund_date date := nullif(current_setting('retrade.repair_refund_date', true), '')::date;
  evidence_note text := nullif(btrim(current_setting('retrade.repair_note', true)), '');
  original public.items%rowtype;
  affected_count integer;
begin
  if owner_id is null or target_id is null or expected_revision is null
     or verified_cost is null or old_source_date is null
     or verified_source_date is null or verified_refund_date is null
     or evidence_note is null then
    raise exception 'All verified repair settings are required; no rows changed';
  end if;
  if expected_revision < 0 or verified_cost::text in ('NaN', 'Infinity', '-Infinity')
     or verified_cost <= 0 or verified_cost <> round(verified_cost, 2)
     or verified_source_date > verified_refund_date
     or verified_refund_date > current_date then
    raise exception 'Invalid verified revision, amount or dates; no rows changed';
  end if;

  select * into strict original
    from public.items
    where user_id = owner_id and id = target_id
    for update;

  if original.revision is distinct from expected_revision
     or original.cost_price is distinct from verified_cost
     or original.date_sourced is distinct from old_source_date
     or original.scrap_reason is distinct from 'scrapped'
     or original.scrapped_at is null
     or original.supplier_refund is not null
     or original.supplier_refund_date is not null
     or original.account_id is not null
     or original.date_sold is not null
     or original.resale_date_sold is not null
     or original.resale_sale_price is not null
     or exists (
       select 1 from public.item_returns r
       where r.user_id = owner_id and r.item_id = target_id
     ) then
    raise exception 'Item no longer matches the verified never-received purchase; no rows changed';
  end if;

  update public.items
     set scrap_reason = 'supplier_return',
         supplier_refund = verified_cost,
         supplier_refund_date = verified_refund_date,
         date_sourced = verified_source_date,
         scrap_note = concat_ws(E'\n', scrap_note, evidence_note)
   where user_id = owner_id and id = target_id
     and revision = expected_revision;

  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Expected exactly one repaired item; transaction must roll back';
  end if;
end;
$repair$;

-- Read-only verification in the same transaction. Confirm the evidence values
-- and revised server revision before committing. Do not add a second cash credit.
select id, user_id, cost_price, date_sourced, scrap_reason,
       supplier_refund, supplier_refund_date, scrap_note, revision, updated_at
from public.items
where user_id = current_setting('retrade.repair_user')::uuid
  and id = current_setting('retrade.repair_item');
