-- Staging: ciphertext only. The encryption key lives in Supabase Vault.
create table monitor_private.connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 ciphertext jsonb, generation uuid not null default gen_random_uuid(),
 state text not null default 'disconnected' check(state in ('disconnected','testing','verified','reconnect','blocked','rate_limited','unavailable')),
 attempt uuid, lease_until timestamptz, retry_at timestamptz,
 checked_at timestamptz, expires_at timestamptz
);
alter table monitor_private.connections enable row level security;
revoke all on monitor_private.connections from public,anon,authenticated;
grant select,insert,update,delete on monitor_private.connections to service_role;

create function public.monitor_connection_key() returns text
language plpgsql security invoker set search_path='' as $$
declare k text;
begin
 perform pg_catalog.pg_advisory_xact_lock(9281041);
 select decrypted_secret into k from vault.decrypted_secrets where name='monitor_connection_key_v1';
 if k is null then
  k:=encode(extensions.gen_random_bytes(32),'base64');
  perform vault.create_secret(k,'monitor_connection_key_v1','Staging monitor credential encryption key');
 end if;
 return k;
end $$;

create function public.monitor_connection_status(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('state',case when state='testing' and lease_until<=now() then 'reconnect' else state end,
 'checkedAt',checked_at,'retryAt',retry_at,'expiresAt',expires_at,'stored',ciphertext is not null)
 from monitor_private.connections where user_id=p_user),jsonb_build_object('state','disconnected','stored',false));
$$;

create function public.monitor_connection_begin(p_user uuid,p_ciphertext jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c monitor_private.connections;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,45));
 insert into monitor_private.connections(user_id) values(p_user) on conflict do nothing;
 select * into c from monitor_private.connections where user_id=p_user for update;
 if c.retry_at>now() then return jsonb_build_object('accepted',false,'retryAt',c.retry_at); end if;
 if p_ciphertext is null and (c.ciphertext is null or c.state not in ('verified','rate_limited')) then
  raise exception 'Monitor connection needs fresh credentials';
 end if;
 if p_ciphertext is not null and (jsonb_typeof(p_ciphertext) is distinct from 'object' or length(p_ciphertext::text)>30000) then
  raise exception 'Monitor connection invalid';
 end if;
 update monitor_private.connections set ciphertext=coalesce(p_ciphertext,ciphertext),
 generation=case when p_ciphertext is null then generation else gen_random_uuid() end,
 attempt=gen_random_uuid(),state='testing',lease_until=now()+interval '90 seconds',retry_at=now()+interval '5 minutes'
 where user_id=p_user returning * into c;
 return jsonb_build_object('accepted',true,'attempt',c.attempt,'generation',c.generation,'ciphertext',c.ciphertext);
end $$;

create function public.monitor_connection_finish(p_user uuid,p_attempt uuid,p_generation uuid,p_state text,
 p_ciphertext jsonb default null,p_expires timestamptz default null,p_retry timestamptz default null) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('verified','reconnect','blocked','rate_limited','unavailable') then raise exception 'Monitor connection state invalid'; end if;
 if p_state='verified' and (p_ciphertext is null or p_expires<=now() or p_expires is null) then raise exception 'Monitor connection response invalid'; end if;
 update monitor_private.connections set ciphertext=coalesce(p_ciphertext,ciphertext),state=p_state,
 checked_at=now(),expires_at=p_expires,attempt=null,lease_until=null,retry_at=greatest(retry_at,p_retry)
 where user_id=p_user and attempt=p_attempt and generation=p_generation and state='testing' and lease_until>now();
 return found;
end $$;

create function public.monitor_connection_disconnect(p_user uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,45));
 -- Keep cooldown, erase ciphertext and fence every in-flight completion.
 update monitor_private.connections set ciphertext=null,generation=gen_random_uuid(),state='disconnected',
 attempt=null,lease_until=null,expires_at=null where user_id=p_user;
end $$;
revoke all on function public.monitor_connection_key(),public.monitor_connection_status(uuid),
 public.monitor_connection_begin(uuid,jsonb),public.monitor_connection_finish(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz),
 public.monitor_connection_disconnect(uuid) from public,anon,authenticated;
grant execute on function public.monitor_connection_key(),public.monitor_connection_status(uuid),
 public.monitor_connection_begin(uuid,jsonb),public.monitor_connection_finish(uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz),
 public.monitor_connection_disconnect(uuid) to service_role;

create function public.monitor_connection_read(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select ciphertext from monitor_private.connections where user_id=p_user and state='verified' and expires_at>now()+interval '30 seconds';
$$;
revoke all on function public.monitor_connection_read(uuid) from public,anon,authenticated;
grant execute on function public.monitor_connection_read(uuid) to service_role;
