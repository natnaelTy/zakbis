-- Price back-and-forth on trip and open requests, notes, and closing on trip changes. Rolls back.
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
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-0000000000d1');
insert into profiles (id, first_name, is_admin, active_side) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true, 'receiver'),
  ('00000000-0000-0000-0000-0000000000b1', 'Meron', false, 'receiver'),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false, 'traveler'),
  ('00000000-0000-0000-0000-0000000000c2', 'Dawit', false, 'traveler'),
  ('00000000-0000-0000-0000-0000000000d1', 'Sami', false, 'receiver');
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5) on conflict (currency) do update set etb_per_unit = 38.5;
select test_verify('00000000-0000-0000-0000-0000000000c1');
select test_verify('00000000-0000-0000-0000-0000000000c2');
select set_config('zakbis.deciding', 'on', true);
update traveler_verifications set given_name = 'Hana' where user_id = '00000000-0000-0000-0000-0000000000c1';
update traveler_verifications set given_name = 'Dawit' where user_id = '00000000-0000-0000-0000-0000000000c2';
select set_config('zakbis.deciding', 'off', true);
insert into storage.objects (bucket_id, name) values ('tickets', '00000000-0000-0000-0000-0000000000c1/t.pdf');
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status, proof_path) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live', '00000000-0000-0000-0000-0000000000c1/t.pdf'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c2', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live', null),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 4, addis_today() + 6, 6, 'live', '00000000-0000-0000-0000-0000000000c1/t.pdf');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create function id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;
create function notes_for(u text, side text) returns bigint language sql stable security definer as $$
  select count(*) from notes where user_id = ('00000000-0000-0000-0000-0000000000' || u)::uuid and notes.side = notes_for.side
$$;
create function last_note(u text) returns text language sql stable security definer as $$
  select body from notes where user_id = ('00000000-0000-0000-0000-0000000000' || u)::uuid order by created_at desc, body limit 1
$$;
-- A plpgsql test helper: insert a request as the current user and remember its id.
create function ask(n text, k request_kind, trip uuid, item text, notes text default null) returns void language plpgsql as $$
begin
  if k = 'trip' then
    with r as (insert into requests (kind, trip_id, item_name, item_url, unit_price, currency, reward_etb, notes)
      values ('trip', trip, item, 'https://zara.com/x', 120, 'AED', 800, notes) returning id) insert into ids select n, r.id from r;
  else
    with r as (insert into requests (kind, countries, needed_by, item_name, item_url, unit_price, currency, notes)
      values ('open', '{AE}', addis_today() + 10, item, 'https://a.com/w', 50, 'AED', notes) returning id) insert into ids select n, r.id from r;
  end if;
end $$;

set local role authenticated;

-- 1. A trip request saves without a reward and gives the traveler 48 hours.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select ask('req1', 'trip', '10000000-0000-0000-0000-000000000001', 'Perfume');
do $$ declare r requests; begin
  select * into r from requests where id = id('req1');
  assert r.reward_etb is null, 'trip request has no reward until a price is accepted';
  assert r.answer_due_at between now() + interval '47 hours' and now() + interval '48 hours 1 minute', 'traveler has 48 hours';
  assert notes_for('c1', 'traveler') = 1, 'traveler told about the request';
end $$;

-- 2. Contact details are rejected in free text.
select must_fail($$select ask('x', 'trip', '10000000-0000-0000-0000-000000000001', 'call 0911 234 567')$$, 'phone in item name', 'please remove phone numbers');
select must_fail($$select ask('x', 'trip', '10000000-0000-0000-0000-000000000001', 'Shoes', '@hana_b')$$, 'handle in notes', 'please remove phone numbers');
select ask('iphone', 'trip', '10000000-0000-0000-0000-000000000001', 'iPhone 15 Pro 256GB');
select ask('dated', 'trip', '10000000-0000-0000-0000-000000000001', 'Dates', 'landing 2026-11-03, 03.11.2026, 1 500 000 ETB');
reset role;
alter table trips disable trigger trips_rules; -- a note saved before the rule existed
set local request.jwt.claim.sub = '';
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status, note) values
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live', 'call 0911 234 567');
alter table trips enable trigger trips_rules;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update trips set status = 'cancelled' where id = '10000000-0000-0000-0000-000000000009';
do $$ begin assert (select status from my_trips() where id = '10000000-0000-0000-0000-000000000009') = 'cancelled', 'an old note never locks the trip'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$update trips set note = 'wa.me/251911' where id = '10000000-0000-0000-0000-000000000001'$$, 'link in trip note', 'please remove phone numbers');

-- 3. Only the trip's traveler names the price, once.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select must_fail($$select make_offer(id('req1'), '10000000-0000-0000-0000-000000000002', 1000)$$, 'another traveler prices a trip request');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select make_offer(id('req1'), '10000000-0000-0000-0000-000000000002', 1200)$$, 'price with someone else''s trip');
insert into ids select 'o1', make_offer(id('req1'), '10000000-0000-0000-0000-000000000001', 1200);
do $$ declare o offers; begin
  select * into o from offers where id = id('o1');
  assert o.turn = 'receiver' and o.reward_etb = 1200, 'receiver answers next';
  assert o.due_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours', 'receiver has 24 hours';
  assert (select count(*) from offer_events where offer_id = o.id and kind = 'price') = 1, 'price in history';
  assert notes_for('b1', 'receiver') = 1, 'receiver told about the price';
end $$;
select must_fail($$select make_offer(id('req1'), '10000000-0000-0000-0000-000000000001', 1100)$$, 'second price', 'already');

-- 4. Suggestions: receiver only, lower only, in turn.
select must_fail($$select suggest_reward(id('o1'), 900)$$, 'traveler suggests', 'only the receiver');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$select suggest_reward(id('o1'), 1200)$$, 'suggestion not lower', 'lower');
select suggest_reward(id('o1'), 900);
do $$ begin assert (select (turn, suggestions_used, suggestion_etb) = ('traveler', 1, 900) from offers where id = id('o1')), 'traveler''s turn after a suggestion'; end $$;
select must_fail($$select suggest_reward(id('o1'), 800)$$, 'suggest out of turn', 'not your turn');

-- 5. Counters must beat the suggestion; three suggestions at most.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select counter_offer(id('o1'), 900)$$, 'counter at the suggestion', 'more than');
select counter_offer(id('o1'), 1000);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select suggest_reward(id('o1'), 950);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select counter_offer(id('o1'), 980);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select suggest_reward(id('o1'), 960);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select counter_offer(id('o1'), 970);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert (select suggestions_used from offers where id = id('o1')) = 3, 'three suggestions used'; end $$;
select must_fail($$select suggest_reward(id('o1'), 965)$$, 'fourth suggestion', 'no suggestions left');

-- 6. Nothing after the deadline.
reset role;
update offers set due_at = now() - interval '1 minute' where id = id('o1');
set local role authenticated;
select must_fail($$select accept_offer(id('o1'))$$, 'accept after the deadline', 'time is up');
reset role;
update offers set due_at = now() + interval '1 hour' where id = id('o1');
set local role authenticated;

-- 7. Accepting fixes the reward and starts the payment clock.
select accept_offer(id('o1'));
do $$ declare r requests; begin
  select * into r from requests where id = id('req1');
  assert r.status = 'awaiting_payment' and r.reward_etb = 970, 'accepted at the current price';
  assert r.payment_due_at between now() + interval '23 hours' and now() + interval '24 hours', 'receiver has 24 hours to pay';
  assert last_note('c1') like '%accepted%', 'traveler told';
end $$;
select must_fail($$select accept_offer(id('o1'))$$, 'accept twice', 'no longer');

-- 8. The traveler can accept a suggestion.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into ids select 'o2', make_offer(id('iphone'), '10000000-0000-0000-0000-000000000001', 500);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select suggest_reward(id('o2'), 400);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select accept_suggestion(id('o2'));
do $$ begin assert (select (reward_etb, status) = (400, 'awaiting_payment'::request_status) from requests where id = id('iphone')), 'accepted at the suggestion'; end $$;

-- 9. Open request: offers are private; accepting one closes the others.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select ask('open1', 'open', null, 'Watch');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into ids select 'o3', make_offer(id('open1'), '10000000-0000-0000-0000-000000000001', 600);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
insert into ids select 'o4', make_offer(id('open1'), '10000000-0000-0000-0000-000000000002', 500);
do $$ begin
  assert (select count(*) from offers where request_id = id('open1')) = 1, 'a traveler sees only their own offer';
  assert (select count(*) from offer_events e join offers o on o.id = e.offer_id where o.request_id = id('open1')) = 1, 'and only their own history';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert (select count(*) from offers where request_id = id('open1')) = 2, 'receiver sees every offer'; end $$;
select accept_offer(id('o4'));
do $$ begin
  assert (select status from offers where id = id('o3')) = 'closed', 'other offer closed';
  assert (select count(*) from offer_events where offer_id = id('o3') and kind = 'close') = 1, 'close in history';
  assert last_note('c1') like '%another traveler%', 'other traveler told';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin assert (select count(*) from requests where id = id('open1')) = 1, 'a traveler still sees a request they offered on'; end $$;

-- 10. One offer per traveler per request, ever.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select ask('open2', 'open', null, 'Bag');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into ids select 'o5', make_offer(id('open2'), '10000000-0000-0000-0000-000000000001', 300);
select withdraw_offer(id('o5'));
select must_fail($$select make_offer(id('open2'), '10000000-0000-0000-0000-000000000001', 250)$$, 'offer again after withdrawing', 'already');

-- 11. Declining.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select ask('req3', 'trip', '10000000-0000-0000-0000-000000000001', 'Laptop');
select ask('req4', 'trip', '10000000-0000-0000-0000-000000000001', 'Tea');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select decline_request(id('req3'), 'nonsense')$$, 'unknown reason');
select decline_request(id('req3'), 'too_heavy');
do $$ begin
  assert (select (status, decline_reason) = ('declined'::request_status, 'too_heavy') from requests where id = id('req3')), 'declined with a reason';
  assert last_note('b1') like '%Laptop%', 'receiver told';
end $$;
insert into ids select 'o6', make_offer(id('req4'), '10000000-0000-0000-0000-000000000001', 700);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select decline_offer(id('o6'));
do $$ begin assert (select status from requests where id = id('req4')) = 'declined', 'declining the only price closes a trip request'; end $$;

-- 12. Cancelling.
select ask('open3', 'open', null, 'Scarf');
select ask('req5', 'trip', '10000000-0000-0000-0000-000000000001', 'Pen');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
insert into ids select 'o7', make_offer(id('open3'), '10000000-0000-0000-0000-000000000002', 200);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select cancel_request(id('open3'));
do $$ begin
  assert (select status from requests where id = id('open3')) = 'cancelled', 'cancelled';
  assert (select status from offers where id = id('o7')) = 'closed', 'its offers closed';
  assert last_note('c2') like '%Scarf%', 'traveler told';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select must_fail($$select cancel_request(id('req5'))$$, 'stranger cancels', 'only the receiver');

-- 13. A trip change closes what's still being priced; trips with paid orders are locked.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select ask('open4', 'open', null, 'Cap');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into ids select 'o8', make_offer(id('open4'), '10000000-0000-0000-0000-000000000001', 150);
update trips set arrival_date = addis_today() + 6 where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select status from requests where id = id('req5')) = 'cancelled', 'pending trip request closed';
  assert (select status from requests where id = id('req1')) = 'cancelled', 'unpaid accepted order closed';
  assert (select status from offers where id = id('o8')) = 'closed', 'offer using the trip closed';
  assert (select status from requests where id = id('open4')) = 'open', 'the open request stays open for others';
end $$;
reset role;
do $$ begin assert (select count(*) from notes where user_id = '00000000-0000-0000-0000-0000000000b1' and body like '%trip changed%') >= 3, 'receiver told'; end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select ask('paid1', 'trip', '10000000-0000-0000-0000-000000000003', 'Book');
reset role;
update requests set status = 'paid' where id = id('paid1');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$update trips set status = 'cancelled' where id = '10000000-0000-0000-0000-000000000003'$$, 'cancel with paid orders', 'paid orders');
select must_fail($$update trips set arrival_date = addis_today() + 7 where id = '10000000-0000-0000-0000-000000000003'$$, 'move with paid orders', 'paid orders');
update trips set free_kg = 7 where id = '10000000-0000-0000-0000-000000000003';
do $$ begin assert (select free_kg from my_trips() where id = '10000000-0000-0000-0000-000000000003') = 7, 'kg still editable'; end $$;

-- 14. my_orders from each side.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select ask('open5', 'open', null, 'Belt');
select ask('req7', 'trip', '10000000-0000-0000-0000-000000000003', 'Mug');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select make_offer(id('open5'), '10000000-0000-0000-0000-000000000003', 100);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select make_offer(id('open5'), '10000000-0000-0000-0000-000000000002', 120);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select (stage, offers) = ('offers', 2) from my_orders('receiver') where id = id('open5')), 'receiver sees two offers';
  assert (select (stage, counterpart) = ('waiting', 'Hana') from my_orders('receiver') where id = id('req7')), 'receiver waits for Hana';
  assert (select count(*) from my_orders('traveler')) = 0, 'receiver has no traveler orders';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select stage from my_orders('traveler') where id = id('req7')) = 'answer', 'traveler must answer';
  assert (select due_at from my_orders('traveler') where id = id('req7')) = (select answer_due_at from requests where id = id('req7')), 'with the answer deadline';
  assert (select stage from my_orders('traveler') where id = id('open1')) = 'closed', 'an offer the receiver passed on shows closed';
end $$;

-- 15. Notes are private and can be marked read.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
do $$ begin
  assert (select count(*) from notes where user_id <> auth.uid()) = 0, 'only your own notes';
  assert (select n from unread_notes() where side = 'traveler') > 0, 'unread notes counted';
end $$;
select mark_notes_read('traveler');
do $$ begin assert coalesce((select n from unread_notes() where side = 'traveler'), 0) = 0, 'all read'; end $$;

-- 16. The old shortcuts are gone; history and notes are written by the database only.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select must_fail($$select advance_request(id('req7'), 'awaiting_payment')$$, 'old accept path', 'use');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$insert into offer_events (offer_id, actor, kind, reward_etb) values (id('o1'), 'traveler', 'price', 1)$$, 'write history');
select must_fail($$insert into notes (user_id, side, body) values (auth.uid(), 'receiver', 'hi')$$, 'write a note');
select must_fail($$select notify(auth.uid(), 'receiver', null, 'hi')$$, 'call notify', 'permission denied');

rollback;
