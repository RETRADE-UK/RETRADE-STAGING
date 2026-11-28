begin;

alter table public.accounts
  add column if not exists arrangement_model text,
  add column if not exists payment_timing text;

alter table public.items
  add column if not exists arrangement_model_override text,
  add column if not exists partner_agreed_amount numeric;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='accounts_arrangement_model_check') then
    alter table public.accounts add constraint accounts_arrangement_model_check
      check (arrangement_model is null or arrangement_model in ('fixed_cost','profit_share'));
  end if;
  if not exists (select 1 from pg_constraint where conname='accounts_payment_timing_check') then
    alter table public.accounts add constraint accounts_payment_timing_check
      check (payment_timing is null or payment_timing in ('upfront','on_sale'));
  end if;
  if not exists (select 1 from pg_constraint where conname='items_arrangement_model_override_check') then
    alter table public.items add constraint items_arrangement_model_override_check
      check (arrangement_model_override is null or arrangement_model_override in ('fixed_cost','profit_share'));
  end if;
end $$;

-- Translate the existing economics without rewriting any historical field.
-- Existing split-based accounts become profit-share. Existing fixed/no-split
-- accounts become fixed-cost, payable on sale because that is how the current
-- live accounts have been operated.
update public.accounts
set arrangement_model = case
      when default_split_percent is not null then 'profit_share'
      else 'fixed_cost'
    end,
    payment_timing = case
      when default_split_percent is not null then 'on_sale'
      else 'on_sale'
    end
where arrangement_model is null or payment_timing is null;

-- Preserve mixed accounts: an item with an explicit split under a fixed-cost
-- account is a profit-share item override. No existing split is changed.
update public.items i
set arrangement_model_override='profit_share'
from public.accounts a
where i.account_id=a.id
  and i.user_id=a.user_id
  and a.arrangement_model='fixed_cost'
  and i.account_split_percent is not null
  and i.arrangement_model_override is null;

-- Copy the contractual fixed payout into a new field only. Historical
-- account_paid_amount/cost_price/settlement data remain untouched.
update public.items i
set partner_agreed_amount = coalesce(nullif(i.account_paid_amount,0), nullif(i.cost_price,0))
from public.accounts a
where i.account_id=a.id
  and i.user_id=a.user_id
  and coalesce(i.arrangement_model_override,a.arrangement_model)='fixed_cost'
  and i.partner_agreed_amount is null
  and coalesce(nullif(i.account_paid_amount,0), nullif(i.cost_price,0)) is not null;

commit;