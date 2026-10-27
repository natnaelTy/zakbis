-- Storage: upload only to your own folder; real photos after acceptance; proofs to parties only. Rolls back.
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
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000d1');
insert into profiles (id, first_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'Meron'), ('00000000-0000-0000-0000-0000000000c1', 'Hana'), ('00000000-0000-0000-0000-0000000000d1', 'Sami');
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5);
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6);

-- Travelers must be verified to be listed, offer or receive trip requests.
select test_verify('00000000-0000-0000-0000-0000000000c1');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000c1/me.jpg');
select must_fail($$insert into storage.objects (bucket_id, name) values ('photos', '00000000-0000-0000-0000-0000000000b1/me.jpg')$$, 'upload into another user''s folder');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into requests (id, kind, trip_id, item_name, item_url, unit_price, currency, reward_etb) values
  ('20000000-0000-0000-0000-000000000001', 'trip', '10000000-0000-0000-0000-000000000001', 'Perfume', 'https://zara.com/x', 120, 'AED', 800);
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'photos') = 0, 'no real photo before acceptance'; end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select advance_request('20000000-0000-0000-0000-000000000001', 'awaiting_payment');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'photos') = 1, 'real photo after acceptance'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'photos') = 0, 'stranger never sees the photo'; end $$;

-- Receipt in proofs: readable by the request's parties only.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into storage.objects (bucket_id, name) values ('proofs', '00000000-0000-0000-0000-0000000000c1/receipt.jpg');
reset role;
update requests set status = 'purchased', receipt_path = '00000000-0000-0000-0000-0000000000c1/receipt.jpg' where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'proofs') = 1, 'receiver reads the receipt'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'proofs') = 0, 'stranger cannot read the receipt'; end $$;

rollback;
