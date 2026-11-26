alter table public.job_lots
  add column if not exists category text,
  add column if not exists promo_percent numeric(7,6) not null default 0,
  add column if not exists price_mode text not null default 'linked',
  add column if not exists price_adjustment numeric(14,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.job_lots'::regclass and conname='job_lots_promo_percent_range') then
    alter table public.job_lots add constraint job_lots_promo_percent_range check (promo_percent >= 0 and promo_percent <= 1);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.job_lots'::regclass and conname='job_lots_price_mode_values') then
    alter table public.job_lots add constraint job_lots_price_mode_values check (price_mode in ('linked','fixed'));
  end if;
end $$;
notify pgrst, 'reload schema';
