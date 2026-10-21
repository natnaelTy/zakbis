-- Trip request from posting to payout: money, actors, two-step phone reveal, anon access. Rolls back.
begin;

-- Runs q as the current role; passes only if q raises (and, when given, the message contains expect).
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

insert into auth.users (id, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', null, null),                 -- admin
  ('00000000-0000-0000-0000-0000000000b1', '251911000001', now()),      -- receiver, phone verified
  ('00000000-0000-0000-0000-0000000000c1', null, null),                 -- traveler, no phone yet
  ('00000000-0000-0000-0000-0000000000d1', null, null);                 -- stranger
insert into profiles (id, first_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true),
  ('00000000-0000-0000-0000-0000000000b1', 'Meron', false),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false),
  ('00000000-0000-0000-0000-0000000000d1', 'Sami', false);
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5);
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6);

-- Receiver posts trip requests, trying to spoof status, receiver and rate.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into requests (id, kind, trip_id, item_name, item_url, unit_price, currency, reward_etb, status, receiver_id, fx_rate) values
  ('20000000-0000-0000-0000-000000000001', 'trip', '10000000-0000-0000-0000-000000000001', 'Perfume', 'https://zara.com/x', 120, 'AED', 800, 'paid', '00000000-0000-0000-0000-0000000000d1', 1);
insert into requests (id, kind, trip_id, item_name, screenshot_path, unit_price, currency, reward_etb) values
  ('20000000-0000-0000-0000-000000000002', 'trip', '10000000-0000-0000-0000-000000000001', 'Shoes', 'b1/shoes.png', 50, 'AED', 300),
  ('20000000-0000-0000-0000-000000000003', 'trip', '10000000-0000-0000-0000-000000000001', 'Charger', 'b1/c.png', 20, 'AED', 200),
  ('20000000-0000-0000-0000-000000000005', 'trip', '10000000-0000-0000-0000-000000000001', 'Watch', 'b1/w.png', 90, 'AED', 500);
do $$
declare r requests;
begin
  select * into r from requests where id = '20000000-0000-0000-0000-000000000001';
  assert r.status = 'open', 'insert forces status open';
  assert r.receiver_id = '00000000-0000-0000-0000-0000000000b1', 'insert forces receiver';
  assert r.fx_rate = 38.5, 'insert locks the admin rate';
  assert r.traveler_id = '00000000-0000-0000-0000-0000000000c1', 'traveler comes from the trip';
  assert (r.item_etb, r.fee_etb, r.total_etb, r.payout_etb) = (4620, 72, 5420, 5348), 'Hana''s numbers';
end $$;
select must_fail($$insert into requests (kind, trip_id, item_name, item_url, unit_price, currency, reward_etb)
  values ('trip', '10000000-0000-0000-0000-000000000001', 'X', 'https://a.com', 10, 'USD', 100)$$, 'currency without a rate', 'no fx rate');
select must_fail($$insert into requests (kind, trip_id, item_name, unit_price, currency, reward_etb)
  values ('trip', '10000000-0000-0000-0000-000000000001', 'X', 10, 'AED', 100)$$, 'neither link nor screenshot');
select must_fail($$select phone_of('00000000-0000-0000-0000-0000000000b1')$$, 'phone_of is not callable by users');

-- Traveler can't request on their own trip.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$insert into requests (kind, trip_id, item_name, item_url, unit_price, currency, reward_etb)
  values ('trip', '10000000-0000-0000-0000-000000000001', 'X', 'https://a.com', 10, 'AED', 100)$$, 'request on own trip', 'own trip');

-- Strangers and anon can't move it.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000001', 'awaiting_payment')$$, 'stranger accepts');
set local role anon;
set local request.jwt.claim.sub = '';
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000001', 'awaiting_payment')$$, 'anon accepts');
do $$ begin assert counterpart_phone('20000000-0000-0000-0000-000000000001') is null, 'anon gets no phone'; end $$;

-- Traveler accepts one, declines another.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select advance_request('20000000-0000-0000-0000-000000000001', 'awaiting_payment');
select advance_request('20000000-0000-0000-0000-000000000002', 'declined');
select advance_request('20000000-0000-0000-0000-000000000005', 'awaiting_payment');

-- Receiver cancels one before paying, then uploads proof and can no longer cancel.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select advance_request('20000000-0000-0000-0000-000000000003', 'cancelled');
insert into payments (request_id, kind, amount_etb, proof_path) values ('20000000-0000-0000-0000-000000000001', 'escrow', 1, '00000000-0000-0000-0000-0000000000b1/proof.jpg');
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000001', 'cancelled')$$, 'cancel with pending proof');
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000001', 'paid')$$, 'receiver marks paid');
do $$ begin
  assert (select amount_etb from payments where request_id = '20000000-0000-0000-0000-000000000001') = 5420, 'escrow amount comes from the request';
  assert (select status from requests where id = '20000000-0000-0000-0000-000000000002') = 'declined', 'declined';
  assert (select status from requests where id = '20000000-0000-0000-0000-000000000003') = 'cancelled', 'cancelled';
end $$;

-- Admin confirms payment.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select advance_request('20000000-0000-0000-0000-000000000001', 'paid');

-- Traveler buys: traveler now sees the receiver's number, receiver still sees nothing.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin assert counterpart_phone('20000000-0000-0000-0000-000000000001') is null, 'no phone before purchase'; end $$;
select advance_request('20000000-0000-0000-0000-000000000001', 'purchased', p_receipt => '00000000-0000-0000-0000-0000000000c1/receipt.jpg');
do $$ begin assert counterpart_phone('20000000-0000-0000-0000-000000000001') = '251911000001', 'traveler sees receiver after purchase'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert counterpart_phone('20000000-0000-0000-0000-000000000001') is null, 'receiver sees nothing before landing'; end $$;

-- Landing needs a verified Ethiopian number.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000001', 'landed')$$, 'landed without phone', 'Ethiopian');
reset role;
update auth.users set phone = '447700900000', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000001', 'landed')$$, 'landed with UK phone', 'Ethiopian');
reset role;
update auth.users set phone = '251922000002' where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select advance_request('20000000-0000-0000-0000-000000000001', 'landed');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert counterpart_phone('20000000-0000-0000-0000-000000000001') = '251922000002', 'receiver sees traveler after landing'; end $$;

-- Handover: wrong code, then no payout account, then success.
reset role;
create temp table code as select code from handover_codes where request_id = '20000000-0000-0000-0000-000000000001';
grant select on code to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select deliver('20000000-0000-0000-0000-000000000001', (select code from code))$$, 'no payout account', 'payout account');
insert into payout_accounts (user_id, method, account_name, account_number) values ('00000000-0000-0000-0000-0000000000c1', 'telebirr', 'Hana T', '0922000002');
do $$ begin assert deliver('20000000-0000-0000-0000-000000000001', 'nope') = 'wrong_code', 'wrong code'; end $$;
do $$ begin assert deliver('20000000-0000-0000-0000-000000000001', (select code from code)) = 'delivered', 'delivered'; end $$;
do $$ begin assert (select count(*) from handover_codes) = 0, 'traveler never reads codes'; end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select advance_request('20000000-0000-0000-0000-000000000001', 'paid_out');
do $$ begin assert (select status from requests where id = '20000000-0000-0000-0000-000000000001') = 'paid_out', 'paid out'; end $$;

-- A revealed number survives an admin cancel.
reset role;
update requests set status = 'landed', purchased_at = now(), landed_at = now() where id = '20000000-0000-0000-0000-000000000005';
set local role authenticated;
select advance_request('20000000-0000-0000-0000-000000000005', 'cancelled');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert counterpart_phone('20000000-0000-0000-0000-000000000005') = '251922000002', 'number stays after cancel'; end $$;

-- Anon: public trip and profile fields only, no writes.
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from trips) = 1, 'anon sees the listed trip';
  assert (select first_name from profiles where id = '00000000-0000-0000-0000-0000000000c1') = 'Hana', 'anon sees public profile fields';
  assert (select count(*) from requests where kind = 'trip') = 0, 'anon sees no trip requests';
  assert (select count(*) from handover_codes) = 0, 'anon sees no codes';
end $$;
select must_fail($$select is_admin from profiles$$, 'anon reads is_admin');
select must_fail($$insert into trips (traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg)
  values ('00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 1)$$, 'anon writes');

rollback;
