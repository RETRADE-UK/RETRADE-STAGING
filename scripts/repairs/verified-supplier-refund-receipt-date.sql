-- Date-only repair for an existing supplier refund and its display-only ledger mirror.
-- Private payload: owner_id, item_before (full row except photo fields), mirror_before
-- (full row), received_date. Require matching provider identity and bank evidence.
-- Set retrade.supplier_refund_date_repair locally in the SAME transaction.
-- Dry-run with ROLLBACK first; retain private before/after evidence. Do not replay.
-- No receipt, drawing, expense or payment is inserted and no amount is changed.
do $verified_supplier_refund_date$
declare
  p jsonb := nullif(current_setting('retrade.supplier_refund_date_repair',true),'')::jsonb;
  owner_id uuid;
  item_row jsonb;
  mirror_row jsonb;
  after_row jsonb;
  received_date date;
  affected integer;
begin
  if p is null then raise exception 'Reviewed private refund-date payload required'; end if;
  owner_id:=(p->>'owner_id')::uuid;
  received_date:=(p->>'received_date')::date;
  if owner_id is null or received_date is null then raise exception 'Owner and evidenced receipt date required'; end if;
  select to_jsonb(i) into item_row from public.items i
    where i.id=p->'item_before'->>'id' and i.user_id=owner_id for update;
  select to_jsonb(c) into mirror_row from public.cash_ledger c
    where c.id=p->'mirror_before'->>'id' and c.user_id=owner_id for update;
  if item_row is null or mirror_row is null
     or (p->'item_before'->>'user_id')::uuid is distinct from owner_id
     or (p->'mirror_before'->>'user_id')::uuid is distinct from owner_id
     or (item_row-array['photo','photo_path','purchase_paid_date']) is distinct from
        ((p->'item_before')-array['photo','photo_path','purchase_paid_date'])
     or mirror_row is distinct from p->'mirror_before'
     or item_row->>'supplier_refund_date' is not null
     or coalesce((item_row->>'supplier_refund')::numeric,0)<=0
     or (mirror_row->>'amount')::numeric is distinct from (item_row->>'supplier_refund')::numeric
     or mirror_row->>'id' is distinct from 'cash_supret_'||(item_row->>'id')
     or mirror_row->>'type' is distinct from 'supplier_refund'
     or mirror_row->>'direction' is distinct from 'in' then
    raise exception 'Refund or mirror no longer matches the exact reviewed evidence';
  end if;
  update public.items i set supplier_refund_date=received_date,client_base_revision=i.revision
    where i.id=item_row->>'id' and i.user_id=owner_id and i.revision=(item_row->>'revision')::bigint;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Incomplete receipt-date update'; end if;
  select to_jsonb(i) into after_row from public.items i where i.id=item_row->>'id' and i.user_id=owner_id;
  if (after_row-array['supplier_refund_date','revision','client_base_revision','updated_at']) is distinct from
     (item_row-array['supplier_refund_date','revision','client_base_revision','updated_at'])
     or (after_row->>'supplier_refund_date')::date is distinct from received_date
     or (after_row->>'revision')::bigint is distinct from (item_row->>'revision')::bigint+1 then
    raise exception 'Unexpected item financial change or revision result';
  end if;
  update public.cash_ledger c set date=received_date where c.id=mirror_row->>'id' and c.user_id=owner_id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Incomplete display-mirror date update'; end if;
  select to_jsonb(c) into after_row from public.cash_ledger c where c.id=mirror_row->>'id' and c.user_id=owner_id;
  if (after_row-'date') is distinct from (mirror_row-'date')
     or (after_row->>'date')::date is distinct from received_date then
    raise exception 'Display mirror changed beyond the verified date';
  end if;
  raise notice 'Existing supplier refund and display mirror dated; no amounts or additional receipts changed';
end
$verified_supplier_refund_date$;
