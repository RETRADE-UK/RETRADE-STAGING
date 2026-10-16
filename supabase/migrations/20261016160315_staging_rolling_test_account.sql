-- STAGING ONLY. New anonymous test accounts receive a rolling recent dataset.
-- Existing accounts and all ownership/RLS policies are untouched.
-- This is the existing restricted trigger helper, not a client-callable RPC.
do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
      and tgname='retrade_staging_seed_user') then
    raise exception 'Staging seed trigger missing: do not apply this migration to production';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.retrade_seed_full_staging_user(p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  g integer;
  j integer;
  k integer;
  iid text;
  d date;
  sold_d date;
  st text;
  nm text;
  cat text;
  src text;
  sale_n numeric;
  cost_n numeric;
  gp_n numeric;
  run_ids uuid[] := array[]::uuid[];
  run_dates date[] := array[(current_date - 101),(current_date - 87),(current_date - 69),(current_date - 53),(current_date - 39),(current_date - 24),(current_date - 10),(current_date - 4)];
  run_names text[] := array['Office Clearance','Consignment Pickup','Camera Lot','Components Collection','Laptop Clearance','Storage Pickup','Marketplace Batch','IT Clearance'];
  run_places text[] := array['Reading','Basingstoke','Guildford','Bracknell','Reading','Farnborough','Hook','Basingstoke'];
  r record;
begin
  if not exists (
    select 1 from auth.users u
    where u.id=p_uid and u.is_anonymous is true
      and coalesce((u.raw_user_meta_data->>'staging_demo')::boolean,false) is true
  ) then
    raise exception 'staging fixture may only seed staging_demo anonymous users';
  end if;


  -- Fresh accounts only: never erase edits or reset an existing workspace.
  if exists(select 1 from public.items where user_id=p_uid)
     or exists(select 1 from public.accounts where user_id=p_uid)
     or exists(select 1 from public.expenses where user_id=p_uid)
     or exists(select 1 from public.cash_ledger where user_id=p_uid)
  then
    raise exception 'An existing workspace cannot be reseeded';
  end if;

  insert into public.user_settings(user_id,default_platform,shipping_policies,theme,country,tax_other_income,tax_region,updated_at)
  values(p_uid,'ebay','[{"name":"Royal Mail Tracked 48","yourCost":3.39,"buyerPays":3.39},{"name":"Evri Medium","yourCost":4.75,"buyerPays":4.75},{"name":"Royal Mail Tracked 24","yourCost":4.49,"buyerPays":4.49}]'::jsonb,'system','GB',0,'rUK',now())
  on conflict(user_id) do update set
    default_platform=excluded.default_platform,
    shipping_policies=excluded.shipping_policies,
    country=excluded.country,
    tax_region=excluded.tax_region,
    updated_at=now();

  insert into public.accounts(id,user_id,name,notes,account_type,default_split_percent,default_cost_contribution) values
    ('stg-partner-'||p_uid,p_uid,'Tom Consignment','Staging partner account — 50/50 profit split','partner',50,0),
    ('stg-supplier-'||p_uid,p_uid,'Office IT Clearance','Staging bought-stock supplier','supplier',null,null),
    ('stg-vinted-'||p_uid,p_uid,'Vinted Sourcing','Staging marketplace sourcing account','supplier',null,null);

  for j in 1..8 loop
    run_ids := array_append(run_ids, gen_random_uuid());
    insert into public.sourcing_runs(id,user_id,name,location,date_started,date_ended,status,notes,created_at,updated_at,started_at_iso,ended_at_iso)
    values(
      run_ids[j],p_uid,run_names[j],run_places[j],
      run_dates[j]::timestamp + time '09:00',
      run_dates[j]::timestamp + time '13:30',
      'ended','Seeded completed sourcing run',now(),now(),
      (run_dates[j]::timestamp + time '09:00')::text,
      (run_dates[j]::timestamp + time '13:30')::text
    );
  end loop;

  for g in 1..120 loop
    iid := 'stg-'||substr(p_uid::text,1,8)||'-'||lpad(g::text,3,'0');
    d := (current_date - 103) + floor(((g-1)*100.0)/119.0)::int;
    sold_d := case when g=115 then current_date else least(d+2,(current_date - 1)) end;
    nm := (array['Samsung 8GB DDR4 RAM','Kingston 16GB DDR4 Kit','WD Blue 500GB SSD','Samsung PM991 256GB NVMe','Dell 1100W PSU','HP EliteBook 840 G8','Lenovo ThinkPad T14','Canon EOS 800D Body','Canon EF-S 18-55mm IS II','Poly Blackwire 5220','Yealink IP Phone','MSI PRO B650-S WIFI','GoPro Karma Grip','2.5in HDD Job Lot','UGREEN USB-C Dock','Logitech C920 Webcam','Elo Touchscreen Display','iiyama 24in Monitor'])[1+((g-1)%18)];
    cat := (array['RAM','RAM','Storage','Storage','Components','Laptops','Laptops','Cameras','Cameras','Audio','Networking','Components','Cameras','Storage','Accessories','Cameras','Displays','Displays'])[1+((g-1)%18)];
    src := (array['Office Clearance','Vinted','Consignment','Auction','Trade-in'])[1+((g-1)%5)];
    case
      when ((g-1)%12) between 0 and 6 then st:='sold';
      when ((g-1)%12) between 7 and 8 then st:='returned';
      when ((g-1)%12) between 9 and 10 then st:='listed';
      else st:='sourced';
    end case;
    sale_n := round((39 + (g%13)*12.50)::numeric,2);
    cost_n := round((8 + (g%10)*8.75)::numeric,2);
    gp_n := round((sale_n-cost_n-3.39-0.55-(sale_n*case when g%4=0 then 0.02 else 0 end))::numeric,2);

    insert into public.items(
      id,gid,month,item,category,location,source,date_sourced,date_listed,date_sold,
      sale_price,postage,cost_price,shipping_cost,packaging_cost,promo_percent,notes,
      is_returned,state,user_id,default_platform,sold_on_platform,est_sale_price,listing_fee,
      account_id,account_split_percent,account_settled,account_item_type,account_paid_amount,
      supplier_refund,supplier_refund_date,sourcing_run_id,gross_profit,sale_platform,
      revision,client_base_revision
    ) values(
      iid,'STG-'||lpad(g::text,4,'0'),upper(to_char(d,'MON-YY')),nm,cat,(array['Shelf A1','Shelf A2','Rack B1','Rack B2'])[1+((g-1)%4)],src,d,
      case when st<>'sourced' then d+1 else null end,
      case when st in ('sold','returned') then sold_d else null end,
      case when st in ('sold','returned') then sale_n when st='listed' then round((sale_n*1.12)::numeric,2) else 0 end,
      case when st in ('sold','returned') then 3.39 else 0 end,
      cost_n,
      case when st in ('sold','returned') then 3.39 else 0 end,
      0.55,case when g%4=0 then 0.02 else 0 end,
      'Full-scale staging fixture item '||g,(st='returned'),st,p_uid,'eBay',
      case when st in ('sold','returned') then 'eBay' else null end,
      round((sale_n*1.12)::numeric,2),case when st<>'sourced' and g%9=0 then 1.50 else 0 end,
      case when g%5=0 then 'stg-partner-'||p_uid else null end,
      case when g%5=0 then 50 else null end,
      case when g%20=0 and st='sold' then true else false end,
      case when g%5=0 then 'consignment' else null end,
      case when g%20=0 and st='sold' then round((gp_n*0.5)::numeric,2) else null end,
      case when g in (14,38,62,86,110) then case when g=62 then 18 else 7.50 end else null end,
      case when g in (14,38,62,86,110) then d+3 else null end,
      run_ids[1+((g-1)%8)],
      case when st in ('sold','returned') then gp_n else null end,
      case when st in ('sold','returned') then 'eBay' else null end,
      0,0
    );
  end loop;

  k:=0;
  for r in
    select id,date_sold,sale_price from public.items
    where user_id=p_uid and state='returned'
    order by date_sold,id
  loop
    k:=k+1;
    insert into public.item_returns(
      item_id,logged_at,type,refund_amount,return_postage,notes,user_id,
      sale_price_at_return,date_sold_at_return,sale_no,platform_at_return,
      postage_at_return,shipping_cost_at_return,packaging_cost_at_return,promo_percent_at_return
    ) values(
      r.id,least(r.date_sold+3,(current_date - 1)),'full_ebay',r.sale_price,
      case when k%3=0 then 4.75 else 3.39 end,
      case when k%4=0 then 'Buyer return — item received back and inspected' else 'Full buyer return' end,
      p_uid,r.sale_price,r.date_sold,
      case when k in (1,2) then 2 else 1 end,'eBay',3.39,3.39,0.55,0.02
    );
    if k in (1,2) then
      insert into public.item_returns(
        item_id,logged_at,type,refund_amount,return_postage,notes,relisted_at,relist_condition,user_id,
        sale_price_at_return,date_sold_at_return,sale_price_at_relist,postage_at_relist,
        shipping_cost_at_relist,packaging_cost_at_relist,promo_percent_at_relist,sale_no,
        platform_at_return,platform_at_relist
      ) values(
        r.id,greatest(r.date_sold-12,(current_date - 99)),'full_ebay',round((r.sale_price*0.92)::numeric,2),3.39,
        'Previous return cycle — relisted and sold again',greatest(r.date_sold-9,(current_date - 96)),'Very Good',p_uid,
        round((r.sale_price*0.92)::numeric,2),greatest(r.date_sold-15,(current_date - 102)),r.sale_price,3.39,3.39,0.55,0.02,1,'eBay','eBay'
      );
    end if;
  end loop;

  k:=0;
  for r in
    select id,date_sold,sale_price from public.items
    where user_id=p_uid and state='sold'
    order by date_sold,id
    limit 6
  loop
    k:=k+1;
    insert into public.item_returns(item_id,logged_at,type,refund_amount,return_postage,notes,user_id,sale_price_at_return,date_sold_at_return,sale_no,platform_at_return)
    values(r.id,least(r.date_sold+2,(current_date - 1)),'partial_ebay',round((6+k*2.5)::numeric,2),0,'Partial refund — buyer kept item',p_uid,r.sale_price,r.date_sold,1,'eBay');
  end loop;

  for g in 1..14 loop
    insert into public.item_parts(item_id,description,cost,user_id,date)
    values(
      'stg-'||substr(p_uid::text,1,8)||'-'||lpad((2+g*5)::text,3,'0'),
      (array['Replacement charger','Battery','USB adapter','SATA cable','Thermal pads','Screen bezel','Camera cap'])[1+((g-1)%7)],
      round((3.50+(g%6)*4.25)::numeric,2),p_uid,
      (current_date - 99) + g*6
    );
  end loop;

  for g in 1..16 loop
    insert into public.expenses(id,date,description,amount,category,user_id,sourcing_run_id)
    values(
      'stg-exp-'||substr(p_uid::text,1,8)||'-'||lpad(g::text,2,'0'),
      (current_date - 100) + g*6,
      (array['Parking','Packing materials','Storage boxes','Fuel contribution','eBay shop fee','Printer labels','Cleaning supplies','Courier surcharge'])[1+((g-1)%8)],
      round((4.50+(g%7)*6.35)::numeric,2),
      (array['Travel','Packaging','Supplies','Travel','Fees','Packaging','Supplies','Postage'])[1+((g-1)%8)],
      p_uid,run_ids[1+((g-1)%8)]
    );
  end loop;

  for g in 1..8 loop
    insert into public.trips(id,date,description,mileage,rate_per_mile,user_id,expenses,sourcing_run_id)
    values(
      'stg-trip-'||substr(p_uid::text,1,8)||'-'||g,
      run_dates[g],run_places[g]||' sourcing collection',20+(g*7),0.45,p_uid,
      case when g%3=0 then '[{"description":"Parking","amount":6.5}]'::jsonb else '[]'::jsonb end,
      run_ids[g]
    );
  end loop;

  insert into public.cash_ledger(id,user_id,date,type,category,amount,direction,description,reconcile_anchor) values
    ('stg-cash-01-'||substr(p_uid::text,1,8),p_uid,(current_date - 103),'adjustment','Opening',750,'in','Opening staging cash balance',true),
    ('stg-cash-02-'||substr(p_uid::text,1,8),p_uid,(current_date - 92),'owner_injection','Capital',300,'in','Owner top-up',false),
    ('stg-cash-03-'||substr(p_uid::text,1,8),p_uid,(current_date - 76),'withdrawal','Owner',100,'out','Owner withdrawal',false),
    ('stg-cash-04-'||substr(p_uid::text,1,8),p_uid,(current_date - 66),'supplier_refund','Supplier',42.50,'in','Supplier partial refund',false),
    ('stg-cash-05-'||substr(p_uid::text,1,8),p_uid,(current_date - 56),'partner_payment','Partner',135,'out','Tom partner payment',false),
    ('stg-cash-06-'||substr(p_uid::text,1,8),p_uid,(current_date - 43),'adjustment','Bank',18.25,'in','Bank reconciliation adjustment',false),
    ('stg-cash-07-'||substr(p_uid::text,1,8),p_uid,(current_date - 34),'owner_injection','Capital',250,'in','Working capital top-up',false),
    ('stg-cash-08-'||substr(p_uid::text,1,8),p_uid,(current_date - 23),'supplier_refund','Supplier',68,'in','Clearance batch credit',false),
    ('stg-cash-09-'||substr(p_uid::text,1,8),p_uid,(current_date - 13),'partner_payment','Partner',165,'out','Partner settlement',false),
    ('stg-cash-10-'||substr(p_uid::text,1,8),p_uid,(current_date - 7),'withdrawal','Owner',80,'out','Owner withdrawal',false),
    ('stg-cash-11-'||substr(p_uid::text,1,8),p_uid,(current_date - 2),'adjustment','Bank',12.40,'out','Postage reconciliation',false);

  insert into public.job_lots(id,user_id,name,status,date_created,date_listed,date_sold,sale_price,platform,notes) values
    ('stg-lot-hdd-'||substr(p_uid::text,1,8),p_uid,'Mixed 2.5in HDD Job Lot','listed',(current_date - 23),(current_date - 22),null,null,'eBay','8 health-checked drives'),
    ('stg-lot-ram-'||substr(p_uid::text,1,8),p_uid,'DDR3L RAM Job Lot','sold',(current_date - 62),(current_date - 61),(current_date - 55),69.99,'eBay','Multi-stick RAM lot'),
    ('stg-lot-parts-'||substr(p_uid::text,1,8),p_uid,'Laptop Parts Lot','building',(current_date - 6),null,null,null,null,'Parts awaiting bundling');

  insert into public.job_lot_items(id,user_id,job_lot_id,item_id,added_at,cost_basis_at_add,notes) values
    ('stg-jli-1-'||substr(p_uid::text,1,8),p_uid,'stg-lot-hdd-'||substr(p_uid::text,1,8),'stg-'||substr(p_uid::text,1,8)||'-014',(current_date - 23),42,'Storage lot member'),
    ('stg-jli-2-'||substr(p_uid::text,1,8),p_uid,'stg-lot-ram-'||substr(p_uid::text,1,8),'stg-'||substr(p_uid::text,1,8)||'-001',(current_date - 62),8,'RAM lot member'),
    ('stg-jli-3-'||substr(p_uid::text,1,8),p_uid,'stg-lot-ram-'||substr(p_uid::text,1,8),'stg-'||substr(p_uid::text,1,8)||'-002',(current_date - 62),19.25,'RAM lot member'),
    ('stg-jli-4-'||substr(p_uid::text,1,8),p_uid,'stg-lot-parts-'||substr(p_uid::text,1,8),'stg-'||substr(p_uid::text,1,8)||'-111',(current_date - 6),17.50,'Parts lot member');

  for g in 1..320 loop
    d := (current_date - 103) + floor(((g-1)*101.0)/319.0)::int;
    k := 1+((g-1)%120);
    insert into public.activity_log(id,user_id,item_id,item_name,action,from_state,to_state,month,after_summary,ts,undoable,undone,origin)
    values(
      'stg-act-'||substr(p_uid::text,1,8)||'-'||lpad(g::text,3,'0'),p_uid,
      'stg-'||substr(p_uid::text,1,8)||'-'||lpad(k::text,3,'0'),'Demo item '||k,
      case when g%11=0 then 'Returned' when g%7=0 then 'Marked sold' when g%5=0 then 'Listed' else 'Edited' end,
      case when g%11=0 then 'sold' when g%7=0 then 'listed' when g%5=0 then 'sourced' else null end,
      case when g%11=0 then 'returned' when g%7=0 then 'sold' when g%5=0 then 'listed' else null end,
      upper(to_char(d,'MON-YY')),'Synthetic staging activity',
      (extract(epoch from (d::timestamp + time '09:00' + ((g%9)||' hours')::interval))*1000)::bigint,
      false,false,'staging-seed'
    );
  end loop;

  insert into public.sale_reconciliations(id,user_id,attached_item_id,target_sale_item_id,treatment,status,prior_order_total,resulting_order_total,additional_revenue,prior_allocation,resulting_allocation,pnl_delta,note,created_at)
  values(
    'stg-rec-'||substr(p_uid::text,1,8),p_uid,
    'stg-'||substr(p_uid::text,1,8)||'-010','stg-'||substr(p_uid::text,1,8)||'-011',
    'attach_to_sale','complete',80,105,25,'{}'::jsonb,'{}'::jsonb,'{"revenue":25}'::jsonb,'Bundle reconciliation staging example',(current_date - 28)
  );
end;
$function$;


revoke all on function public.retrade_seed_full_staging_user(uuid) from public, anon, authenticated;
grant execute on function public.retrade_seed_full_staging_user(uuid) to service_role;
