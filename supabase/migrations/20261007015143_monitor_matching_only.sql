-- Store only passing listings as finds. Minimal IDs independently establish scan overlap.
alter table public.monitor_recipes add column catalog_seen_ids text[] not null default '{}',
 add column catalog_revision integer;
create function public.monitor_catalog_commit(p_user uuid,p_generation uuid,p_id uuid,p_revision integer,
 p_token uuid,p_items jsonb,p_seen text[],p_complete boolean,p_requests integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ok boolean;
begin
 if p_seen is null or cardinality(p_seen)>500 or exists(select 1 from unnest(p_seen) id where id !~ '^[1-9][0-9]{0,19}$') then raise exception 'Invalid scan identities'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where (x->'result'->>'status') is distinct from 'match') then raise exception 'Only matching finds can be saved'; end if;
 ok:=public.monitor_auto_commit(p_user,p_generation,p_id,p_revision,p_token,p_items,p_complete,p_requests);
 if ok then update public.monitor_recipes set catalog_seen_ids=p_seen,catalog_revision=p_revision where id=p_id and user_id=p_user; end if;
 return ok;
end $$;
revoke all on function public.monitor_catalog_commit(uuid,uuid,uuid,integer,uuid,jsonb,text[],boolean,integer) from public,anon,authenticated;
grant execute on function public.monitor_catalog_commit(uuid,uuid,uuid,integer,uuid,jsonb,text[],boolean,integer) to service_role;

create or replace function public.monitor_history(p_user uuid,p_monitor uuid,p_filter text default 'all',p_query text default '',p_cursor jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare page_rows jsonb; page jsonb; last_row jsonb;
begin
 if not exists(select 1 from public.monitor_recipes where id=p_monitor and user_id=p_user) then raise exception 'Monitor not found'; end if;
 if p_filter not in ('all','new','saved') or length(p_query)>100 then raise exception 'Monitor history filter invalid'; end if;
 -- Current rules only. Old evidence remains retained privately, outside the finds inbox.
 with evidence as (
  select distinct on (listing_id) listing_id,listing,result,revision,confirmed_at,
   min(observed_at) over(partition by listing_id) as observed_at,
   bool_and(baseline) over(partition by listing_id) as baseline
  from public.monitor_matches where monitor_id=p_monitor and revision=(select revision from public.monitor_recipes where id=p_monitor) and result->>'status'='match'
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


-- Diagnostic samples obey the same match-only persistence boundary.
create or replace function public.monitor_session_finish(p_user uuid,p_check uuid,p_monitor uuid,p_revision integer,
 p_status text,p_http integer,p_received integer,p_items jsonb,p_retry timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c monitor_private.session_checks; m public.monitor_recipes; x jsonb; n integer:=0;
begin
 select * into c from monitor_private.session_checks where user_id=p_user and check_id=p_check for update;
 if not found or c.completed_at is not null then return null; end if;
 select * into m from public.monitor_recipes where id=p_monitor and user_id=p_user for update;
 if not found or m.revision<>p_revision or m.archived then return null; end if;
 if p_status not in ('sample_received','empty','expired','blocked','rate_limited','endpoint_unavailable','schema_changed','timeout','unavailable')
 or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>20
 or p_received not between 0 and 20 or p_received<jsonb_array_length(p_items)
 or (p_status<>'sample_received' and (p_received<>0 or jsonb_array_length(p_items)<>0)) then
  raise exception 'Monitor sample invalid';
 end if;
 for x in select value from jsonb_array_elements(p_items) loop
  if x->'result'->>'status' is null or x->'result'->>'status' <> 'match'
   or x->'listing'->>'captureMode' is distinct from 'session_check'
   or (x->'listing'->>'observedAt')::timestamptz<c.attempted_at-interval '1 minute'
   or (x->'listing'->>'observedAt')::timestamptz>now()+interval '1 minute' then
   raise exception 'Monitor sample invalid';
  end if;
  insert into public.monitor_matches(monitor_id,revision,listing_id,listing,result,baseline,observed_at,confirmed_at)
  values(m.id,m.revision,x->'listing'->>'id',x->'listing',x->'result',true,
   (x->'listing'->>'observedAt')::timestamptz,
   case when x->'result'->>'status'='match' then now() else null end)
  on conflict(monitor_id,revision,listing_id) do nothing;
  if found then n:=n+1; end if;
 end loop;
 update monitor_private.session_checks set completed_at=now(),status=p_status,http_status=p_http,
 received=p_received,next_attempt_at=greatest(next_attempt_at,p_retry) where user_id=p_user
 returning * into c;
 return jsonb_build_object('saved',n,'retryAt',c.next_attempt_at,'checkedAt',c.completed_at);
end $$;
