-- Run only against RETRADE-STAGING. All synthetic records are rolled back.
begin;
do $verify$
declare u uuid:=gen_random_uuid(); n integer;
begin
  insert into auth.users(id,aud,role,is_anonymous,raw_user_meta_data)
  values(u,'authenticated','authenticated',true,'{"staging_demo":true,"full_name":"Synthetic seed verification"}');
  select count(*) into n from public.items where user_id=u;
  assert n=120, 'Expected 120 stock items';
  select count(*) into n from public.items where user_id=u and state='sourced' and category<>'' and location<>'' and date_listed is null and listing_fee=0;
  assert n=10, 'Expected 10 complete unlisted items';
  assert exists(select 1 from public.items where user_id=u and state='sold' and date_sold=current_date), 'Current dashboard must be populated';
  assert not exists(select 1 from public.items where user_id=u and (date_sourced>current_date or date_sold>current_date)), 'No future dates';
  assert (select count(*) from public.accounts where user_id=u)=3;
  assert (select count(*) from public.expenses where user_id=u)=16;
  assert (select count(*) from public.activity_log where user_id=u)=320;
  begin
    perform public.retrade_seed_full_staging_user(u);
    raise exception 'FAIL: reseeded an existing account';
  exception when raise_exception then
    if sqlerrm<>'An existing workspace cannot be reseeded' then raise;end if;
  end;
  assert (select count(*) from public.items where user_id=u)=120;
end $verify$;
rollback;
