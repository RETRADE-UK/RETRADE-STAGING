-- Retain recent overlap across short pages; no listing content is added.
create or replace function public.monitor_catalog_commit(p_user uuid,p_generation uuid,p_id uuid,p_revision integer,
 p_token uuid,p_items jsonb,p_seen text[],p_complete boolean,p_requests integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ok boolean;
begin
 if p_seen is null or cardinality(p_seen)>500 or exists(select 1 from unnest(p_seen) id where id !~ '^[1-9][0-9]{0,19}$') then raise exception 'Invalid scan identities'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where (x->'result'->>'status') is distinct from 'match') then raise exception 'Only matching finds can be saved'; end if;
 ok:=public.monitor_auto_commit(p_user,p_generation,p_id,p_revision,p_token,p_items,p_complete,p_requests);
 if ok then
  update public.monitor_recipes m set catalog_seen_ids=(
   select coalesce(array_agg(id order by pos),'{}'::text[]) from (
    select id,min(n) as pos from unnest(p_seen || case when m.catalog_revision=p_revision then m.catalog_seen_ids else '{}'::text[] end) with ordinality as ids(id,n)
    group by id order by min(n) limit 500
   ) recent
  ),catalog_revision=p_revision where m.id=p_id and m.user_id=p_user;
 end if;
 return ok;
end $$;
