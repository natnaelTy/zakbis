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
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5);
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6);
insert into payout_accounts values ('00000000-0000-0000-0000-0000000000c1', 'telebirr', 'Hana', '0922000002', null);

-- I1: an offer whose trip has gone stale can't be accepted; neither can a trip request on a stale trip.
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
select advance_request('20000000-0000-0000-0000-000000000001', 'awaiting_payment');
reset role;
update trips set shop_by = addis_today() - 2, arrival_date = addis_today() - 1 where id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000002', 'awaiting_payment')$$, 'accept trip request on a stale trip', 'no longer');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$select accept_offer((select id from ids))$$, 'accept offer on a stale trip', 'no longer');
reset role;
update trips set shop_by = addis_today() + 3, arrival_date = addis_today() + 5 where id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;

-- I3: receipts and escrow proofs must be the caller's own files.
select must_fail($$insert into payments (request_id, kind, amount_etb, proof_path)
  values ('20000000-0000-0000-0000-000000000001', 'escrow', 1, '00000000-0000-0000-0000-0000000000d1/secret.jpg')$$, 'escrow proof in someone else''s folder');
select must_fail($$insert into payments (request_id, kind, amount_etb)
  values ('20000000-0000-0000-0000-000000000001', 'escrow', 1)$$, 'escrow without a proof');
insert into payments (request_id, kind, amount_etb, proof_path) values
  ('20000000-0000-0000-0000-000000000001', 'escrow', 1, '00000000-0000-0000-0000-0000000000b1/proof.jpg');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select advance_request('20000000-0000-0000-0000-000000000001', 'paid');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select advance_request('20000000-0000-0000-0000-000000000001', 'purchased', p_receipt => '00000000-0000-0000-0000-0000000000d1/x.jpg')$$, 'receipt in someone else''s folder', 'your own');
select advance_request('20000000-0000-0000-0000-000000000001', 'purchased', p_receipt => '00000000-0000-0000-0000-0000000000c1/r.jpg');
select advance_request('20000000-0000-0000-0000-000000000001', 'landed');

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
insert into storage.objects (bucket_id, name) values
  ('proofs', '00000000-0000-0000-0000-0000000000b1/proof.jpg'), ('screenshots', '00000000-0000-0000-0000-0000000000b1/shot.png');
delete from storage.objects where bucket_id = 'proofs';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'proofs') = 1, 'proof survives its owner''s delete'; end $$;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'screenshots') = 0, 'anon cannot list screenshots'; end $$;

rollback;
