-- RETRADE Monitors v1 schema
-- Apply in Supabase SQL Editor against the DEV project first.
-- Browser uses the existing authenticated anon client + RLS.
-- Worker uses a SERVICE ROLE key server-side only. Never put that key in app.js.

create extension if not exists pgcrypto;

create or replace function public.retrade_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null default 'vinted',
  enabled boolean not null default true,
  archived boolean not null default false,
  template_key text not null default 'blank',
  category text,
  brand text,
  models jsonb not null default '[]'::jsonb,
  custom_models jsonb not null default '[]'::jsonb,
  search_terms jsonb not null default '[]'::jsonb,
  price_min numeric(10,2) not null default 0 check (price_min >= 0),
  price_max numeric(10,2) not null default 100 check (price_max >= price_min),
  min_profit numeric(10,2) not null default 0 check (min_profit >= 0),
  min_roi numeric(8,2) not null default 0,
  seller_min_reviews integer not null default 5 check (seller_min_reviews >= 0),
  seller_min_rating numeric(3,2) not null default 4.5 check (seller_min_rating between 0 and 5),
  zero_review_mode text not null default 'risky' check (zero_review_mode in ('risky','hide','allow')),
  allowed_conditions jsonb not null default '[]'::jsonb,
  notify_levels jsonb not null default '["snipe","buy"]'::jsonb,
  reject_keywords jsonb not null default '[]'::jsonb,
  warning_keywords jsonb not null default '[]'::jsonb,
  poll_interval_seconds integer not null default 60 check (poll_interval_seconds >= 30),
  config jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitor_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'vinted',
  platform_listing_id text not null,
  url text,
  title text not null,
  description text,
  item_price numeric(10,2),
  delivered_price numeric(10,2),
  currency text not null default 'GBP',
  condition text,
  brand text,
  image_url text,
  image_urls jsonb not null default '[]'::jsonb,
  seller_id text,
  seller_username text,
  seller_rating numeric(5,3),
  seller_reviews integer,
  seller_positive integer,
  seller_neutral integer,
  seller_negative integer,
  seller_created_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id, platform, platform_listing_id)
);

create table if not exists public.monitor_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monitor_id uuid not null references public.monitors(id) on delete cascade,
  listing_id uuid not null references public.monitor_listings(id) on delete cascade,
  matched_model text,
  decision text not null default 'check' check (decision in ('snipe','buy','check','risky')),
  score integer not null default 0 check (score between 0 and 100),
  seller_score integer check (seller_score between 0 and 100),
  seller_risk text check (seller_risk in ('low','medium','high')),
  landed_cost numeric(10,2),
  resale_low numeric(10,2),
  resale_high numeric(10,2),
  projected_profit numeric(10,2),
  roi numeric(10,2),
  reasoning jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','viewed','dismissed','purchased')),
  detected_at timestamptz not null default now(),
  notified_at timestamptz,
  unique(user_id, monitor_id, listing_id)
);

create index if not exists monitors_user_active_idx
  on public.monitors(user_id, enabled, archived);
create index if not exists monitor_listings_user_seen_idx
  on public.monitor_listings(user_id, first_seen_at desc);
create index if not exists monitor_matches_user_detected_idx
  on public.monitor_matches(user_id, detected_at desc);
create index if not exists monitor_matches_monitor_status_idx
  on public.monitor_matches(monitor_id, status, detected_at desc);

drop trigger if exists monitors_set_updated_at on public.monitors;
create trigger monitors_set_updated_at
before update on public.monitors
for each row execute function public.retrade_set_updated_at();

-- Ownership guard: service-role workers can write all users, but no match may
-- accidentally connect rows belonging to different RETRADE accounts.
create or replace function public.retrade_validate_monitor_match_owner()
returns trigger
language plpgsql
as $$
declare
  monitor_owner uuid;
  listing_owner uuid;
begin
  select user_id into monitor_owner from public.monitors where id = new.monitor_id;
  select user_id into listing_owner from public.monitor_listings where id = new.listing_id;
  if monitor_owner is null or listing_owner is null
     or monitor_owner <> new.user_id
     or listing_owner <> new.user_id then
    raise exception 'Monitor match ownership mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists monitor_matches_validate_owner on public.monitor_matches;
create trigger monitor_matches_validate_owner
before insert or update on public.monitor_matches
for each row execute function public.retrade_validate_monitor_match_owner();

alter table public.monitors enable row level security;
alter table public.monitor_listings enable row level security;
alter table public.monitor_matches enable row level security;

drop policy if exists monitors_owner_all on public.monitors;
create policy monitors_owner_all
on public.monitors
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists monitor_listings_owner_select on public.monitor_listings;
create policy monitor_listings_owner_select
on public.monitor_listings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists monitor_matches_owner_select on public.monitor_matches;
create policy monitor_matches_owner_select
on public.monitor_matches
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists monitor_matches_owner_update on public.monitor_matches;
create policy monitor_matches_owner_update
on public.monitor_matches
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- No authenticated INSERT policy on listing/match tables:
-- only the server-side worker should create discovered Vinted rows.


create table if not exists public.monitor_benchmark_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monitor_id uuid not null references public.monitors(id) on delete cascade,
  listing_id uuid references public.monitor_listings(id) on delete cascade,
  platform_listing_id text not null,
  retrade_detected_at timestamptz not null default now(),
  resell_locker_detected_at timestamptz,
  listing_title text,
  item_price numeric(10,2),
  decision text,
  seller_reviews integer,
  seller_rating numeric(5,3),
  notes text,
  created_at timestamptz not null default now(),
  unique(user_id, monitor_id, platform_listing_id)
);

create index if not exists monitor_benchmark_events_monitor_idx
  on public.monitor_benchmark_events(monitor_id, retrade_detected_at desc);

alter table public.monitor_benchmark_events enable row level security;

drop policy if exists monitor_benchmark_owner_select on public.monitor_benchmark_events;
create policy monitor_benchmark_owner_select
on public.monitor_benchmark_events
for select
to authenticated
using (auth.uid() = user_id);

-- The worker creates benchmark events. Browser inserts are intentionally disabled.
