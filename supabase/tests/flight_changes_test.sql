-- Flight changes on paid orders: the traveler asks, an admin approves or rejects, receivers keep or take a refund. Rolls back.
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
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000d1');
insert into profiles (id, first_name, is_admin, active_side) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true, 'receiver'),
  ('00000000-0000-0000-0000-0000000000b1', 'Meron', false, 'receiver'),
  ('00000000-0000-0000-0000-0000000000b2', 'Lidya', false, 'receiver'),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false, 'traveler'),
  ('00000000-0000-0000-0000-0000000000d1', 'Sami', false, 'receiver');
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5) on conflict (currency) do update set etb_per_unit = excluded.etb_per_unit;
select test_verify('00000000-0000-0000-0000-0000000000c1');
select set_config('zakbis.deciding', 'on', true);
update traveler_verifications set given_name = 'Hana' where user_id = '00000000-0000-0000-0000-0000000000c1';
select set_config('zakbis.deciding', 'off', true);
insert into storage.objects (bucket_id, name) values
  ('tickets', '00000000-0000-0000-0000-0000000000c1/t.pdf'), ('tickets', '00000000-0000-0000-0000-0000000000c1/new.pdf'),
  ('tickets', '00000000-0000-0000-0000-0000000000b1/x.pdf');
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status, proof_path) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live', '00000000-0000-0000-0000-0000000000c1/t.pdf'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live', '00000000-0000-0000-0000-0000000000c1/t.pdf');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create function id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;
create function u(x text) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-0000000000' || x)::uuid $$;
create function as_user(x text) returns void language sql as $$ select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || x, true) $$;
create function notes_like(x text, pat text) returns bigint language sql stable security definer as $$
  select count(*) from notes where user_id = u(x) and body like pat
$$;
-- An order from receiver r on a trip, moved (as superuser) to status st.
create function order_in(n text, r text, trip uuid, st request_status) returns void language plpgsql as $$
begin
  perform as_user(r);
  with q as (insert into requests (kind, trip_id, item_name, item_url, unit_price, currency)
    values ('trip', trip, 'Item ' || n, 'https://a.com/x', 10, 'AED') returning id) insert into ids select n, q.id from q;
  perform set_config('request.jwt.claim.sub', '', true);
  update requests set reward_etb = 500, accepted_at = now(), status = st where id = id(n);
end $$;
create function change_of(t uuid) returns uuid language sql stable security definer as $$
  select id from flight_changes where trip_id = t and status = 'pending'
$$;

-- 1. Only the traveler asks, only with paid orders, with a real new ticket and sane dates; once at a time.
select order_in('p1', 'b1', '10000000-0000-0000-0000-000000000001', 'paid');
select order_in('p2', 'b2', '10000000-0000-0000-0000-000000000001', 'purchased');
update requests set buy_due_at = now() + interval '1 day' where id = id('p2');
set local role authenticated;
select as_user('c1');
select must_fail($$select request_flight_change('10000000-0000-0000-0000-000000000002', 'moved', addis_today() + 8, addis_today() + 9, '00000000-0000-0000-0000-0000000000c1/new.pdf')$$, 'no paid orders', 'change the trip directly');
select as_user('b1');
select must_fail($$select request_flight_change('10000000-0000-0000-0000-000000000001', 'cancelled')$$, 'receiver asks', 'only the traveler');
select as_user('c1');
select must_fail($$select request_flight_change('10000000-0000-0000-0000-000000000001', 'moved', addis_today() + 8, addis_today() + 9)$$, 'no new ticket', 'upload your new ticket');
select must_fail($$select request_flight_change('10000000-0000-0000-0000-000000000001', 'moved', addis_today() + 8, addis_today() + 9, '00000000-0000-0000-0000-0000000000b1/x.pdf')$$, 'someone else''s ticket', 'upload your new ticket');
select must_fail($$select request_flight_change('10000000-0000-0000-0000-000000000001', 'moved', addis_today() - 1, addis_today() + 9, '00000000-0000-0000-0000-0000000000c1/new.pdf')$$, 'date in the past', 'dates');
select must_fail($$select request_flight_change('10000000-0000-0000-0000-000000000001', 'moved', addis_today() + 9, addis_today() + 8, '00000000-0000-0000-0000-0000000000c1/new.pdf')$$, 'lands before shop-by', 'dates');
insert into ids select 'ch1', request_flight_change('10000000-0000-0000-0000-000000000001', 'moved', addis_today() + 8, addis_today() + 10, '00000000-0000-0000-0000-0000000000c1/new.pdf');
do $$ begin
  assert notes_like('a1', 'Flight change to check%') = 1, 'admin told';
  assert (select (paid_orders, pending_change) from trip_change_state('10000000-0000-0000-0000-000000000001')) = (2, 'moved'::text), 'traveler sees the pending change';
end $$;
select must_fail($$select request_flight_change('10000000-0000-0000-0000-000000000001', 'cancelled')$$, 'second request', 'already');
select as_user('d1');
do $$ begin assert (select count(*) from flight_changes) = 0, 'strangers can''t read changes'; end $$;

-- 2. Admin only; a rejection needs a reason and changes nothing.
select as_user('c1');
select must_fail($$select decide_flight_change(id('ch1'), true)$$, 'traveler approves', 'admins only');
select must_fail($$select * from flight_changes_to_check()$$, 'traveler reads the list', 'admins only');
select as_user('a1');
do $$ begin assert (select paid_orders from flight_changes_to_check() where id = id('ch1')) = 2, 'admin sees affected orders'; end $$;
select must_fail($$select decide_flight_change(id('ch1'), false)$$, 'reject without reason', 'reason');
select decide_flight_change(id('ch1'), false, 'Ticket shows the old date');
do $$ begin
  assert (select status from flight_changes where id = id('ch1')) = 'rejected', 'rejected';
  assert (select shop_by from trips where id = '10000000-0000-0000-0000-000000000001') = addis_today() + 3, 'trip unchanged';
  assert notes_like('c1', '%couldn''t approve your flight change: Ticket shows the old date%') = 1, 'traveler told why';
end $$;

-- 3. Approving a move: new dates and ticket, deadlines follow, receivers told.
select as_user('c1');
insert into ids select 'ch2', request_flight_change('10000000-0000-0000-0000-000000000001', 'moved', addis_today() + 8, addis_today() + 10, '00000000-0000-0000-0000-0000000000c1/new.pdf');
select as_user('a1');
select decide_flight_change(id('ch2'), true);
reset role;
do $$ declare t trips; begin
  select * into t from trips where id = '10000000-0000-0000-0000-000000000001';
  assert (t.shop_by, t.arrival_date, t.proof_path, t.status) = (addis_today() + 8, addis_today() + 10, '00000000-0000-0000-0000-0000000000c1/new.pdf', 'live'::trip_status), 'trip moved, still live';
  assert (select count(*) from requests where trip_id = t.id and flight_moved_at is not null and buy_due_at is null) = 2, 'orders marked, extension cleared';
  assert notes_like('b1', '%flight moved%') = 1 and notes_like('b2', '%flight moved%') = 1, 'receivers told';
  assert notes_like('c1', 'Zakbis approved your new dates.') = 1, 'traveler told';
end $$;
do $$ begin assert buy_due((select r from requests r where id = id('p1'))) = end_of_addis_day(addis_today() + 8), 'buying deadline follows the new shop-by day'; end $$;
set local role authenticated;

-- 4. Each receiver keeps the order or cancels for a refund that opens no reviews.
select as_user('c1');
select must_fail($$select keep_after_move(id('p1'))$$, 'traveler keeps', 'only the receiver');
select as_user('b1');
select keep_after_move(id('p1'));
do $$ begin assert (select flight_kept_at from requests where id = id('p1')) is not null, 'kept'; end $$;
select as_user('b2');
select cancel_after_move(id('p2'));
do $$ declare r requests; begin
  select * into r from requests where id = id('p2');
  assert r.status = 'cancelled' and r.refund_decided_at is not null and r.no_review and r.review_open_at is null, 'refund, no review window';
  assert notes_like('b2', 'How was%') = 0, 'no review prompt';
end $$;
select order_in('p3', 'd1', '10000000-0000-0000-0000-000000000001', 'paid');
set local role authenticated;
select as_user('d1');
select must_fail($$select cancel_after_move(id('p3'))$$, 'cancel an order that was never moved', 'no longer valid');

-- 5. Once anyone on the trip is in Addis, it's a support case.
reset role;
update requests set status = 'landed' where id = id('p3');
set local role authenticated;
select as_user('c1');
select must_fail($$select request_flight_change('10000000-0000-0000-0000-000000000001', 'cancelled')$$, 'someone already in Addis', 'Contact support');

rollback;
