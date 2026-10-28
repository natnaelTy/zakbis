-- Reviews both ways, only after delivery, once each; public stats. Rolls back.
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
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5) on conflict (currency) do update set etb_per_unit = excluded.etb_per_unit;
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live');
-- Travelers must be verified to be listed, offer or receive trip requests.
select test_verify('00000000-0000-0000-0000-0000000000c1');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into requests (id, kind, trip_id, item_name, item_url, unit_price, currency, reward_etb) values
  ('20000000-0000-0000-0000-000000000001', 'trip', '10000000-0000-0000-0000-000000000001', 'Perfume', 'https://zara.com/x', 120, 'AED', 800);

select must_fail($$insert into reviews (request_id, author_id, subject_id, rating, text)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 5, 'Great')$$, 'review before delivery');

reset role;
update requests set status = 'delivered' where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;

insert into reviews (request_id, author_id, subject_id, rating, text) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 5, 'Sealed in the box, exactly as ordered.');
select must_fail($$insert into reviews (request_id, author_id, subject_id, rating, text)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 4, 'Again')$$, 'second review by same author');
select must_fail($$insert into reviews (request_id, author_id, subject_id, rating, text)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 5, 'Me')$$, 'review yourself');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into reviews (request_id, author_id, subject_id, rating, text) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 4, 'Quick handover.');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select must_fail($$insert into reviews (request_id, author_id, subject_id, rating, text)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 1, 'Spam')$$, 'stranger reviews');

set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from reviews) = 2, 'anon reads reviews';
  assert (select (rating, review_count, deliveries) from traveler_stats where traveler_id = '00000000-0000-0000-0000-0000000000c1')
    = (5.0::numeric(2,1), 1::bigint, 1::bigint), 'traveler stats';
  assert (select (rating, review_count) from receiver_stats where receiver_id = '00000000-0000-0000-0000-0000000000b1')
    = (4.0::numeric(2,1), 1::bigint), 'receiver stats';
end $$;

rollback;
