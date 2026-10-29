-- Fixes from the final review: stale acceptance, code guessing, foreign file paths, proof deletion, bucket listing. Rolls back.
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
  ('00000000-0000-0000-0000-0000000000a1', null, null), ('00000000-0000-0000-0000-0000000000b1', '251911000001', now()),
  ('00000000-0000-0000-0000-0000000000c1', '251922000002', now()), ('00000000-0000-0000-0000-0000000000d1', null, null);
insert into profiles (id, first_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true), ('00000000-0000-0000-0000-0000000000b1', 'Meron', false),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false), ('00000000-0000-0000-0000-0000000000d1', 'Sami', false);
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5) on conflict (currency) do update set etb_per_unit = excluded.etb_per_unit;
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live');
insert into payout_accounts values ('00000000-0000-0000-0000-0000000000c1', 'telebirr', 'Hana', '0922000002', null);

-- I1: an offer whose trip has gone stale can't be accepted; neither can a trip request on a stale trip.
-- Travelers must be verified to be listed, offer or receive trip requests.
select test_verify('00000000-0000-0000-0000-0000000000c1');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into requests (id, kind, countries, needed_by, item_name, item_url, unit_price, currency) values
  ('30000000-0000-0000-0000-000000000001', 'open', '{AE}', addis_today() + 10, 'Bag', 'https://a.com/b', 40, 'AED');
insert into requests (id, kind, trip_id, item_name, item_url, unit_price, currency, reward_etb) values
  ('20000000-0000-0000-0000-000000000001', 'trip', '10000000-0000-0000-0000-000000000001', 'Perfume', 'https://zara.com/x', 120, 'AED', 800),
  ('20000000-0000-0000-0000-000000000002', 'trip', '10000000-0000-0000-0000-000000000001', 'Shoes', 'https://a.com/s', 50, 'AED', 300);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
create temp table ids (id uuid);
grant all on ids to authenticated;
insert into ids select make_offer('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 500);
select make_offer('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 800);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select accept_offer(o.id) from offers o where o.request_id = '20000000-0000-0000-0000-000000000001';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
reset role;
alter table trips disable trigger trips_guard; -- time travel, not an owner edit
update trips set shop_by = addis_today() - 2, arrival_date = addis_today() - 1 where id = '10000000-0000-0000-0000-000000000001';
alter table trips enable trigger trips_guard;
set local role authenticated;
select must_fail($$select make_offer('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 300)$$, 'price a trip request on a stale trip', 'no longer');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$select accept_offer((select id from ids))$$, 'accept offer on a stale trip', 'no longer');
reset role;
alter table trips disable trigger trips_guard; -- time travel, not an owner edit
update trips set shop_by = addis_today() + 3, arrival_date = addis_today() + 5 where id = '10000000-0000-0000-0000-000000000001';
alter table trips enable trigger trips_guard;
set local role authenticated;

-- I3: receipts and escrow proofs must be the caller's own files.
select must_fail($$select submit_payment('20000000-0000-0000-0000-000000000001', 'telebirr', '00000000-0000-0000-0000-0000000000d1/secret.jpg')$$, 'escrow proof in someone else''s folder');
select must_fail($$select submit_payment('20000000-0000-0000-0000-000000000001', 'telebirr', null)$$, 'escrow without a proof');
insert into storage.objects (bucket_id, name) values ('proofs', '00000000-0000-0000-0000-0000000000b1/proof.jpg');
select submit_payment('20000000-0000-0000-0000-000000000001', 'telebirr', '00000000-0000-0000-0000-0000000000b1/proof.jpg');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select decide_payment(p.id, true) from payments p where p.request_id = '20000000-0000-0000-0000-000000000001' and p.status = 'pending';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into storage.objects (bucket_id, name) values ('proofs', '00000000-0000-0000-0000-0000000000c1/r.jpg'), ('proofs', '00000000-0000-0000-0000-0000000000c1/i.jpg');
select must_fail($$select mark_bought('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1/x.jpg', '00000000-0000-0000-0000-0000000000c1/i.jpg')$$, 'receipt in someone else''s folder', 'upload');
select mark_bought('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1/r.jpg', '00000000-0000-0000-0000-0000000000c1/i.jpg');
-- Stand-in for the In Addis step, which needs an SMS code (after_paid_test covers it).
reset role;
update requests set photo_status = 'ok', status = 'landed', landed_at = now() where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;

-- I2: wrong codes are counted and lock delivery after 5 tries; an admin can reset.
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000001', 'delivered', '000000')$$, 'delivered via advance_request', 'deliver');
do $$ begin
  for i in 1..5 loop
    assert deliver('20000000-0000-0000-0000-000000000001', 'nope') = 'wrong_code', 'wrong code reported';
  end loop;
end $$;
reset role;
create temp table code as select code from handover_codes where request_id = '20000000-0000-0000-0000-000000000001';
grant select on code to authenticated;
set local role authenticated;
do $$ begin
  assert deliver('20000000-0000-0000-0000-000000000001', (select code from code)) = 'locked', 'locked after 5 wrong tries, even with the right code';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select reset_handover_attempts('20000000-0000-0000-0000-000000000001');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$select reset_handover_attempts('20000000-0000-0000-0000-000000000001')$$, 'non-admin resets', 'admins only');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert deliver('20000000-0000-0000-0000-000000000001', (select code from code)) = 'delivered', 'delivers after admin reset';
  assert (select status from requests where id = '20000000-0000-0000-0000-000000000001') = 'delivered', 'status delivered';
end $$;

-- I4: proofs can't be deleted by their owner. I5: public buckets can't be listed by others.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
-- The payment proof was uploaded above.
insert into storage.objects (bucket_id, name) values ('screenshots', '00000000-0000-0000-0000-0000000000b1/shot.png');
delete from storage.objects where bucket_id = 'proofs';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'proofs' and name = '00000000-0000-0000-0000-0000000000b1/proof.jpg') = 1, 'proof survives its owner''s delete'; end $$;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'screenshots') = 0, 'anon cannot list screenshots'; end $$;

rollback;
