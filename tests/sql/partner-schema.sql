-- This test provisions its own roles, tables and disposable PostgreSQL database.
\set ON_ERROR_STOP on
\set alice '00000000-0000-4000-8000-000000000001'
\set bob '00000000-0000-4000-8000-000000000002'

create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
-- Match Supabase's default public function grants, including explicit anon.
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

create table public.accounts (
  id text primary key, user_id uuid not null, default_split_percent numeric
);
create table public.items (
  id text not null, user_id uuid not null, account_id text, account_item_type text,
  account_split_percent numeric, account_settled boolean, account_paid_amount numeric,
  cost_price numeric, primary key (id, user_id)
);
create table public.account_adjustments (
  id text primary key, account_id text not null references public.accounts(id) on delete cascade
);
create function pg_temp.expect(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Assertion failed: %', message; end if;
end;
$$;

insert into public.accounts values
  ('fixed-a', :'alice', null), ('split-a', :'alice', 35), ('fixed-b', :'bob', null);
insert into public.items values
  ('shared-id', :'alice', 'fixed-a', 'supplier', null, true, 21, 14),
  ('cost-only', :'alice', 'fixed-a', 'supplier', null, false, 0, 12),
  ('mixed', :'alice', 'fixed-a', 'consignment', 20, true, 19, 33),
  ('split', :'alice', 'split-a', 'consignment', 35, false, 10, 18),
  ('shared-id', :'bob', 'fixed-b', 'supplier', null, false, 73, 63),
  ('other-owner-link', :'bob', 'fixed-a', 'supplier', null, true, 80, 90),
  ('orphan-link', :'alice', 'fixed-b', 'supplier', null, true, 6, 7);
insert into public.account_adjustments values ('credit-a','fixed-a'), ('credit-b','fixed-b');

\ir ../../supabase/migrations/20260914122441_add_partner_arrangement_model_v2.sql
\ir ../../supabase/migrations/20261123221855_restore_partner_delete_rpc.sql

select pg_temp.expect((select arrangement_model='fixed_cost' and payment_timing='on_sale'
  from public.accounts where id='fixed-a'), 'fixed-cost terms');
select pg_temp.expect((select arrangement_model='profit_share' and payment_timing='on_sale'
  from public.accounts where id='split-a'), 'split terms');
select pg_temp.expect((select partner_agreed_amount=21 from public.items where id='shared-id'
  and user_id=:'alice'), 'fixed payout precedes cost');
select pg_temp.expect((select partner_agreed_amount=73 from public.items where id='shared-id'
  and user_id=:'bob'), 'other owner can reuse the same stock ID');
select pg_temp.expect((select partner_agreed_amount=12 from public.items where id='cost-only'),
  'cost fallback with zero historical payout');
select pg_temp.expect((select arrangement_model_override='profit_share' and partner_agreed_amount is null
  from public.items where id='mixed'), 'individually negotiated split under a fixed-cost partner');
select pg_temp.expect((select partner_agreed_amount is null from public.items where id='split'),
  'profit-share item is not given a fixed payout');
select pg_temp.expect(not exists (select from public.items where id in ('other-owner-link','orphan-link')
  and (arrangement_model_override is not null or partner_agreed_amount is not null)),
  'backfill respects owner even where the referenced partner ID exists');

update public.accounts set payment_timing='upfront' where id='fixed-a';
update public.items set partner_agreed_amount=32 where id='shared-id' and user_id=:'alice';
\ir ../../supabase/migrations/20260914122441_add_partner_arrangement_model_v2.sql
\ir ../../supabase/migrations/20261123221855_restore_partner_delete_rpc.sql
select pg_temp.expect((select payment_timing='upfront' from public.accounts where id='fixed-a'),
  'rerun preserves amended partner timing');
select pg_temp.expect((select partner_agreed_amount=32 from public.items where id='shared-id'
  and user_id=:'alice'), 'rerun preserves amended stock terms');

select pg_temp.expect(p.prosecdef and p.proowner='postgres'::regrole and p.proconfig @> array['search_path=pg_catalog']
  and not has_function_privilege('anon',p.oid,'execute')
  and has_function_privilege('authenticated',p.oid,'execute')
  and has_function_privilege('service_role',p.oid,'execute'),
  'definer, owner, search path and execution grants')
from pg_proc p where p.oid='public.retrade_delete_my_account_record(text)'::regprocedure;

set role anon;
do $$
begin
  begin
    perform public.retrade_delete_my_account_record('fixed-a');
    raise exception 'Anonymous invocation was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

create temp table stock_before as select * from public.items;
set request.jwt.claim.sub to :'alice';
set role authenticated;
select public.retrade_delete_my_account_record('fixed-b') as foreign_deleted \gset
reset role;
select pg_temp.expect(not :'foreign_deleted'::boolean, 'another owner cannot delete the partner');
select pg_temp.expect(not exists (select * from stock_before except all select * from public.items)
  and not exists (select * from public.items except all select * from stock_before),
  'denied delete leaves all stock untouched, including stale links');
select pg_temp.expect((select count(*)=3 from public.accounts) and (select count(*)=2 from public.account_adjustments),
  'denied delete preserves all partners and adjustments');

set role authenticated;
select public.retrade_delete_my_account_record('fixed-a') as own_deleted \gset
select public.retrade_delete_my_account_record('fixed-a') as repeated \gset
reset role;
select pg_temp.expect(:'own_deleted'::boolean and not :'repeated'::boolean, 'own deletion and repeat');
select pg_temp.expect(not exists (select from public.accounts where id='fixed-a')
  and exists (select from public.accounts where id='fixed-b'), 'only own partner is removed');
select pg_temp.expect(not exists (select from public.account_adjustments where id='credit-a')
  and exists (select from public.account_adjustments where id='credit-b'), 'only own adjustments cascade');
select pg_temp.expect((select count(*)=7 from public.items)
  and not exists (select from public.items where id in ('shared-id','cost-only','mixed') and user_id=:'alice'
  and (account_id is not null or account_item_type is not null or account_split_percent is not null
    or account_settled is distinct from false or account_paid_amount is not null)),
  'stock is retained and legacy partner terms are detached');
select pg_temp.expect(not exists (select * from stock_before where user_id=:'bob'
  except all select * from public.items where user_id=:'bob'), 'other owner stock is unchanged');

-- Exercise the upgrade path independently of the missing-function path above.
-- The text below is the recorded production body, including its original whitespace.
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
$function$;
\ir ../../supabase/migrations/20261123221855_restore_partner_delete_rpc.sql
create temp table stock_after as select * from public.items;
set role authenticated;
select public.retrade_delete_my_account_record('fixed-b') as foreign_after_upgrade \gset
reset role;
select pg_temp.expect(not :'foreign_after_upgrade'::boolean and not exists
  (select * from stock_after except all select * from public.items),
  'known historical body is upgraded and refused delete preserves all stock');

-- Future migrations can supersede this implementation without a replay replacing them.
create or replace function public.retrade_delete_my_account_record(p_account_id text)
returns boolean language plpgsql as $$ begin return true; end; $$;
\ir ../../supabase/migrations/20261123221855_restore_partner_delete_rpc.sql
select pg_temp.expect(prosrc=' begin return true; end; ', 'rerun leaves a later function revision intact')
from pg_proc where oid='public.retrade_delete_my_account_record(text)'::regprocedure;
