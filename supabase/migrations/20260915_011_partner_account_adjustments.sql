create table if not exists public.account_adjustments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  date date not null default current_date,
  kind text not null default 'partner_loss_contribution'
    check (kind in ('partner_loss_contribution','supplier_credit','manual_credit')),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (length(btrim(reason)) > 0),
  note text,
  item_allocations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(item_allocations) = 'array'),
  applications jsonb not null default '[]'::jsonb
    check (jsonb_typeof(applications) = 'array'),
  status text not null default 'active' check (status in ('active','void')),
  voided_at timestamptz,
  void_reason text,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_adjustments_owner_account_date_idx
  on public.account_adjustments(user_id, account_id, date desc);

alter table public.account_adjustments enable row level security;

revoke all on table public.account_adjustments from anon;
grant select, insert, update, delete on table public.account_adjustments to authenticated;

drop policy if exists account_adjustments_owner_select on public.account_adjustments;
create policy account_adjustments_owner_select
  on public.account_adjustments for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists account_adjustments_owner_insert on public.account_adjustments;
create policy account_adjustments_owner_insert
  on public.account_adjustments for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists account_adjustments_owner_update on public.account_adjustments;
create policy account_adjustments_owner_update
  on public.account_adjustments for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.accounts a
      where a.id = account_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists account_adjustments_owner_delete on public.account_adjustments;
create policy account_adjustments_owner_delete
  on public.account_adjustments for delete
  to authenticated
  using ((select auth.uid()) = user_id);
