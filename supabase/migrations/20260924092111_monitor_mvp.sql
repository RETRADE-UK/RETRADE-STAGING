-- Staging monitor MVP. No changes to accounting or existing app tables.
create schema if not exists monitor_private;
revoke all on schema monitor_private from public, anon, authenticated;
create table monitor_private.config (
 id boolean primary key default true check(id), token text not null default gen_random_uuid()::text,
 vapid jsonb, source_status text not null default 'blocked', source_message text not null default 'Vinted refused the staging server (HTTP 403). Live source access is not available.',
 checked_at timestamptz not null default now(), retry_at timestamptz, lease_until timestamptz, lease_token uuid
);
insert into monitor_private.config(id) values(true);
alter table monitor_private.config enable row level security;

create table public.monitor_recipes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 80), recipe jsonb not null check(jsonb_typeof(recipe)='object'),
 preset_key text, enabled boolean not null default false, notifications boolean not null default false, archived boolean not null default false,
 revision integer not null default 1, baseline_at timestamptz, last_success_at timestamptz,
 next_run_at timestamptz not null default now(), status text not null default 'waiting', message text,
 lease_token uuid, lease_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,preset_key)
);
create index monitor_recipes_due on public.monitor_recipes(next_run_at) where enabled and not archived;
create index monitor_recipes_owner on public.monitor_recipes(user_id,created_at);
create table public.monitor_matches (
 monitor_id uuid not null references public.monitor_recipes(id) on delete cascade,
 revision integer not null, listing_id text not null check(listing_id ~ '^[1-9][0-9]{0,19}$'),
 listing jsonb not null, result jsonb not null, baseline boolean not null,
 observed_at timestamptz not null, persisted_at timestamptz not null default now(),
 primary key(monitor_id,revision,listing_id)
);
create index monitor_matches_feed on public.monitor_matches(monitor_id,observed_at desc);
create table public.monitor_comparisons (
 monitor_id uuid not null references public.monitor_recipes(id) on delete cascade,
 revision integer not null, listing_id text not null check(listing_id ~ '^[1-9][0-9]{0,19}$'),
 discord_at timestamptz not null, recorded_at timestamptz not null default now(),
 primary key(monitor_id,revision,listing_id)
);
create table public.monitor_push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique, subscription jsonb not null, created_at timestamptz not null default now()
);
create index monitor_push_owner on public.monitor_push_subscriptions(user_id);
create table public.monitor_outbox (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.monitor_push_subscriptions(id) on delete cascade,
 monitor_id uuid references public.monitor_recipes(id) on delete cascade, revision integer, listing_id text,
 payload jsonb not null, state text not null default 'pending' check(state in ('pending','sending','sent','failed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(), sent_at timestamptz, error text,
 unique(subscription_id,monitor_id,revision,listing_id)
);
create index monitor_outbox_due on public.monitor_outbox(next_attempt_at) where state in ('pending','sending');

-- Browser roles can only read their recipes/evidence. Every write is validated by
-- the authenticated service. Worker/admin state and subscription keys are private.
alter table public.monitor_recipes enable row level security;
alter table public.monitor_matches enable row level security;
alter table public.monitor_comparisons enable row level security;
alter table public.monitor_push_subscriptions enable row level security;
alter table public.monitor_outbox enable row level security;
revoke all on public.monitor_recipes,public.monitor_matches,public.monitor_comparisons,public.monitor_push_subscriptions,public.monitor_outbox from anon,authenticated;
grant select on public.monitor_recipes,public.monitor_matches,public.monitor_comparisons to authenticated;
grant all on public.monitor_recipes,public.monitor_matches,public.monitor_comparisons,public.monitor_push_subscriptions,public.monitor_outbox to service_role;
create policy monitor_owner_read on public.monitor_recipes for select to authenticated
 using(user_id=(select auth.uid()));
create policy monitor_match_owner_read on public.monitor_matches for select to authenticated
 using(exists(select 1 from public.monitor_recipes m where m.id=monitor_id and m.user_id=(select auth.uid())));
create policy monitor_comparison_owner_read on public.monitor_comparisons for select to authenticated
 using(exists(select 1 from public.monitor_recipes m where m.id=monitor_id and m.user_id=(select auth.uid())));

create function public.monitor_config(p_vapid jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_vapid is not null then update monitor_private.config set vapid=p_vapid where id and vapid is null; end if;
 return (select to_jsonb(c) from monitor_private.config c where id);
end $$;

create function public.monitor_source_state(p_status text,p_message text,p_retry timestamptz default null) returns void
language sql security definer set search_path='' as $$
 update monitor_private.config set source_status=p_status,source_message=p_message,retry_at=p_retry,checked_at=now() where id;
$$;

create function public.monitor_tick_lease(p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update monitor_private.config set lease_token=p_token,lease_until=now()+interval '3 minutes'
 where id and (lease_until is null or lease_until<now());
 return found;
end $$;
create function public.monitor_tick_release(p_token uuid) returns void
language sql security definer set search_path='' as $$
 update monitor_private.config set lease_until=null where id and lease_token=p_token;
$$;

create function public.monitor_save(p_user uuid,p_id uuid,p_revision integer,p_data jsonb,p_preset text default null)
returns public.monitor_recipes language plpgsql security definer set search_path='' as $$
declare m public.monitor_recipes; changed boolean;
begin
 -- Serialize per-account limits and preset creation, including parallel tabs.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,42));
 if p_preset is not null then
  select * into m from public.monitor_recipes where user_id=p_user and preset_key=p_preset;
  if found then return m; end if;
 end if;
 if p_id is null then
  if (select count(*) from public.monitor_recipes where user_id=p_user)>=30 then raise exception 'Monitor limit reached (30)'; end if;
  insert into public.monitor_recipes(user_id,name,recipe,enabled,notifications,archived,preset_key)
  values(p_user,p_data->>'name',p_data->'recipe',(p_data->>'enabled')::boolean,(p_data->>'notifications')::boolean,(p_data->>'archived')::boolean,p_preset) returning * into m;
 else
  select * into m from public.monitor_recipes where id=p_id and user_id=p_user for update;
  if not found then raise exception 'Monitor not found'; end if;
  if m.revision<>p_revision then raise exception 'Monitor changed elsewhere. Refresh before saving.'; end if;
  changed:=m.recipe<>p_data->'recipe';
  update public.monitor_recipes set name=p_data->>'name',recipe=p_data->'recipe',
   enabled=(p_data->>'enabled')::boolean,notifications=(p_data->>'notifications')::boolean,archived=(p_data->>'archived')::boolean,
   revision=revision+1,baseline_at=case when changed then null else baseline_at end,
   status=case when changed then 'waiting' else status end,next_run_at=now(),lease_token=null,lease_until=null,updated_at=now()
   where id=p_id returning * into m;
  -- Old settings must never deliver a queued alert after edits/pause/opt-out.
  delete from public.monitor_outbox where monitor_id=p_id and state in ('pending','sending');
  -- Preserve seen identity when only name/notification/pause changed.
  if not changed then
   update public.monitor_matches set revision=m.revision where monitor_id=p_id and revision=p_revision;
   update public.monitor_comparisons set revision=m.revision where monitor_id=p_id and revision=p_revision;
  end if;
 end if;
 return m;
end $$;

create function public.monitor_claim(p_token uuid) returns setof public.monitor_recipes
language sql security definer set search_path='' as $$
 update public.monitor_recipes set lease_token=p_token,lease_until=now()+interval '100 seconds',next_run_at=now()+interval '1 minute'
 where id in(select id from public.monitor_recipes where enabled and not archived and next_run_at<=now()
 and (lease_until is null or lease_until<now()) order by next_run_at limit 5 for update skip locked)
 returning *;
$$;

create function public.monitor_commit(p_id uuid,p_revision integer,p_token uuid,p_items jsonb,p_complete boolean,p_requests integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare m public.monitor_recipes; x jsonb; fresh boolean; baseline boolean;
begin
 select * into m from public.monitor_recipes where id=p_id for update;
 if not found or m.revision<>p_revision or m.lease_token is distinct from p_token or m.lease_until<now() or not m.enabled or m.archived then return false; end if;
 baseline:=m.baseline_at is null;
 for x in select value from jsonb_array_elements(p_items) loop
  insert into public.monitor_matches(monitor_id,revision,listing_id,listing,result,baseline,observed_at)
  values(m.id,m.revision,x->'listing'->>'id',x->'listing',x->'result',baseline,(x->'listing'->>'observedAt')::timestamptz)
  on conflict do nothing;
  fresh:=found;
  if fresh and not baseline and m.notifications and x->'result'->>'status'='match' then
   insert into public.monitor_outbox(subscription_id,monitor_id,revision,listing_id,payload)
   select s.id,m.id,m.revision,x->'listing'->>'id',jsonb_build_object('userId',m.user_id,'title',m.name,'body',left(coalesce(x->'listing'->>'title','New Vinted listing'),180),'tag','monitor-'||m.id||'-'||(x->'listing'->>'id'))
   from public.monitor_push_subscriptions s where s.user_id=m.user_id on conflict do nothing;
  end if;
 end loop;
 update public.monitor_recipes set baseline_at=case when p_complete then coalesce(baseline_at,now()) else baseline_at end,
 last_success_at=now(),status=case when p_complete then 'ready' else 'limited' end,
 message=case when p_complete then 'Catalog scan complete; detail-only matches remain unverified.' else 'Search window was full. Coverage is incomplete.' end,
 lease_until=null,lease_token=null where id=m.id;
 return true;
end $$;

create function public.monitor_push_claim() returns setof public.monitor_outbox
language sql security definer set search_path='' as $$
 update public.monitor_outbox set state='sending',attempts=attempts+1,next_attempt_at=now()+interval '2 minutes'
 where id in(select id from public.monitor_outbox where state in ('pending','sending') and next_attempt_at<=now() and attempts<5
 order by next_attempt_at limit 5 for update skip locked) returning *;
$$;
create function public.monitor_compare(p_user uuid,p_monitor uuid,p_revision integer,p_listing text,p_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.monitor_recipes where id=p_monitor and user_id=p_user and revision=p_revision for update;
 if not found then raise exception 'Monitor changed or is unavailable'; end if;
 insert into public.monitor_comparisons(monitor_id,revision,listing_id,discord_at) values(p_monitor,p_revision,p_listing,p_at)
 on conflict(monitor_id,revision,listing_id) do update set discord_at=least(public.monitor_comparisons.discord_at,excluded.discord_at);
end $$;
create function public.monitor_subscribe(p_user uuid,p_subscription jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,43));
 if (select count(*) from public.monitor_push_subscriptions where user_id=p_user and endpoint<>p_subscription->>'endpoint')>=5 then raise exception 'Monitor push device limit reached (5)'; end if;
 delete from public.monitor_push_subscriptions where endpoint=p_subscription->>'endpoint';
 insert into public.monitor_push_subscriptions(user_id,endpoint,subscription) values(p_user,p_subscription->>'endpoint',p_subscription);
end $$;
-- All privileged RPCs are internal APIs, never executable with public/client keys.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('monitor_config','monitor_source_state','monitor_tick_lease','monitor_tick_release','monitor_save','monitor_claim','monitor_commit','monitor_push_claim','monitor_compare','monitor_subscribe') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
