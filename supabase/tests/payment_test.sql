-- Manual payments: receiver uploads a screenshot, an admin confirms, rejects or refunds. Rolls back.
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
select test_verify('00000000-0000-0000-0000-0000000000c1');
insert into storage.objects (bucket_id, name) values
  ('tickets', '00000000-0000-0000-0000-0000000000c1/t.pdf'),
  ('proofs', '00000000-0000-0000-0000-0000000000b1/p1.jpg'), ('proofs', '00000000-0000-0000-0000-0000000000b1/p2.jpg'),
  ('proofs', '00000000-0000-0000-0000-0000000000b1/p3.jpg'), ('proofs', '00000000-0000-0000-0000-0000000000b1/p4.jpg');
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status, proof_path) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live', '00000000-0000-0000-0000-0000000000c1/t.pdf'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 4, addis_today() + 6, 6, 'live', '00000000-0000-0000-0000-0000000000c1/t.pdf');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create function id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;
create function last_note(u text) returns text language sql stable security definer as $$
  select body from notes where user_id = ('00000000-0000-0000-0000-0000000000' || u)::uuid order by created_at desc limit 1
$$;
-- Meron asks Hana to bring an item on a trip; Hana names a price; Meron accepts.
create function agreed(n text, trip uuid, reward int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  with r as (insert into requests (kind, trip_id, item_name, item_url, unit_price, currency)
    values ('trip', trip, 'Perfume ' || n, 'https://zara.com/x', 120, 'AED') returning id) insert into ids select n, r.id from r;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  perform make_offer(id(n), trip, reward);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  perform accept_offer((select o.id from offers o where o.request_id = id(n)));
end $$;

set local role authenticated;
select agreed('req1', '10000000-0000-0000-0000-000000000001', 800);

-- 1. Only the receiver pays, with a known method and their own uploaded screenshot.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select submit_payment(id('req1'), 'telebirr', '00000000-0000-0000-0000-0000000000b1/p1.jpg')$$, 'traveler pays', 'only the receiver');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select must_fail($$select submit_payment(id('req1'), 'telebirr', '00000000-0000-0000-0000-0000000000b1/p1.jpg')$$, 'stranger pays', 'only the receiver');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$select submit_payment(id('req1'), 'cash', '00000000-0000-0000-0000-0000000000b1/p1.jpg')$$, 'unknown method', 'choose');
select must_fail($$select submit_payment(id('req1'), 'telebirr', '00000000-0000-0000-0000-0000000000c1/t.pdf')$$, 'someone else''s file', 'upload your payment screenshot');
select must_fail($$select submit_payment(id('req1'), 'telebirr', '00000000-0000-0000-0000-0000000000b1/missing.jpg')$$, 'file never uploaded', 'upload your payment screenshot');
insert into ids select 'pay1', submit_payment(id('req1'), 'telebirr', '00000000-0000-0000-0000-0000000000b1/p1.jpg');
do $$ declare p payments; r requests; begin
  select * into p from payments where id = id('pay1');
  select * into r from requests where id = id('req1');
  assert (p.status, p.kind, p.method) = ('pending', 'escrow', 'telebirr'), 'pending escrow';
  assert p.amount_etb = r.total_etb, 'amount is the request total';
  assert r.payment_left between interval '23 hours 59 minutes' and interval '24 hours', 'time left saved';
  assert last_note('c1') like '%checking%', 'traveler told';
end $$;
select must_fail($$select submit_payment(id('req1'), 'bank', '00000000-0000-0000-0000-0000000000b1/p2.jpg')$$, 'pay twice', 'already');
select must_fail($$insert into payments (request_id, kind, amount_etb, proof_path, method)
  values (id('req1'), 'escrow', 1, '00000000-0000-0000-0000-0000000000b1/p2.jpg', 'bank')$$, 'insert a payment directly');

-- 2. A waiting screenshot stops the clock.
reset role;
update requests set payment_due_at = now() - interval '1 minute' where id = id('req1');
select run_deadlines();
do $$ begin assert (select status from requests where id = id('req1')) = 'awaiting_payment', 'not cancelled while checking'; end $$;
set local role authenticated;

-- 3. The admin rejects with a reason, the receiver re-uploads, the admin confirms.
select must_fail($$select decide_payment(id('pay1'), true)$$, 'receiver confirms', 'admins only');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$select decide_payment(id('pay1'), false)$$, 'reject without a reason', 'reason');
select decide_payment(id('pay1'), false, 'Blurry');
do $$ begin
  assert (select status from payments where id = id('pay1')) = 'rejected', 'rejected';
  assert (select payment_due_at from requests where id = id('req1')) >= now() + interval '2 hours', 'time left given back';
  assert last_note('b1') like '%Blurry%', 'receiver told why';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into ids select 'pay2', submit_payment(id('req1'), 'bank', '00000000-0000-0000-0000-0000000000b1/p2.jpg');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$select decide_payment(id('pay1'), true)$$, 'decide the old screenshot', 'not waiting');
select decide_payment(id('pay2'), true);
do $$ begin
  assert (select status from requests where id = id('req1')) = 'paid', 'paid';
  assert (select status from payments where id = id('pay2')) = 'confirmed', 'confirmed';
  assert last_note('c1') like '%shopping%', 'traveler told to shop';
  assert last_note('b1') like '%confirmed%', 'receiver told';
end $$;

-- 4. The trip changed after the screenshot: refund, never confirm.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select agreed('req2', '10000000-0000-0000-0000-000000000002', 500);
insert into ids select 'pay3', submit_payment(id('req2'), 'telebirr', '00000000-0000-0000-0000-0000000000b1/p3.jpg');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update trips set arrival_date = addis_today() + 7 where id = '10000000-0000-0000-0000-000000000002';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select status from requests where id = id('req2')) = 'awaiting_payment', 'a waiting screenshot keeps the order';
  assert (select trip_changed from payments_to_check() where id = id('pay3')), 'admin sees the trip changed';
end $$;
select must_fail($$select decide_payment(id('pay3'), true)$$, 'confirm on a changed trip', 'refund instead');
select mark_refunded(id('pay3'));
do $$ begin
  assert (select status from payments where id = id('pay3')) = 'refunded', 'refunded';
  assert (select status from requests where id = id('req2')) = 'cancelled', 'order closed';
  assert last_note('b1') like '%refunded%', 'receiver told';
end $$;

-- A live trip can't be refunded this way; a rejection always leaves at least 2 hours.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select agreed('req3', '10000000-0000-0000-0000-000000000001', 400);
insert into ids select 'pay4', submit_payment(id('req3'), 'telebirr', '00000000-0000-0000-0000-0000000000b1/p4.jpg');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$select mark_refunded(id('pay4'))$$, 'refund on a live trip', 'trip is live');
select must_fail($$select advance_request(id('req3'), 'paid')$$, 'old paid path', 'use');
reset role;
update requests set payment_left = interval '10 minutes' where id = id('req3');
set local role authenticated;
select decide_payment(id('pay4'), false, 'Wrong amount');
do $$ begin assert (select payment_due_at from requests where id = id('req3')) >= now() + interval '2 hours' - interval '1 second', 'at least 2 hours'; end $$;

-- 5. The queue is for admins.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$select * from payments_to_check()$$, 'receiver reads the queue', 'admins only');

rollback;
