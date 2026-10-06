-- Only confirmed matches appear in Finds; retain raw evidence for overlap and audits.
create or replace function public.monitor_history(p_user uuid,p_monitor uuid,p_filter text default 'all',p_query text default '',p_cursor jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare page_rows jsonb; page jsonb; last_row jsonb;
begin
 if not exists(select 1 from public.monitor_recipes where id=p_monitor and user_id=p_user) then raise exception 'Monitor not found'; end if;
 if p_filter not in ('all','new','saved') or length(p_query)>100 then raise exception 'Monitor history filter invalid'; end if;
 -- One identity across all rule versions. Earliest observation remains the cursor;
 -- newest snapshot determines eligibility. Pending/rejected observations are not finds.
 with evidence as (
  select distinct on (listing_id) listing_id,listing,result,revision,confirmed_at,
   min(observed_at) over(partition by listing_id) as observed_at,
   bool_and(baseline) over(partition by listing_id) as baseline
  from public.monitor_matches where monitor_id=p_monitor
  order by listing_id,revision desc
 ), filtered as (
  select e.*,coalesce(s.saved,false) as saved,s.read_at
  from evidence e left join public.monitor_item_state s on s.monitor_id=p_monitor and s.listing_id=e.listing_id
  where e.result->>'status'='match'
  and (p_filter='all' or (p_filter='saved' and s.saved) or (p_filter='new' and s.read_at is null and not e.baseline and e.result->>'status'='match'))
  and (p_query='' or strpos(lower(coalesce(e.listing->>'title','')||' '||e.listing_id),lower(p_query))>0)
  and (p_cursor is null or (e.observed_at,e.listing_id)<((p_cursor->>'at')::timestamptz,p_cursor->>'id'))
  order by e.observed_at desc,e.listing_id desc limit 51
 ) select coalesce(jsonb_agg(to_jsonb(filtered) order by observed_at desc,listing_id desc),'[]') into page_rows from filtered;
 select coalesce(jsonb_agg(value order by ordinality),'[]') into page from jsonb_array_elements(page_rows) with ordinality where ordinality<=50;
 last_row:=page->49;
 return jsonb_build_object('rows',page,'nextCursor',case when jsonb_array_length(page_rows)>50 then jsonb_build_object('at',last_row->>'observed_at','id',last_row->>'listing_id') else null end);
end $$;
