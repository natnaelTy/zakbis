-- Walks one request through every state and checks the guards. Rolls back; safe on a local DB.
-- Run: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/buy_me_flow.sql
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- admin
  ('00000000-0000-0000-0000-00000000000b'),  -- receiver
  ('00000000-0000-0000-0000-00000000000c'),  -- traveler
  ('00000000-0000-0000-0000-00000000000d');  -- stranger
insert into profiles (id, full_name, is_admin) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin', true),
  ('00000000-0000-0000-0000-00000000000b', 'Receiver', false),
  ('00000000-0000-0000-0000-00000000000c', 'Traveler', false),
  ('00000000-0000-0000-0000-00000000000d', 'Stranger', false);
insert into private_contacts values
  ('00000000-0000-0000-0000-00000000000b', '+251900000001'),
  ('00000000-0000-0000-0000-00000000000c', '+251900000002');
insert into fx_rates values ('AED', 38.5);

create temp table t (k text primary key, v text);
grant all on t to authenticated;

set local role authenticated;

-- traveler posts a trip
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into trips (traveler_id, origin_country, origin_city, shop_by, arrival_date, free_kg)
  values (auth.uid(), 'AE', 'Dubai', current_date + 3, current_date + 5, 10);
insert into t select 'trip', id from trips;

-- receiver requests on the trip, trying to spoof status and fx rate
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into requests (receiver_id, trip_id, item_name, item_price, currency, reward_etb, status, fx_rate)
  values ('00000000-0000-0000-0000-00000000000d', (select v::uuid from t where k = 'trip'),
          'iPhone case', 50, 'AED', 500, 'paid', 1);
insert into t select 'req', id from requests;

do $$
declare r requests;
begin
  select * into r from requests;
  assert r.status = 'open', 'insert must force open';
  assert r.receiver_id = auth.uid(), 'insert must force receiver';
  assert r.fx_rate = 38.5, 'fx rate must come from fx_rates';
  assert r.traveler_id = '00000000-0000-0000-0000-00000000000c', 'traveler from trip';
  assert counterpart_phone(r.id) is null, 'phone hidden before payment';
  assert (select count(*) from handover_codes) = 1, 'receiver sees own code';
end $$;
insert into t select 'code', code from handover_codes;

-- stranger can't see a trip-directed request or accept it
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$
begin
  assert (select count(*) from requests) = 0, 'trip request hidden from strangers';
  begin
    perform advance_request((select v::uuid from t where k = 'req'), 'awaiting_payment');
    assert false, 'stranger accepted';
  exception when raise_exception then null;
  end;
end $$;

-- traveler accepts, can't read code, can't self-mark paid
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select advance_request((select v::uuid from t where k = 'req'), 'awaiting_payment');
do $$
begin
  assert (select count(*) from handover_codes) = 0, 'traveler must not see code';
  begin
    perform advance_request((select v::uuid from t where k = 'req'), 'paid');
    assert false, 'traveler marked paid';
  exception when raise_exception then null;
  end;
end $$;

-- receiver uploads proof; admin confirms
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into payments (request_id, kind, amount_etb, proof_path)
  values ((select v::uuid from t where k = 'req'), 'escrow', 2425, 'b/proof.jpg');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select advance_request((select v::uuid from t where k = 'req'), 'paid');

-- traveler buys, then hands over with wrong and right code
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$
begin
  assert counterpart_phone((select v::uuid from t where k = 'req')) = '+251900000001', 'phone revealed after payment';
end $$;
select advance_request((select v::uuid from t where k = 'req'), 'purchased', p_receipt => 'c/receipt.jpg');
do $$
begin
  begin
    perform advance_request((select v::uuid from t where k = 'req'), 'delivered', '000000x');
    assert false, 'wrong code accepted';
  exception when raise_exception then null;
  end;
end $$;
select advance_request((select v::uuid from t where k = 'req'), 'delivered', (select v from t where k = 'code'));

-- admin pays out
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select advance_request((select v::uuid from t where k = 'req'), 'paid_out');
do $$
begin
  assert (select status from requests) = 'paid_out', 'final state';
  begin
    update requests set status = 'open';
    assert (select status from requests) = 'paid_out', 'direct update must be ignored';
  end;
end $$;

-- open request (no trip): any other traveler can take it
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into requests (receiver_id, item_name, item_price, currency, reward_etb)
  values (auth.uid(), 'Perfume', 120, 'AED', 800);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select advance_request((select id from requests where item_name = 'Perfume'), 'awaiting_payment');
do $$
begin
  assert (select traveler_id from requests where item_name = 'Perfume') = auth.uid(), 'open request claimed';
end $$;

reset role;
select 'ALL TESTS PASSED';
rollback;
