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

set local role authenticated;
select must_fail($$select run_deadlines()$$, 'users run deadlines', 'permission denied');
select must_fail($$select * from telegram_outbox()$$, 'users read the outbox', 'permission denied');

rollback;
