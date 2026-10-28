-- Traveler verification: self-approval refused, admin decides/revokes, verified gates new business only. Rolls back.
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

insert into auth.users (id, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', null, null),
  ('00000000-0000-0000-0000-0000000000b1', '251911000001', now()),
  ('00000000-0000-0000-0000-0000000000c1', null, null),
  ('00000000-0000-0000-0000-0000000000d1', null, null);
insert into profiles (id, first_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true), ('00000000-0000-0000-0000-0000000000b1', 'Meron', false),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false), ('00000000-0000-0000-0000-0000000000d1', 'Sami', false);
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5) on conflict (currency) do update set etb_per_unit = excluded.etb_per_unit;
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live');

-- Owner submits, trying to approve themselves.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into traveler_verifications (user_id, legal_name, given_name, nationality, passport_expiry, passport_path, selfie_path, status, decided_by)
  values ('00000000-0000-0000-0000-0000000000c1', 'HANA TESFAYE', 'Hana', 'ET', addis_today() + 400,
          '00000000-0000-0000-0000-0000000000c1/p.jpg', '00000000-0000-0000-0000-0000000000c1/s.jpg', 'approved', '00000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert (select status from traveler_verifications) = 'pending', 'insert forces pending';
  assert (select decided_by from traveler_verifications) is null, 'insert clears decision';
  assert (select count(*) from trips) = 1, 'owner still sees own trip';
end $$;
select must_fail($$update profiles set verified = true where id = '00000000-0000-0000-0000-0000000000c1'$$, 'owner sets verified');

-- Hidden from others while pending; unverified traveler can't take new business.
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin assert (select count(*) from trips) = 0, 'pending traveler''s trip hidden from anon'; end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$insert into requests (kind, trip_id, item_name, item_url, unit_price, currency, reward_etb)
  values ('trip', '10000000-0000-0000-0000-000000000001', 'X', 'https://a.com', 10, 'AED', 100)$$, 'request on unverified trip', 'not verified');
insert into requests (id, kind, countries, needed_by, item_name, item_url, unit_price, currency) values
  ('30000000-0000-0000-0000-000000000001', 'open', '{AE}', addis_today() + 10, 'Bag', 'https://a.com/b', 40, 'AED');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 300)$$, 'unverified offers', 'only verified travelers');

-- Only admins decide.
select must_fail($$select decide_verification('00000000-0000-0000-0000-0000000000c1', true)$$, 'non-admin decides', 'admins only');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$select decide_verification('00000000-0000-0000-0000-0000000000c1', false)$$, 'reject without reason', 'reason');
select decide_verification('00000000-0000-0000-0000-0000000000c1', true);
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from trips) = 1, 'approved traveler''s trip listed';
  assert (select verified from traveler_stats where traveler_id = '00000000-0000-0000-0000-0000000000c1'), 'badge on';
end $$;

-- Approved with a valid passport: no resubmitting.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update traveler_verifications set legal_name = 'SOMEONE ELSE';
do $$ begin
  assert (select legal_name from traveler_verifications) = 'HANA TESFAYE', 'approved row locked for owner';
  assert (select status from traveler_verifications) = 'approved', 'still approved';
end $$;

-- A deal accepted while verified carries on after revocation.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into requests (id, kind, trip_id, item_name, item_url, unit_price, currency, reward_etb) values
  ('20000000-0000-0000-0000-000000000001', 'trip', '10000000-0000-0000-0000-000000000001', 'Perfume', 'https://zara.com/x', 120, 'AED', 800),
  ('20000000-0000-0000-0000-000000000002', 'trip', '10000000-0000-0000-0000-000000000001', 'Shoes', 'https://a.com/s', 50, 'AED', 300);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select make_offer('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 800);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select accept_offer(o.id) from offers o where o.request_id = '20000000-0000-0000-0000-000000000001';
insert into storage.objects (bucket_id, name) values ('proofs', '00000000-0000-0000-0000-0000000000b1/proof.jpg');
select submit_payment('20000000-0000-0000-0000-000000000001', 'telebirr', '00000000-0000-0000-0000-0000000000b1/proof.jpg');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select decide_payment(p.id, true) from payments p where p.request_id = '20000000-0000-0000-0000-000000000001' and p.status = 'pending';
select decide_verification('00000000-0000-0000-0000-0000000000c1', false, 'Other');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select advance_request('20000000-0000-0000-0000-000000000001', 'purchased', p_receipt => '00000000-0000-0000-0000-0000000000c1/r.jpg');
select must_fail($$select make_offer('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 300)$$, 'revoked traveler prices a new request', 'not verified');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select status from requests where id = '20000000-0000-0000-0000-000000000001') = 'purchased', 'paid deal carries on';
  assert (select count(*) from trips) = 1, 'receiver still sees the trip of their request';
end $$;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from trips) = 0, 'revoked traveler''s trip hidden';
  assert not (select verified from traveler_stats where traveler_id = '00000000-0000-0000-0000-0000000000c1'), 'badge off';
end $$;

-- Rejected rows can be fixed; resubmission goes back to pending.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update traveler_verifications set selfie_path = '00000000-0000-0000-0000-0000000000c1/s2.jpg';
do $$ begin assert (select status from traveler_verifications) = 'pending', 'resubmitted after rejection'; end $$;

-- An approved traveler whose passport expired can resubmit, and loses the badge meanwhile.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select decide_verification('00000000-0000-0000-0000-0000000000c1', true);
reset role;
-- Simulate time passing (bypasses the owner-submit trigger, like an admin decision does).
select set_config('zakbis.deciding', 'on', true);
update traveler_verifications set passport_expiry = addis_today() - 1;
select set_config('zakbis.deciding', 'off', true);
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from trips) = 0, 'expired passport hides trips';
  assert not (select verified from traveler_stats where traveler_id = '00000000-0000-0000-0000-0000000000c1'), 'expired passport removes badge';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update traveler_verifications set passport_expiry = addis_today() + 3000, passport_path = '00000000-0000-0000-0000-0000000000c1/p2.jpg';
do $$ begin assert (select status from traveler_verifications) = 'pending', 'expired passport can resubmit'; end $$;

-- Identity files: own folder only; only owner and admins can read them.
insert into storage.objects (bucket_id, name) values ('identity', '00000000-0000-0000-0000-0000000000c1/p.jpg');
select must_fail($$insert into storage.objects (bucket_id, name) values ('identity', '00000000-0000-0000-0000-0000000000d1/p.jpg')$$, 'upload into another folder');
-- Evidence: the owner can't delete their own identity files.
delete from storage.objects where bucket_id = 'identity';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'identity') = 1, 'owner cannot delete identity files'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'identity') = 0, 'stranger cannot read identity'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'identity') = 1, 'admin reads identity';
  assert (select count(*) from traveler_verifications) = 1, 'admin reads verifications';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
do $$ begin assert (select count(*) from traveler_verifications) = 0, 'stranger cannot read verifications'; end $$;

-- The decision bypass only works for admins: a user flipping the switch still lands in pending.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select set_config('zakbis.deciding', 'on', true);
insert into traveler_verifications (user_id, legal_name, given_name, nationality, passport_expiry, passport_path, selfie_path, status)
  values ('00000000-0000-0000-0000-0000000000d1', 'SAMI X', 'Sami', 'ET', addis_today() + 400,
          '00000000-0000-0000-0000-0000000000d1/p.jpg', '00000000-0000-0000-0000-0000000000d1/s.jpg', 'approved');
select set_config('zakbis.deciding', 'off', true);
do $$ begin assert (select status from traveler_verifications where user_id = '00000000-0000-0000-0000-0000000000d1') = 'pending', 'bypass refused for non-admins'; end $$;

rollback;
