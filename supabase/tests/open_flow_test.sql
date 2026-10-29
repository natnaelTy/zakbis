-- Open requests: matching offers, refusals, accepting one offer rejects the rest, expiry. Rolls back.
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
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000c4');
insert into profiles (id, first_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true), ('00000000-0000-0000-0000-0000000000b1', 'Meron', false),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false), ('00000000-0000-0000-0000-0000000000c2', 'Yonas', false),
  ('00000000-0000-0000-0000-0000000000c3', 'Selam', false), ('00000000-0000-0000-0000-0000000000c4', 'Dawit', false);
update auth.users set phone = '251911000001', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000b1';
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5), ('USD', 141.4) on conflict (currency) do update set etb_per_unit = excluded.etb_per_unit;
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live'),
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', 'GB', 'London', 'LHR', addis_today() + 3, addis_today() + 5, 8, 'live'),
  ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c3', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 12, 9, 'live'),
  ('10000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c4', 'US', 'Washington, DC', 'IAD', addis_today() + 4, addis_today() + 6, 5, 'live');

-- Receiver posts an open request, trying to set a reward.
-- Travelers must be verified to be listed, offer or receive trip requests.
select test_verify('00000000-0000-0000-0000-0000000000c1');
select test_verify('00000000-0000-0000-0000-0000000000c2');
select test_verify('00000000-0000-0000-0000-0000000000c3');
select test_verify('00000000-0000-0000-0000-0000000000c4');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into requests (id, kind, countries, needed_by, item_name, item_url, unit_price, currency, reward_etb) values
  ('30000000-0000-0000-0000-000000000001', 'open', '{AE,US}', addis_today() + 10, 'Perfume', 'https://zara.com/x', 120, 'AED', 999);
select must_fail($$insert into requests (kind, countries, needed_by, item_name, item_url, unit_price, currency)
  values ('open', '{AE}', addis_today() + 2, 'X', 'https://a.com', 10, 'AED')$$, 'needed_by too soon', '3 to 60');
do $$ begin assert (select reward_etb from requests where id = '30000000-0000-0000-0000-000000000001') is null, 'open request has no reward'; end $$;
select must_fail($$select make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c1', 500)$$, 'receiver offers on own request');

set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin assert (select count(*) from requests) = 1, 'anon sees the live open request'; end $$;
select must_fail($$select make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c1', 500)$$, 'anon offers');

-- Matching and non-matching offers.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'hana', make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c1', 600);
select must_fail($$select make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c1', 650)$$, 'second live offer', 'already');
select must_fail($$select make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c2', 600)$$, 'offer on someone else''s trip');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select must_fail($$select make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c2', 600)$$, 'GB trip does not match', 'match');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
select must_fail($$select make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c3', 600)$$, 'lands after needed_by', 'match');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c4';
insert into ids select 'dawit', make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c4', 500);
do $$ begin
  assert (select count(*) from offers) = 1, 'a traveler sees only their own offer';
end $$;

-- Receiver sees both offers and accepts Hana's.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert (select count(*) from offers) = 2, 'receiver sees all offers'; end $$;
select accept_offer((select id from ids where name = 'hana'));
do $$
declare r requests;
begin
  select * into r from requests where id = '30000000-0000-0000-0000-000000000001';
  assert (r.reward_etb, r.fee_etb, r.status) = (600, 90, 'awaiting_payment'::request_status), 'reward and fee from the accepted offer';
  assert r.traveler_id = '00000000-0000-0000-0000-0000000000c1' and r.trip_id = '10000000-0000-0000-0000-0000000000c1', 'traveler and trip from the offer';
  assert (select status from offers where id = (select id from ids where name = 'dawit')) = 'closed', 'other offers closed';
end $$;
select must_fail($$select accept_offer((select id from ids where name = 'dawit'))$$, 'accept twice');

-- Accepted open request continues on the normal path.
insert into storage.objects (bucket_id, name) values ('proofs', '00000000-0000-0000-0000-0000000000b1/p.jpg');
select submit_payment('30000000-0000-0000-0000-000000000001', 'telebirr', '00000000-0000-0000-0000-0000000000b1/p.jpg');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select decide_payment(p.id, true) from payments p where p.request_id = '30000000-0000-0000-0000-000000000001' and p.status = 'pending';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into storage.objects (bucket_id, name) values ('proofs', '00000000-0000-0000-0000-0000000000c1/r.jpg'), ('proofs', '00000000-0000-0000-0000-0000000000c1/i.jpg');
select mark_bought('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1/r.jpg', '00000000-0000-0000-0000-0000000000c1/i.jpg');
do $$ begin assert (select status from requests where id = '30000000-0000-0000-0000-000000000001') = 'purchased', 'continues to purchased'; end $$;

-- An expired open request disappears and refuses offers.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into requests (id, kind, countries, needed_by, item_name, item_url, unit_price, currency) values
  ('30000000-0000-0000-0000-000000000002', 'open', '{AE}', addis_today() + 10, 'Bag', 'https://a.com/b', 40, 'AED');
reset role;
update requests set needed_by = addis_today() - 1 where id = '30000000-0000-0000-0000-000000000002';
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin assert (select count(*) from requests where id = '30000000-0000-0000-0000-000000000002') = 0, 'expired hidden from anon'; end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select make_offer('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000c1', 300)$$, 'offer on expired request');

rollback;
