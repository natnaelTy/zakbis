-- Post a trip: verified travelers only, every trip admin-checked, hidden until live, private proof. Rolls back.
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
  ('00000000-0000-0000-0000-0000000000d1', 'Sami', false, 'traveler');
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5) on conflict (currency) do update set etb_per_unit = excluded.etb_per_unit;
select test_verify('00000000-0000-0000-0000-0000000000c1'); -- Hana is verified, Sami is not

create temp table t_ids (id uuid);
create temp table t_seen (s timestamptz);
create temp table t_req (id uuid);
create temp table t_open (id uuid);
create temp table t_offer (id uuid);
grant all on t_ids, t_seen, t_req, t_open, t_offer to authenticated;

set local role authenticated;

-- Posting rules.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select must_fail($$insert into trips (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, proof_path, customs_agreed_at)
  values ('AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 5, '00000000-0000-0000-0000-0000000000d1/t.pdf', now())$$,
  'unverified traveler posts', 'verify before posting a trip');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$insert into trips (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, customs_agreed_at)
  values ('AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 5, now())$$, 'no ticket', 'upload your ticket');
select must_fail($$insert into trips (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, proof_path, customs_agreed_at)
  values ('AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 5, '00000000-0000-0000-0000-0000000000d1/t.pdf', now())$$,
  'ticket in someone else''s folder', 'upload your ticket');
select must_fail($$insert into trips (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, proof_path)
  values ('AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 5, '00000000-0000-0000-0000-0000000000c1/t.pdf')$$,
  'no customs agreement', 'agree to the customs rules');
select must_fail($$insert into trips (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, proof_path, customs_agreed_at)
  values ('AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 400, 5, '00000000-0000-0000-0000-0000000000c1/t.pdf', now())$$,
  'passport expires before landing', 'your passport must be valid until you land');

select must_fail($$insert into trips (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, proof_path, customs_agreed_at, status)
  values ('AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 5, '00000000-0000-0000-0000-0000000000c1/t.pdf', now(), 'live')$$,
  'posting straight to live', 'permission denied');
select must_fail($$insert into trips (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, proof_path, customs_agreed_at)
  values ('AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 5, '00000000-0000-0000-0000-0000000000c1/never-uploaded.pdf', now())$$,
  'a ticket path with no uploaded file', 'upload your ticket');
insert into storage.objects (bucket_id, name) values ('tickets', '00000000-0000-0000-0000-0000000000c1/t.pdf');
insert into trips (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, proof_path, customs_agreed_at)
  values ('AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 5, '00000000-0000-0000-0000-0000000000c1/t.pdf', '2000-01-01');
insert into t_ids select id from my_trips();
select must_fail($$update trips set decided_by = auth.uid()$$, 'owner sets decided_by', 'permission denied');
select must_fail($$insert into storage.objects (bucket_id, name) values ('tickets', '00000000-0000-0000-0000-0000000000b1/t.pdf')$$, 'ticket upload into another folder');
do $$ begin
  assert (select status from my_trips()) = 'checking', 'a new trip always starts checking';
  assert (select customs_agreed_at from my_trips()) > now() - interval '1 minute', 'agreement stamped by the database';
  assert (select count(*) from my_trips()) = 1, 'my_trips sees own trip';
end $$;
update trips set status = 'live';
do $$ begin assert (select status from my_trips()) = 'checking', 'owner cannot approve'; end $$;
select must_fail($$select decide_trip((select id from t_ids), (select submitted_at from trips_to_check()), true)$$, 'owner decides', 'admins only');
select must_fail($$select * from trips_to_check()$$, 'owner reads queue', 'admins only');

-- Hidden and private for everyone else.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select count(*) from trips) = 0, 'checking trip hidden from receivers';
  assert (select count(*) from my_trips()) = 0, 'my_trips shows nobody else''s trips';
  assert (select count(*) from storage.objects where bucket_id = 'tickets') = 0, 'ticket files private';
end $$;
select must_fail($$insert into requests (kind, trip_id, item_name, item_url, unit_price, currency, reward_etb)
  values ('trip', (select id from t_ids), 'Perfume', 'https://zara.com/x', 120, 'AED', 800)$$, 'request on a checking trip', 'trip is not available');
reset role;
set local role anon;
do $$ begin
  assert (select count(*) from trips) = 0, 'checking trip hidden from anon';
  assert (select count(*) from storage.objects where bucket_id = 'tickets') = 0, 'ticket files hidden from anon';
end $$;
reset role;
set local role authenticated;
select must_fail($$select proof_path from trips$$, 'receiver reads proof path');

-- Admin decides.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$select decide_trip((select id from t_ids), (select submitted_at from trips_to_check()), false)$$, 'reject without reason', 'a reason is required to reject');
select decide_trip((select id from t_ids), (select submitted_at from trips_to_check()), false, 'Name differs');
do $$ begin assert (select count(*) from trips_to_check()) = 0, 'rejected trip leaves the queue'; end $$;
select must_fail($$select decide_trip((select id from t_ids), (select submitted_at from trips_to_check()), true)$$, 'deciding a non-checking trip', 'this trip is not waiting for a check');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin assert (select status::text || rejection_reason from my_trips()) = 'needs_fixName differs', 'traveler sees the reason'; end $$;
update trips set note = 'fixed';
do $$ begin assert (select status from my_trips()) = 'checking' and (select rejection_reason from my_trips()) is null, 'resubmitting a fix goes back to checking'; end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin assert (select legal_name from trips_to_check()) = 'TEST TRAVELER', 'queue shows the passport name'; end $$;
select decide_trip((select id from t_ids), (select submitted_at from trips_to_check()), true);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert (select count(*) from trips) = 1, 'live trip visible'; end $$;

-- Edits after approval.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update trips set free_kg = 8;
do $$ begin assert (select status from my_trips()) = 'live', 'kg edit stays live'; end $$;
select must_fail($$update trips set arrival_date = addis_today() + 400$$, 'moving landing past passport expiry', 'your passport must be valid until you land');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
with r as (insert into requests (kind, countries, needed_by, item_name, item_url, unit_price, currency)
  values ('open', '{AE}', addis_today() + 10, 'Watch', 'https://a.com/w', 50, 'AED') returning id)
insert into t_open select id from r;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into t_offer select make_offer((select id from t_open), (select id from t_ids), 500);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
with r as (insert into requests (kind, trip_id, item_name, item_url, unit_price, currency, reward_etb)
  values ('trip', (select id from t_ids), 'Perfume', 'https://zara.com/x', 120, 'AED', 800) returning id)
insert into t_req select id from r;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update trips set shop_by = addis_today() + 2;
do $$ begin assert (select status from my_trips()) = 'checking', 'date edit goes back to checking'; end $$;
select must_fail($$select make_offer((select id from t_req), (select id from t_ids), 800)$$, 'price a request on a trip being re-checked', 'no longer open');
do $$ begin assert (select status from requests where id = (select id from t_req)) = 'cancelled', 're-check closed the request'; end $$;
select must_fail($$select make_offer((select id from t_open), (select id from t_ids), 400)$$, 'offer again after the trip change closed it', 'already');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$select accept_offer((select id from t_offer))$$, 'accept an offer on a trip being re-checked', 'no longer valid');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

-- The admin approves only what they saw: a change after the queue loaded must be checked again.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into t_seen select submitted_at from trips_to_check();
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update trips set arrival_date = addis_today() + 6;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$select decide_trip((select id from t_ids), (select s from t_seen), true)$$, 'approving a stale card', 'this trip changed since you opened it');
select decide_trip((select id from t_ids), (select submitted_at from trips_to_check()), true);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update trips set status = 'cancelled';
do $$ begin assert (select status from my_trips()) = 'cancelled', 'traveler cancels'; end $$;
select must_fail($$update trips set status = 'checking'$$, 'un-cancel', 'cancelled trips are final');
select must_fail($$delete from trips$$, 'owner deletes a trip', 'permission denied');
do $$ begin assert (select count(*) from my_trips()) = 1, 'owners cannot delete trips'; end $$;

rollback;
