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
select set_config('zakbis.deciding', 'on', true);
update traveler_verifications set given_name = 'Hana' where user_id = '00000000-0000-0000-0000-0000000000c1';
select set_config('zakbis.deciding', 'off', true);
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

-- 2. Bought: the traveler uploads the receipt and an item photo; the receiver checks it; a swap or "can't swap".
select paid('ord1', 800);
select paid('ord2', 800);
select paid('ord3', 800);
select as_user('b1');
select must_fail($$select mark_bought(id('ord1'), '00000000-0000-0000-0000-0000000000c1/r1.jpg', '00000000-0000-0000-0000-0000000000c1/i1.jpg')$$, 'receiver marks bought', 'only the traveler');
select as_user('c1');
select must_fail($$select mark_bought(id('ord1'), '00000000-0000-0000-0000-0000000000b1/pay.jpg', '00000000-0000-0000-0000-0000000000c1/i1.jpg')$$, 'someone else''s receipt', 'upload');
select must_fail($$select mark_bought(id('ord1'), '00000000-0000-0000-0000-0000000000c1/r1.jpg', '00000000-0000-0000-0000-0000000000c1/missing.jpg')$$, 'photo never uploaded', 'upload');
select mark_bought(id('ord1'), '00000000-0000-0000-0000-0000000000c1/r1.jpg', '00000000-0000-0000-0000-0000000000c1/i1.jpg');
do $$ declare r requests; begin
  select * into r from requests where id = id('ord1');
  assert (r.status, r.photo_status) = ('purchased'::request_status, 'pending'::text), 'bought, photo waiting';
  assert r.photo_due_at <= now() + interval '24 hours' and r.purchased_at is not null, 'check within 24 h';
  assert last_note('b1') like '%bought%Check the photo%', 'receiver told to check';
end $$;
select must_fail($$select mark_bought(id('ord1'), '00000000-0000-0000-0000-0000000000c1/r1.jpg', '00000000-0000-0000-0000-0000000000c1/i1.jpg')$$, 'bought twice', 'no longer valid');
reset role;
update requests set buy_due_at = now() - interval '1 minute' where id = id('ord2');
set local role authenticated;
select must_fail($$select mark_bought(id('ord2'), '00000000-0000-0000-0000-0000000000c1/r1.jpg', '00000000-0000-0000-0000-0000000000c1/i1.jpg')$$, 'bought after the deadline', 'time is up');
select must_fail($$select advance_request(id('ord3'), 'purchased', null, '00000000-0000-0000-0000-0000000000c1/r1.jpg')$$, 'old shortcut', 'use mark_bought');

-- The receiver checks the photo.
select must_fail($$select check_item(id('ord1'), false, 'wrong_color')$$, 'traveler checks', 'only the receiver');
select as_user('b1');
select must_fail($$select check_item(id('ord1'), false, 'blue please')$$, 'free-text reason', 'choose a reason');
select check_item(id('ord1'), false, 'wrong_color');
do $$ begin
  assert (select (photo_status, photo_reason) from requests where id = id('ord1')) = ('rejected'::text, 'wrong_color'::text), 'rejected with reason';
  assert last_note('c1') like '%Wrong color%', 'traveler told why';
end $$;
select as_user('c1');
select swap_item(id('ord1'), '00000000-0000-0000-0000-0000000000c1/r2.jpg', '00000000-0000-0000-0000-0000000000c1/i2.jpg');
do $$ declare r requests; begin
  select * into r from requests where id = id('ord1');
  assert (r.photo_status, r.receipt_path, r.item_photo_path) = ('pending'::text, '00000000-0000-0000-0000-0000000000c1/r2.jpg'::text, '00000000-0000-0000-0000-0000000000c1/i2.jpg'::text), 'swap waits for a new check';
  assert last_note('b1') like '%swapped%', 'receiver told about the swap';
end $$;
select as_user('b1');
select check_item(id('ord1'), true);
do $$ begin
  assert (select photo_status from requests where id = id('ord1')) = 'ok', 'looks right';
  assert last_note('c1') like '%looks right%', 'traveler told';
end $$;
select as_user('c1');
select must_fail($$select swap_item(id('ord1'), '00000000-0000-0000-0000-0000000000c1/r1.jpg', '00000000-0000-0000-0000-0000000000c1/i1.jpg')$$, 'swap after OK', 'no longer valid');
select must_fail($$select cant_swap(id('ord1'))$$, 'can''t swap after OK', 'no longer valid');

-- A late check, then "can't swap".
select mark_bought(id('ord3'), '00000000-0000-0000-0000-0000000000c1/r1.jpg', '00000000-0000-0000-0000-0000000000c1/i1.jpg');
reset role;
update requests set photo_due_at = now() - interval '1 minute' where id = id('ord3');
set local role authenticated;
select as_user('b1');
select must_fail($$select check_item(id('ord3'), false, 'wrong_size')$$, 'check after the deadline', 'time is up');
reset role;
update requests set photo_due_at = now() + interval '1 hour' where id = id('ord3');
set local role authenticated;
select check_item(id('ord3'), false, 'wrong_size');
select as_user('b1');
select must_fail($$select cant_swap(id('ord3'))$$, 'receiver says can''t swap', 'only the traveler');
select as_user('c1');
select cant_swap(id('ord3'));
do $$ declare r requests; begin
  select * into r from requests where id = id('ord3');
  assert r.status = 'cancelled' and r.refund_decided_at is not null and r.hold is null, 'cancelled, refund decided';
  assert last_note('b1') like '%can''t swap%refund%', 'receiver told about the refund';
end $$;

-- Who sees the receipt and the item photo.
do $$ begin
  assert can_see_proof('00000000-0000-0000-0000-0000000000c1/i2.jpg'), 'traveler sees the photo';
end $$;
select as_user('b1');
do $$ begin assert can_see_proof('00000000-0000-0000-0000-0000000000c1/i2.jpg'), 'receiver sees the photo'; end $$;
select as_user('d1');
do $$ begin assert not can_see_proof('00000000-0000-0000-0000-0000000000c1/i2.jpg'), 'stranger doesn''t'; end $$;

-- 3. "I'm in Addis": only the server calls it, after a fresh SMS code; it reveals both confirmed numbers.
select as_user('c1');
select must_fail($$select mark_in_addis(id('ord1'), '00000000-0000-0000-0000-0000000000c1')$$, 'browser marks In Addis', 'permission denied');
reset role;
select must_fail($$select mark_in_addis(id('ord1'), '00000000-0000-0000-0000-0000000000c1')$$, 'before the arrival date', 'arrival');
select set_config('request.jwt.claim.sub', '', true); -- server-side edit, past the trip guard
update trips set shop_by = addis_today(), arrival_date = addis_today() where id = '10000000-0000-0000-0000-000000000001';
select must_fail($$select mark_in_addis(id('ord1'), '00000000-0000-0000-0000-0000000000b1')$$, 'not the traveler', 'only the traveler');
select must_fail($$select mark_in_addis(id('ord1'), '00000000-0000-0000-0000-0000000000c1')$$, 'no confirmed phone', 'phone');
update auth.users set phone = '447700900000', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select mark_in_addis(id('ord1'), '00000000-0000-0000-0000-0000000000c1')$$, 'UK phone', 'phone');
update auth.users set phone = '251922000002' where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select as_user('c1');
do $$ begin assert counterpart_phone(id('ord1')) is null, 'traveler sees no number before In Addis'; end $$;
reset role;
select mark_in_addis(id('ord1'), '00000000-0000-0000-0000-0000000000c1');
do $$ declare r requests; begin
  select * into r from requests where id = id('ord1');
  assert r.status = 'landed' and r.landed_at is not null, 'in Addis';
  assert r.handover_due_at between now() + interval '6 days 23 hours' and now() + interval '7 days', 'a week to hand over';
  assert last_note('b1') like '%is in Addis. Confirm your phone number%', 'unconfirmed receiver asked to confirm';
  assert last_note('c1') like '%hasn''t confirmed%', 'traveler told the receiver must confirm';
end $$;
select must_fail($$select mark_in_addis(id('ord1'), '00000000-0000-0000-0000-0000000000c1')$$, 'In Addis twice', 'no longer valid');
set local role authenticated;
select as_user('b1');
do $$ begin assert counterpart_phone(id('ord1')) is null, 'receiver without a confirmed number sees nothing'; end $$;
reset role;
update auth.users set phone = '251911000001', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000b1';
set local role authenticated;
do $$ begin assert counterpart_phone(id('ord1')) = '251922000002', 'receiver sees the traveler after confirming'; end $$;
select as_user('c1');
do $$ begin assert counterpart_phone(id('ord1')) = '251911000001', 'traveler sees the receiver'; end $$;
select as_user('d1');
do $$ begin assert counterpart_phone(id('ord1')) is null, 'stranger sees nothing'; end $$;

-- A receiver who confirmed early gets the number in the note.
select paid('ord4', 800);
select as_user('c1');
select mark_bought(id('ord4'), '00000000-0000-0000-0000-0000000000c1/r1.jpg', '00000000-0000-0000-0000-0000000000c1/i1.jpg');
reset role;
select must_fail($$select mark_in_addis(id('ord4'), '00000000-0000-0000-0000-0000000000c1')$$, 'photo not checked yet', 'no longer valid');
update requests set photo_status = 'ok' where id = id('ord4');
select mark_in_addis(id('ord4'), '00000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert last_note('b1') = 'Hana is in Addis. Call Hana on +251 922 000 002. Pick a public place to meet for safety.', 'receiver gets the number';
  assert last_note('c1') like '%Meron''s number is on the order%', 'traveler pointed to the number';
end $$;
set local role authenticated;

rollback;
