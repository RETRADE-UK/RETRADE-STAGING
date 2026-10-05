-- Durable per-listing disposition, independent of mutable recipe revisions.
-- Detection evidence stays in monitor_matches; no fabricated or imported finds.
create table public.monitor_item_state (
 monitor_id uuid not null references public.monitor_recipes(id) on delete cascade,
 listing_id text not null check(listing_id ~ '^[1-9][0-9]{0,19}$'),
 saved boolean not null default false, read_at timestamptz,
 primary key(monitor_id,listing_id)
);
alter table public.monitor_item_state enable row level security;
revoke all on public.monitor_item_state from public,anon,authenticated;
grant select on public.monitor_item_state to authenticated;
grant all on public.monitor_item_state to service_role;
create policy monitor_item_owner_read on public.monitor_item_state for select to authenticated
 using(exists(select 1 from public.monitor_recipes m where m.id=monitor_id and m.user_id=(select auth.uid())));
create index monitor_matches_history_identity on public.monitor_matches(monitor_id,listing_id,revision desc)
 where result->>'status' in ('match','pending');

-- Service-role-only invoker RPC: owner comes from server-verified Auth, never the request body.
create function public.monitor_history(p_user uuid,p_monitor uuid,p_filter text default 'all',p_query text default '',p_cursor jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare page_rows jsonb; page jsonb; last_row jsonb;
begin
 if not exists(select 1 from public.monitor_recipes where id=p_monitor and user_id=p_user) then raise exception 'Monitor not found'; end if;
 if p_filter not in ('all','new','saved') or length(p_query)>100 then raise exception 'Monitor history filter invalid'; end if;
 -- One identity across all rule versions. Earliest observation remains the cursor;
 -- newest qualifying snapshot supplies details. Rejected observations are not finds.
 with evidence as (
  select distinct on (listing_id) listing_id,listing,result,revision,confirmed_at,
   min(observed_at) over(partition by listing_id) as observed_at,
   bool_and(baseline) over(partition by listing_id) as baseline
  from public.monitor_matches where monitor_id=p_monitor and result->>'status' in ('match','pending')
  order by listing_id,revision desc
 ), filtered as (
  select e.*,coalesce(s.saved,false) as saved,s.read_at
  from evidence e left join public.monitor_item_state s on s.monitor_id=p_monitor and s.listing_id=e.listing_id
  where (p_filter='all' or (p_filter='saved' and s.saved) or (p_filter='new' and s.read_at is null and not e.baseline and e.result->>'status'='match'))
  and (p_query='' or strpos(lower(coalesce(e.listing->>'title','')||' '||e.listing_id),lower(p_query))>0)
  and (p_cursor is null or (e.observed_at,e.listing_id)<((p_cursor->>'at')::timestamptz,p_cursor->>'id'))
  order by e.observed_at desc,e.listing_id desc limit 51
 ) select coalesce(jsonb_agg(to_jsonb(filtered) order by observed_at desc,listing_id desc),'[]') into page_rows from filtered;
 select coalesce(jsonb_agg(value order by ordinality),'[]') into page from jsonb_array_elements(page_rows) with ordinality where ordinality<=50;
 last_row:=page->49;
 return jsonb_build_object('rows',page,'nextCursor',case when jsonb_array_length(page_rows)>50 then jsonb_build_object('at',last_row->>'observed_at','id',last_row->>'listing_id') else null end);
end $$;

create function public.monitor_set_item_state(p_user uuid,p_monitor uuid,p_listing text,p_saved boolean default null,p_read boolean default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.monitor_recipes where id=p_monitor and user_id=p_user) then raise exception 'Monitor not found'; end if;
 if not exists(select 1 from public.monitor_matches where monitor_id=p_monitor and listing_id=p_listing and result->>'status' in ('match','pending')) then raise exception 'Monitor listing not found'; end if;
 insert into public.monitor_item_state(monitor_id,listing_id,saved,read_at)
 values(p_monitor,p_listing,coalesce(p_saved,false),case when p_read then now() else null end)
 on conflict(monitor_id,listing_id) do update set
 saved=coalesce(p_saved,monitor_item_state.saved),
 read_at=case when p_read is null then monitor_item_state.read_at when p_read then coalesce(monitor_item_state.read_at,now()) else null end;
end $$;
revoke all on function public.monitor_history(uuid,uuid,text,text,jsonb),public.monitor_set_item_state(uuid,uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.monitor_history(uuid,uuid,text,text,jsonb),public.monitor_set_item_state(uuid,uuid,text,boolean,boolean) to service_role;
