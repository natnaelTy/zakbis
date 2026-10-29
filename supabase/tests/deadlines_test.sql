-- Server-run deadlines and reminders, and the Telegram outbox. Rolls back.
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

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1');
insert into profiles (id, first_name, active_side) values
  ('00000000-0000-0000-0000-0000000000b1', 'Meron', 'receiver'),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', 'traveler');
insert into telegram_links (telegram_id, user_id) values (111, '00000000-0000-0000-0000-0000000000b1'); -- only Meron uses Telegram
select test_verify('00000000-0000-0000-0000-0000000000c1');
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create function id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;
create function notes_like(u text, pat text) returns bigint language sql stable as $$
  select count(*) from notes where user_id = ('00000000-0000-0000-0000-0000000000' || u)::uuid and body like pat
$$;
create function ask(n text, k request_kind) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  if k = 'trip' then
    with r as (insert into requests (kind, trip_id, item_name, item_url, unit_price, currency)
      values ('trip', '10000000-0000-0000-0000-000000000001', 'Item ' || n, 'https://a.com', 10, 'AED') returning id) insert into ids select n, r.id from r;
  else
    with r as (insert into requests (kind, countries, needed_by, item_name, item_url, unit_price, currency)
      values ('open', '{AE}', addis_today() + 10, 'Item ' || n, 'https://a.com', 10, 'AED') returning id) insert into ids select n, r.id from r;
  end if;
end $$;
create function offer(n text, req text, reward int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
  insert into ids select n, make_offer(id(req), '10000000-0000-0000-0000-000000000001', reward);
end $$;

set local role authenticated;
select ask('req1', 'trip');
select ask('req2', 'trip');
select offer('o1', 'req2', 500);
select ask('open1', 'open');
select offer('o2', 'open1', 300);
select ask('open2', 'open');
select offer('o3', 'open2', 300);
select ask('req3', 'trip');
select offer('o4', 'req3', 400);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select accept_offer(id('o4'));
reset role;

-- A trip request with no answer: one reminder, then it expires.
update requests set answer_due_at = now() + interval '23 hours' where id = id('req1');
select run_deadlines();
select run_deadlines();
do $$ begin assert notes_like('c1', 'Reminder:%Item req1%') = 1, 'one reminder to the traveler'; end $$;
update requests set answer_due_at = now() - interval '1 minute' where id = id('req1');
select run_deadlines();
do $$ begin
  assert (select status::text from requests where id = id('req1')) = 'expired', 'expired';
  assert notes_like('b1', '%in time%Item req1%') = 1 and notes_like('c1', '%in time%Item req1%') = 1, 'both told';
end $$;

-- A pending offer: a reminder to whoever's turn it is, then it expires.
update offers set due_at = now() + interval '3 hours', reminded = false where id = id('o1');
select run_deadlines();
do $$ begin assert notes_like('b1', 'Reminder:%Item req2%') = 1, 'receiver reminded'; end $$;
update offers set due_at = now() - interval '1 minute' where id in (id('o1'), id('o2'));
select run_deadlines();
do $$ begin
  assert (select status from offers where id = id('o1')) = 'expired', 'trip request offer expired';
  assert (select status::text from requests where id = id('req2')) = 'expired', 'so the trip request expired';
  assert (select status from offers where id = id('o2')) = 'expired', 'open request offer expired';
  assert (select status from requests where id = id('open1')) = 'open', 'the open request stays open';
end $$;

-- An open request past its needed-by date closes with its offers.
update requests set needed_by = addis_today() - 1 where id = id('open2');
select run_deadlines();
do $$ begin
  assert (select status::text from requests where id = id('open2')) = 'expired', 'open request expired';
  assert (select status from offers where id = id('o3')) = 'closed', 'its offers closed';
end $$;

-- Payment: a reminder, then the order is cancelled.
update requests set payment_due_at = now() + interval '3 hours', payment_reminded = false where id = id('req3');
select run_deadlines();
do $$ begin assert notes_like('b1', 'Reminder:%pay%Item req3%') = 1, 'receiver reminded to pay'; end $$;
update requests set payment_due_at = now() - interval '1 minute' where id = id('req3');
select run_deadlines();
do $$ begin
  assert (select status from requests where id = id('req3')) = 'cancelled', 'unpaid order cancelled';
  assert notes_like('c1', '%Item req3%cancelled%') = 1, 'traveler told';
end $$;

-- Telegram outbox: linked users only, unsent, under a day old, with a link to the order.
insert into notes (user_id, side, request_id, body, created_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'receiver', id('req1'), 'old news', now() - interval '2 days');
do $$ begin
  assert (select count(*) from telegram_outbox(500)) = (select count(*) from notes where user_id = '00000000-0000-0000-0000-0000000000b1' and body <> 'old news'), 'Meron''s fresh notes only';
  assert (select bool_and(chat_id = 111) from telegram_outbox(500)), 'sent to Meron''s Telegram';
  assert (select bool_and(text like '%https://app.zakbis.com/orders/requests/%') from telegram_outbox(500)), 'with a link to the order';
end $$;
select mark_telegram_sent(array(select note_id from telegram_outbox(500)));
do $$ begin
  assert (select count(*) from telegram_outbox(500)) = 0, 'sent notes are not sent again';
  assert (select count(*) from fx_rates) = 4, 'rates seeded';
end $$;

-- After paid: photo silence, buying and swap deadlines, no-shows on both sides, holds, reminders.
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() - 10, addis_today() - 9, 6, 'live'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today(), addis_today(), 6, 'live');
set local role authenticated;
select ask(n, 'trip') from unnest(array['a8', 'a9', 'a10', 'a11', 'a12a', 'a12b', 'ah1', 'ah2', 'a13', 'a13b', 'a14', 'ar']) n;
reset role;
select set_config('request.jwt.claim.sub', '', true);
update requests set traveler_id = '00000000-0000-0000-0000-0000000000c1', reward_etb = 500, accepted_at = now(), purchased_at = now() where id in (select id from ids where name like 'a%');
update requests set status = 'purchased', photo_status = 'pending', photo_due_at = now() - interval '1 minute' where id = id('a8');
update requests set status = 'paid', buy_due_at = now() - interval '1 minute' where id = id('a9');
update requests set status = 'purchased', photo_status = 'rejected', photo_reason = 'other', buy_due_at = now() - interval '1 minute' where id = id('a10');
update requests set status = 'purchased', photo_status = 'ok', trip_id = '10000000-0000-0000-0000-000000000002' where id = id('a11');
update requests set status = 'landed', photo_status = 'ok', landed_at = now() - interval '8 days', handover_due_at = now() + interval '1 hour' where id in (id('a12a'), id('a12b'));
update requests set status = 'purchased', photo_status = 'pending', photo_due_at = now() - interval '1 minute', hold = 'item_problem', held_at = now() where id = id('ah1');
update requests set status = 'landed', photo_status = 'ok', landed_at = now() - interval '8 days', handover_due_at = now() - interval '1 minute', hold = 'cant_reach', held_at = now() where id = id('ah2');
update requests set status = 'paid', trip_id = '10000000-0000-0000-0000-000000000003' where id = id('a13');
update requests set status = 'purchased', photo_status = 'ok', trip_id = '10000000-0000-0000-0000-000000000003' where id = id('a13b');
update requests set status = 'landed', photo_status = 'ok', landed_at = now() - interval '4 days', handover_due_at = now() + interval '3 days' where id = id('a14');
update requests set status = 'purchased', photo_status = 'pending', photo_due_at = now() + interval '1 hour' where id = id('ar');
-- The receiver says "Not right" just before the silence would have counted as OK.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select check_item(id('ar'), false, 'other');
reset role;
update requests set photo_due_at = now() - interval '1 minute' where id = id('ar');
update requests set handover_due_at = now() - interval '1 minute' where id = id('a12b'); -- Meron has no confirmed phone yet

select run_deadlines();
do $$ begin
  assert (select photo_status from requests where id = id('a8')) = 'ok', 'silence counts as looks right';
  assert notes_like('c1', '%didn''t answer in time, so the photo of Item a8 counts as right%') = 1, 'traveler told';
  assert (select hold from requests where id = id('a9')) = 'not_bought', 'not bought goes to the admin';
  assert notes_like('b1', '%hasn''t marked Item a9 bought%') = 1, 'receiver told';
  assert (select (status, refund_decided_at is not null) from requests where id = id('a10')) = ('cancelled'::request_status, true), 'missed swap is refunded';
  assert (select (status, refund_decided_at is not null) from requests where id = id('a11')) = ('cancelled'::request_status, true), 'traveler no-show is refunded';
  assert (select hold from requests where id = id('a12b')) = 'no_receiver_phone', 'no auto-payout without the receiver''s number';
  assert (select photo_status from requests where id = id('ah1')) = 'pending', 'held photo check untouched';
  assert (select (status, hold) from requests where id = id('ah2')) = ('landed'::request_status, 'cant_reach'::text), 'held handover untouched';
  assert notes_like('c1', 'Today is the last day to buy Item a13%') = 1, 'last buying day reminder';
  assert notes_like('b1', '%is due in Addis today%') = 1, 'arrival day reminder';
  assert notes_like('b1', '%is waiting to hand over Item a14%Confirm your phone number%') = 1, 'day-3 handover reminder';
  assert (select photo_status from requests where id = id('ar')) = 'rejected', 'the receiver''s "Not right" wins the race';
end $$;
update auth.users set phone = '251911000001', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000b1';
update auth.users set phone = '251922000002', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000c1';
update requests set landed_at = now() - interval '6 days 1 hour' where id = id('a14');
update requests set handover_due_at = now() - interval '1 minute' where id = id('a12a');
select run_deadlines();
select run_deadlines();
do $$ begin
  assert (select (status, delivered_by_timeout) from requests where id = id('a12a')) = ('delivered'::request_status, true), 'receiver no-show pays the traveler';
  assert notes_like('c1', 'Today is the last day to buy Item a13%') = 1, 'reminders are sent once';
  assert notes_like('b1', '%is waiting to hand over Item a14%') = 2, 'day-6 reminder, once';
  assert notes_like('b1', '%is waiting to hand over Item a14. Call them on +251 911%') = 0 and notes_like('b1', '%Item a14. Call them on +251%') = 1, 'day-6 reminder has the traveler''s number';
end $$;

set local role authenticated;
select must_fail($$select run_deadlines()$$, 'users run deadlines', 'permission denied');
select must_fail($$select * from telegram_outbox()$$, 'users read the outbox', 'permission denied');

rollback;
