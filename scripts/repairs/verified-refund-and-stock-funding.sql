-- Verified reconciliation repair. Private payload and executed values stay in
-- the user's audit archive, never in Git. Run inside one transaction, after
-- backing up the affected owner's rows. Leave revision/ownership triggers on.
-- Set retrade.repair_payload to {owner, updates:[{t,id,h,revision,p,append}],
-- inserts:[{t,row}]} using verified before-state hashes. Do not use this to
-- manufacture a balancing entry or infer a purchase date.
DO $repair$
DECLARE payload jsonb:=current_setting('retrade.repair_payload')::jsonb;
  owner_id uuid:=(payload->>'owner')::uuid; x jsonb; current_row jsonb;
  patch jsonb; history jsonb; names text; assignments text; n integer;
BEGIN
  FOR x IN SELECT value FROM jsonb_array_elements(payload->'updates') LOOP
    IF x->>'t' NOT IN ('items','cash_ledger') THEN RAISE EXCEPTION 'Unsupported repair table'; END IF;
    EXECUTE format('select to_jsonb(t) from public.%I t where user_id=$1 and id=$2 for update',x->>'t')
      INTO current_row USING owner_id,x->>'id';
    IF current_row IS NULL OR md5(current_row::text)<>x->>'h' THEN RAISE EXCEPTION 'Before-state conflict for %',x->>'id'; END IF;
    IF x ? 'revision' AND current_row->'revision'<>x->'revision' THEN RAISE EXCEPTION 'Revision changed for %',x->>'id'; END IF;
    patch:=coalesce(x->'p','{}'::jsonb);
    IF x ? 'append' THEN
      history:=current_row->'refresh_history';
      IF jsonb_typeof(history)='string' THEN history:=(history#>>'{}')::jsonb; END IF;
      IF history IS NULL OR history='null'::jsonb THEN history:='[]'::jsonb; END IF;
      IF jsonb_typeof(history)<>'array' THEN RAISE EXCEPTION 'Invalid history'; END IF;
      IF EXISTS(select 1 from jsonb_array_elements(history) e where e->>'type'='owner_paid_acquisition') THEN RAISE EXCEPTION 'Funding already recorded'; END IF;
      patch:=patch||jsonb_build_object('refresh_history',history||jsonb_build_array(x->'append'));
    END IF;
    IF EXISTS(select 1 from jsonb_object_keys(patch) k where k NOT IN ('amount','description','date_sourced','listing_fee','resale_listing_fee','resale_postage','resale_shipping_cost','resale_packaging_cost','refresh_history'))
      THEN RAISE EXCEPTION 'Unsupported repair field'; END IF;
    SELECT string_agg(format('%I = r.%I',k,k),', ') INTO assignments FROM jsonb_object_keys(patch) k;
    EXECUTE format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$3) r where t.user_id=$1 and t.id=$2',x->>'t',assignments,x->>'t')
      USING owner_id,x->>'id',patch;
    GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Unexpected update count'; END IF;
  END LOOP;
  FOR x IN SELECT value FROM jsonb_array_elements(payload->'inserts') LOOP
    IF x->>'t' NOT IN ('items','account_adjustments') OR (x->'row'->>'user_id')::uuid<>owner_id THEN RAISE EXCEPTION 'Invalid insertion scope'; END IF;
    SELECT string_agg(format('%I',k),', ') INTO names FROM jsonb_object_keys(x->'row') k;
    EXECUTE format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1)',x->>'t',names,names,x->>'t')
      USING x->'row';
    GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Unexpected insertion count'; END IF;
  END LOOP;
END
$repair$;

