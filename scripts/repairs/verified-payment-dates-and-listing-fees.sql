-- Parameterised repair method; actual identifiers, amounts and evidence stay private.
-- Requires the purchase_paid_date migration and the tested reporting readers.
-- In ONE transaction set retrade.payment_fee_repair to the reviewed private JSON
-- payload, then run this block. First run inside BEGIN / ROLLBACK and compare the
-- proposed snapshot in the application runtime. Never replay after success.
-- The caller must retain private before/after snapshots and the execution receipt.
-- No normal ownership, item revision, RLS or sync trigger is disabled.
do $verified_payment_fee_repair$
declare
  p jsonb := nullif(current_setting('retrade.payment_fee_repair', true), '')::jsonb;
  owner_id uuid;
  change jsonb;
  current_row jsonb;
  before_items jsonb := '[]'::jsonb;
  after_row jsonb;
  expected_rows jsonb;
  actual_rows jsonb;
  affected integer;
  expected_amount numeric;
  actual_amount numeric;
begin
  if p is null then raise exception 'Reviewed private payload required'; end if;
  owner_id := (p->>'owner_id')::uuid;
  if owner_id is null
     or jsonb_typeof(p->'item_updates') is distinct from 'array'
     or jsonb_typeof(p->'expense_updates') is distinct from 'array'
     or jsonb_typeof(p->'expense_inserts') is distinct from 'array'
     or jsonb_typeof(p->'item_revision_guards') is distinct from 'array'
     or jsonb_typeof(p->'return_guards') is distinct from 'array'
     or jsonb_typeof(p->'expense_guards') is distinct from 'array'
     or jsonb_typeof(p->'daily_proof') is distinct from 'array' then
    raise exception 'Invalid private repair shape';
  end if;
  if jsonb_array_length(p->'item_updates') not between 1 and 20
     or jsonb_array_length(p->'expense_updates') not between 1 and 24
     or jsonb_array_length(p->'expense_inserts') not between 1 and 400 then
    raise exception 'Unexpected repair scope';
  end if;
  if (p->>'source_from')::date > (p->>'source_through')::date then
    raise exception 'Invalid source window';
  end if;

  -- The dated residuals depend on the complete item-fee input snapshot. Protect
  -- every item revision, return snapshot and expense used in that calculation.
  perform 1 from public.items where user_id=owner_id order by id for update;
  perform 1 from public.item_returns where user_id=owner_id order by id for update;
  perform 1 from public.expenses where user_id=owner_id order by id for update;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by id),'[]'::jsonb)
    into actual_rows from public.items where user_id=owner_id;
  select coalesce(jsonb_agg(v order by v->>'id'),'[]'::jsonb)
    into expected_rows from jsonb_array_elements(p->'item_revision_guards') v;
  if actual_rows is distinct from expected_rows then raise exception 'Item inputs changed since source reconciliation'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id::text),'[]'::jsonb)
    into actual_rows from public.item_returns r where user_id=owner_id;
  select coalesce(jsonb_agg(v order by v->>'id'),'[]'::jsonb)
    into expected_rows from jsonb_array_elements(p->'return_guards') v;
  if actual_rows is distinct from expected_rows then raise exception 'Return inputs changed since source reconciliation'; end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)
    into actual_rows from public.expenses e where user_id=owner_id;
  select coalesce(jsonb_agg(v order by v->>'id'),'[]'::jsonb)
    into expected_rows from jsonb_array_elements(p->'expense_guards') v;
  if actual_rows is distinct from expected_rows then raise exception 'Expenses changed since source reconciliation'; end if;

  if exists(select 1 from jsonb_array_elements(p->'expense_inserts') v
      group by v->>'id' having count(*)<>1)
     or exists(select 1 from jsonb_array_elements(p->'item_updates') v
      group by v->'before'->>'id' having count(*)<>1)
     or exists(select 1 from jsonb_array_elements(p->'expense_updates') v
      group by v->'before'->>'id' having count(*)<>1) then
    raise exception 'Duplicate repair target';
  end if;
  if exists(select 1 from public.expenses e join jsonb_array_elements(p->'expense_inserts') v on e.id=v->>'id') then
    raise exception 'A new expense ID already exists; abort instead of replaying';
  end if;

  -- The evidence proof is externally reproduced from the original statement.
  -- Here verify its arithmetic, complete daily coverage, signs and conserved sum.
  if exists(select 1 from jsonb_array_elements(p->'daily_proof') v
    where (v->>'date')::date not between (p->>'source_from')::date and (p->>'source_through')::date
      or (v->>'source_business_classified')::numeric
         <> (v->>'existing_item_cash_fees')::numeric+(v->>'proposed_expense_adjustment')::numeric)
     or exists(select 1 from jsonb_array_elements(p->'daily_proof') v group by v->>'date' having count(*)<>1) then
    raise exception 'Invalid daily source proof';
  end if;
  if exists(
    with proposed as (
      select (v->>'date')::date d,sum((v->>'amount')::numeric) a
      from jsonb_array_elements(p->'expense_inserts') v group by 1
    ), proof as (
      select (v->>'date')::date d,(v->>'proposed_expense_adjustment')::numeric a
      from jsonb_array_elements(p->'daily_proof') v
    ) select 1 from proposed full join proof using(d) where coalesce(proposed.a,0)<>coalesce(proof.a,0)
  ) then raise exception 'Inserted amounts differ from the daily source proof'; end if;
  select sum((v->'before'->>'amount')::numeric) into expected_amount
    from jsonb_array_elements(p->'expense_updates') v;
  select sum((v->>'amount')::numeric) into actual_amount
    from jsonb_array_elements(p->'expense_inserts') v;
  if actual_amount is distinct from expected_amount then raise exception 'Fee total would change'; end if;
  if exists(
    with old_month as (
      select date_trunc('month',(v->'before'->>'date')::date) m,sum((v->'before'->>'amount')::numeric) a
      from jsonb_array_elements(p->'expense_updates') v group by 1
    ), new_month as (
      select date_trunc('month',(v->>'date')::date) m,sum((v->>'amount')::numeric) a
      from jsonb_array_elements(p->'expense_inserts') v group by 1
    ) select 1 from old_month full join new_month using(m) where coalesce(old_month.a,0)<>coalesce(new_month.a,0)
  ) then raise exception 'Calendar-month fee totals would change'; end if;

  for change in select v from jsonb_array_elements(p->'item_updates') v loop
    select to_jsonb(i) into current_row from public.items i
      where i.id=change->'before'->>'id' and i.user_id=owner_id;
    if current_row is null
       or (change->'before'->>'user_id')::uuid is distinct from owner_id
       or (current_row-array['photo','photo_path','purchase_paid_date']) is distinct from
          ((change->'before')-array['photo','photo_path','purchase_paid_date'])
       or current_row->>'purchase_paid_date' is not null
       or (current_row->>'cost_price')::numeric<=0
       or current_row->>'account_id' is not null
       or (change->>'purchase_paid_date')::date is null then
      raise exception 'Stock payment row changed, already dated or outside own-stock scope';
    end if;
    before_items:=before_items||jsonb_build_array(current_row);
    update public.items i set purchase_paid_date=(change->>'purchase_paid_date')::date,
      client_base_revision=i.revision
      where i.id=current_row->>'id' and i.user_id=owner_id
        and i.revision=(current_row->>'revision')::bigint;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Incomplete stock payment-date update'; end if;
    select to_jsonb(i) into after_row from public.items i where i.id=current_row->>'id' and i.user_id=owner_id;
    if (after_row-array['purchase_paid_date','revision','client_base_revision','updated_at']) is distinct from
       (current_row-array['purchase_paid_date','revision','client_base_revision','updated_at'])
       or after_row->>'purchase_paid_date' is distinct from change->>'purchase_paid_date'
       or (after_row->>'revision')::bigint is distinct from (current_row->>'revision')::bigint+1 then
      raise exception 'Unexpected item change or revision-trigger result';
    end if;
  end loop;

  for change in select v from jsonb_array_elements(p->'expense_updates') v loop
    select to_jsonb(e) into current_row from public.expenses e
      where e.id=change->'before'->>'id' and e.user_id=owner_id;
    if current_row is distinct from change->'before'
       or (change->'after'->>'user_id')::uuid is distinct from owner_id
       or ((change->'after')-array['amount','description']) is distinct from (current_row-array['amount','description'])
       or (change->'after'->>'amount')::numeric<>0 then
      raise exception 'Monthly expense does not match the exact backup or supersession';
    end if;
    update public.expenses e set amount=0,description=change->'after'->>'description'
      where e.id=current_row->>'id' and e.user_id=owner_id;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Incomplete monthly expense supersession'; end if;
  end loop;

  for change in select v from jsonb_array_elements(p->'expense_inserts') v loop
    if (change->>'user_id')::uuid is distinct from owner_id
       or change->>'category' is distinct from 'Platform & payment fees'
       or (change->>'amount')::numeric=0
       or (change->>'date')::date not between (p->>'source_from')::date and (p->>'source_through')::date
       or exists(select 1 from jsonb_object_keys(change) k
         where k not in ('id','user_id','date','description','amount','category','sourcing_run_id')) then
      raise exception 'Unexpected daily expense field, owner, date or amount';
    end if;
    insert into public.expenses(id,user_id,date,description,amount,category,sourcing_run_id)
      select r.id,r.user_id,r.date,r.description,r.amount,r.category,r.sourcing_run_id
      from jsonb_populate_record(null::public.expenses,change) r;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Incomplete daily expense insertion'; end if;
  end loop;

  select coalesce(jsonb_agg(v order by v->>'id'),'[]'::jsonb) into expected_rows from (
    select coalesce((select u->'after' from jsonb_array_elements(p->'expense_updates') u
      where u->'before'->>'id'=e->>'id'),e) v from jsonb_array_elements(p->'expense_guards') e
    union all select v from jsonb_array_elements(p->'expense_inserts') v
  ) expected;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) into actual_rows
    from public.expenses e where user_id=owner_id;
  if actual_rows is distinct from expected_rows then raise exception 'Final expenses differ from the reviewed proposal'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by id),'[]'::jsonb)
    into actual_rows from public.items where user_id=owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',v->>'id','revision',(v->>'revision')::bigint+
      case when exists(select 1 from jsonb_array_elements(p->'item_updates') u
        where u->'before'->>'id'=v->>'id') then 1 else 0 end) order by v->>'id'),'[]'::jsonb)
    into expected_rows from jsonb_array_elements(p->'item_revision_guards') v;
  if actual_rows is distinct from expected_rows then raise exception 'Unexpected final item revision set'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id::text),'[]'::jsonb) into actual_rows
    from public.item_returns r where user_id=owner_id;
  select coalesce(jsonb_agg(v order by v->>'id'),'[]'::jsonb) into expected_rows
    from jsonb_array_elements(p->'return_guards') v;
  if actual_rows is distinct from expected_rows then raise exception 'Return records unexpectedly changed'; end if;
  raise notice 'Verified payment dates and dated fee reconciliation applied atomically; retain private readback receipt';
end
$verified_payment_fee_repair$;
