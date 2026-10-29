-- After paid: the 15% cut, bought and photo check, In Addis, handover, holds, refunds and payouts. Rolls back.
begin;

create function must_fail(q text, label text, expect text default null) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if expect is not null and position(expect in sqlerrm) = 0 then
      raise exception '% failed with "%" instead of "%"', label, sqlerrm, expect;
    end if;
    return;
  end;
  raise exception 'expected failure: %', label;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000d1');
insert into profiles (id, first_name, is_admin, active_side) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true, 'receiver'),
  ('00000000-0000-0000-0000-0000000000b1', 'Meron', false, 'receiver'),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false, 'traveler'),
  ('00000000-0000-0000-0000-0000000000d1', 'Sami', false, 'receiver');
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5) on conflict (currency) do update set etb_per_unit = 38.5;
select test_verify('00000000-0000-0000-0000-0000000000c1');
insert into storage.objects (bucket_id, name) values
  ('tickets', '00000000-0000-0000-0000-0000000000c1/t.pdf'),
  ('proofs', '00000000-0000-0000-0000-0000000000b1/pay.jpg'),
  ('proofs', '00000000-0000-0000-0000-0000000000c1/r1.jpg'), ('proofs', '00000000-0000-0000-0000-0000000000c1/i1.jpg'),
  ('proofs', '00000000-0000-0000-0000-0000000000c1/r2.jpg'), ('proofs', '00000000-0000-0000-0000-0000000000c1/i2.jpg');
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status, proof_path) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live', '00000000-0000-0000-0000-0000000000c1/t.pdf');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create function id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;
create function last_note(u text) returns text language sql stable security definer as $$
  select body from notes where user_id = ('00000000-0000-0000-0000-0000000000' || u)::uuid order by created_at desc limit 1
$$;
create function as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || u, true)
$$;
-- Meron asks Hana for an item, Hana names a price, Meron accepts.
create function agreed(n text, reward int) returns void language plpgsql as $$
begin
  perform as_user('b1');
  with r as (insert into requests (kind, trip_id, item_name, item_url, unit_price, currency)
    values ('trip', '10000000-0000-0000-0000-000000000001', 'Perfume ' || n, 'https://zara.com/x', 120, 'AED') returning id) insert into ids select n, r.id from r;
  perform as_user('c1');
  perform make_offer(id(n), '10000000-0000-0000-0000-000000000001', reward);
  perform as_user('b1');
  perform accept_offer((select o.id from offers o where o.request_id = id(n)));
end $$;
-- ...then pays, and the admin confirms.
create function paid(n text, reward int) returns void language plpgsql as $$
begin
  perform agreed(n, reward);
  perform as_user('b1');
  delete from payments where proof_path = '00000000-0000-0000-0000-0000000000b1/pay.jpg' and status = 'refunded';
  insert into ids select n || '_pay', submit_payment(id(n), 'telebirr', '00000000-0000-0000-0000-0000000000b1/pay.jpg');
  perform as_user('a1');
  perform decide_payment(id(n || '_pay'), true);
end $$;

set local role authenticated;

-- 1. The cut: 15% from settings, locked on each order when the price is agreed.
do $$ begin assert fee_pct() = 15, 'cut is 15%'; end $$;
select agreed('fee1', 800);
do $$ declare r requests; begin
  select * into r from requests where id = id('fee1');
  assert (r.fee_pct, r.fee_etb, r.payout_etb) = (15, 120, r.item_etb + 680), 'order at 15%';
end $$;
reset role;
update settings set fee_pct = 20;
set local role authenticated;
select agreed('fee2', 800);
do $$ begin
  assert (select fee_pct from requests where id = id('fee2')) = 20, 'new order at the new rate';
  assert (select fee_pct from requests where id = id('fee1')) = 15, 'earlier order keeps its rate';
end $$;
reset role;
update settings set fee_pct = 15;
set local role authenticated;
select as_user('b1');
insert into requests (kind, trip_id, item_name, item_url, unit_price, currency, fee_pct)
  values ('trip', '10000000-0000-0000-0000-000000000001', 'Cheap cut', 'https://zara.com/x', 120, 'AED', 1);
do $$ begin assert (select fee_pct from requests where item_name = 'Cheap cut') = 15, 'browser cannot set the cut'; end $$;

rollback;
