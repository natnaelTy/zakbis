-- Reviews: both sides, after a paid order ends, hidden until both have reviewed; private notes; flags, reports, blocks. Rolls back.
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
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-0000000000d1');
insert into profiles (id, first_name, is_admin, active_side) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true, 'receiver'),
  ('00000000-0000-0000-0000-0000000000b1', 'Meron', false, 'receiver'),
  ('00000000-0000-0000-0000-0000000000b2', 'Lidya', false, 'receiver'),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false, 'traveler'),
  ('00000000-0000-0000-0000-0000000000c2', 'Dawit', false, 'traveler'),
  ('00000000-0000-0000-0000-0000000000d1', 'Sami', false, 'receiver');
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5) on conflict (currency) do update set etb_per_unit = excluded.etb_per_unit;
select test_verify('00000000-0000-0000-0000-0000000000c1');
select test_verify('00000000-0000-0000-0000-0000000000c2');
select set_config('zakbis.deciding', 'on', true);
update traveler_verifications set given_name = 'Hana' where user_id = '00000000-0000-0000-0000-0000000000c1';
update traveler_verifications set given_name = 'Dawit' where user_id = '00000000-0000-0000-0000-0000000000c2';
select set_config('zakbis.deciding', 'off', true);
insert into trips (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c2', 'AE', 'Dubai', 'DXB', addis_today() + 3, addis_today() + 5, 6, 'live');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;
create function id(n text) returns uuid language sql stable as $$ select id from ids where name = n $$;
create function u(x text) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-0000000000' || x)::uuid $$;
create function as_user(x text) returns void language sql as $$ select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || x, true) $$;
create function notes_like(x text, pat text) returns bigint language sql stable security definer as $$
  select count(*) from notes where user_id = u(x) and body like pat
$$;
-- An order from receiver r on traveler t's trip, then (as superuser) moved to `st`.
create function order_in(n text, r text, trip uuid, st request_status) returns void language plpgsql as $$
begin
  perform as_user(r);
  with q as (insert into requests (kind, trip_id, item_name, item_url, unit_price, currency)
    values ('trip', trip, 'Item ' || n, 'https://a.com/x', 10, 'AED') returning id) insert into ids select n, q.id from q;
  perform set_config('request.jwt.claim.sub', '', true);
  update requests set reward_etb = 500, accepted_at = now(), status = st where id = id(n);
end $$;
-- `who` reviews the other side of order n.
create function rev(n text, who text, stars int, tags text[] default '{}', body text default null, note text default null) returns uuid language plpgsql as $$
begin
  perform as_user(who);
  return submit_review(id(n), stars, tags, body, note);
end $$;

-- A delivered order where both sides review (so both reviews show at once). Run as superuser.
create function done_pair(n text, r text, trip uuid, by_receiver int, by_traveler int) returns void language plpgsql as $$
declare t text := case when trip = '10000000-0000-0000-0000-000000000001' then 'c1' else 'c2' end;
begin
  perform order_in(n, r, trip, 'delivered');
  perform rev(n, r, by_receiver);
  perform rev(n, t, by_traveler);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
create function flag_of(x text) returns uuid language sql stable security definer as $$
  select id from review_flags where user_id = u(x) and decided_at is null
$$;
create function open_flags(x text, sd text) returns bigint language sql stable security definer as $$
  select count(*) from review_flags where user_id = u(x) and side = sd and decided_at is null
$$;

-- 1. The window opens when the order is delivered (or a refund is decided after payment), and both sides are asked.
select order_in('o1', 'b1', '10000000-0000-0000-0000-000000000001', 'paid');
set local role authenticated;
select must_fail($$select rev('o1', 'b1', 5)$$, 'review before delivery', 'can''t review');
reset role;
select set_config('request.jwt.claim.sub', '', true);
update requests set status = 'delivered' where id = id('o1');
do $$ begin
  assert (select review_open_at from requests where id = id('o1')) is not null, 'window open';
  assert notes_like('b1', 'How was Hana?%') = 1 and notes_like('c1', 'How was Meron?%') = 1, 'both asked once';
end $$;
update requests set status = 'paid_out' where id = id('o1');
do $$ begin assert notes_like('b1', 'How was%') = 1, 'paid out doesn''t ask again'; end $$;
set local role authenticated;

-- 2. Inputs: stars, tags for the side, contact details, one review each, parties only.
select must_fail($$select rev('o1', 'd1', 5)$$, 'stranger reviews', 'can''t review');
select must_fail($$select rev('o1', 'b1', 6)$$, 'six stars', 'rating');
select must_fail($$select rev('o1', 'b1', 5, '{clear_request}')$$, 'receiver tag on a traveler', 'tag');
select must_fail($$select rev('o1', 'b1', 5, '{}', 'call me 0911 23 45 67')$$, 'phone in a comment', 'please remove');
select must_fail($$insert into reviews (request_id, author_id, subject_id, side, rating) values (id('o1'), u('b1'), u('c1'), 'traveler', 5)$$, 'direct insert');
insert into ids select 'r1', rev('o1', 'b1', 5, '{polite,on_time}', '   ', 'She was lovely');
select must_fail($$select rev('o1', 'b1', 4)$$, 'second review', 'already');
do $$ declare v reviews; begin
  select * into v from reviews where id = id('r1');
  assert v.text is null and v.side = 'traveler' and v.tags = '{polite,on_time}' and v.visible_at is null, 'stored hidden, blank comment is null';
end $$;

-- 3. Hidden until both: nobody but the author (and admins) sees it; nothing counts yet.
select as_user('c1');
do $$ begin assert (select count(*) from reviews where request_id = id('o1')) = 0, 'subject can''t peek'; end $$;
select as_user('d1');
do $$ begin assert (select count(*) from reviews where request_id = id('o1')) = 0, 'stranger can''t see'; end $$;
select as_user('b1');
do $$ begin assert (select count(*) from reviews where request_id = id('o1')) = 1, 'author sees own'; end $$;
select as_user('a1');
do $$ begin assert (select count(*) from reviews where request_id = id('o1')) = 1, 'admin sees it'; end $$;
do $$ begin assert (select review_count from traveler_stats where traveler_id = u('c1')) = 0, 'not counted while hidden'; end $$;
insert into ids select 'r2', rev('o1', 'c1', 4, '{clear_request}', 'Quick handover.');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  assert (select count(*) from reviews where request_id = id('o1')) = 2, 'both visible to anyone';
  assert (select (rating, review_count, deliveries) from traveler_stats where traveler_id = u('c1')) = (5.0::numeric(2,1), 1::bigint, 1::bigint), 'traveler stats';
  assert (select (rating, review_count) from receiver_stats where receiver_id = u('b1')) = (4.0::numeric(2,1), 1::bigint), 'receiver stats';
  assert (select n from review_tag_counts where subject_id = u('c1') and side = 'traveler' and tag = 'polite') = 1, 'tag counts';
end $$;

-- 4. The private note: never readable outside admin functions.
set local role authenticated;
select as_user('c1');
do $$ begin assert (select count(*) from review_notes) = 0, 'subject can''t read notes'; end $$;
select as_user('b1');
do $$ begin assert (select count(*) from review_notes) = 0, 'author can''t read notes'; end $$;
reset role;
do $$ begin assert (select note from review_notes where review_id = id('r1')) = 'She was lovely', 'note stored'; end $$;

-- 5. A hidden review drops out of view and out of the numbers.
update reviews set hidden_at = now() where id = id('r1');
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  assert (select count(*) from reviews where request_id = id('o1')) = 1, 'hidden review not public';
  assert (select review_count from traveler_stats where traveler_id = u('c1')) = 0, 'hidden not counted';
end $$;
reset role;
set local role authenticated;
select as_user('a1');
do $$ begin assert (select count(*) from public_reviews where request_id = id('o1')) = 1, 'public list drops a hidden review even for admins'; end $$;
select as_user('b1');
do $$ begin assert (select count(*) from public_reviews where request_id = id('o1')) = 1, 'and for its author'; end $$;
reset role;
update reviews set hidden_at = null where id = id('r1');

-- 6. A refund decided after payment opens the window too.
select order_in('o2', 'b1', '10000000-0000-0000-0000-000000000001', 'purchased');
select set_config('request.jwt.claim.sub', '', true);
select decide_refund(r, 'refund note', 'cancel note') from requests r where r.id = id('o2');
do $$ begin assert (select review_open_at from requests where id = id('o2')) is not null, 'refunded order can be reviewed'; end $$;

-- 7. The window closes after 14 days.
update requests set review_open_at = now() - interval '15 days' where id = id('o2');
set local role authenticated;
select must_fail($$select rev('o2', 'b1', 2)$$, 'review after 14 days', 'time is up');

-- 8. Day 7: a reminder to whoever hasn't reviewed, once. Day 14: a one-sided review shows anyway.
reset role;
select order_in('o3', 'b2', '10000000-0000-0000-0000-000000000002', 'delivered');
set local role authenticated;
select rev('o3', 'b2', 3, '{on_time}');
reset role;
select set_config('request.jwt.claim.sub', '', true);
update requests set review_open_at = now() - interval '8 days' where id = id('o3');
select run_deadlines();
select run_deadlines();
do $$ begin
  assert notes_like('c2', 'A week left to review Lidya%') = 1, 'reminder to the traveler, once';
  assert notes_like('b2', 'A week left%') = 0, 'no reminder to someone who reviewed';
  assert (select visible_at from reviews where request_id = id('o3')) is null, 'still hidden on day 8';
end $$;
update requests set review_open_at = now() - interval '15 days' where id = id('o3');
select run_deadlines();
do $$ begin assert (select visible_at from reviews where request_id = id('o3')) is not null, 'shown after 14 days'; end $$;

-- 9. Flags: 2 of the last 10 at 1-2 stars, or an average under 3.5 from 3 reviews; once until decided; a dismissal holds until a new low review.
reset role;
select done_pair('f1', 'b2', '10000000-0000-0000-0000-000000000001', 1, 5);
do $$ begin assert open_flags('c1', 'traveler') = 0, 'one low review isn''t enough'; end $$;
select done_pair('f2', 'd1', '10000000-0000-0000-0000-000000000001', 1, 5);
do $$ begin
  assert open_flags('c1', 'traveler') = 1, 'second low review flags Hana';
  assert notes_like('a1', 'Reviews to check: Hana (traveler)%') = 1, 'admin told';
end $$;
select done_pair('f3', 'b1', '10000000-0000-0000-0000-000000000001', 1, 5);
do $$ begin assert (select count(*) from review_flags where user_id = u('c1')) = 1, 'no second flag while one is open'; end $$;
select as_user('a1');
select resolve_flag(flag_of('c1'), 'dismiss');
select set_config('request.jwt.claim.sub', '', true);
select done_pair('f4', 'b2', '10000000-0000-0000-0000-000000000001', 4, 5);
do $$ begin assert open_flags('c1', 'traveler') = 0, 'dismissed: no flag without a new low review'; end $$;
select done_pair('f5', 'd1', '10000000-0000-0000-0000-000000000001', 2, 5);
do $$ begin assert open_flags('c1', 'traveler') = 1, 'a new low review flags again'; end $$;
-- The average rule, with no 1-2 star reviews: Dawit has Lidya's 3, then two more 3s.
select done_pair('f6', 'b1', '10000000-0000-0000-0000-000000000002', 3, 5);
do $$ begin assert open_flags('c2', 'traveler') = 0, 'average needs 3 reviews'; end $$;
select done_pair('f7', 'd1', '10000000-0000-0000-0000-000000000002', 3, 5);
do $$ begin assert open_flags('c2', 'traveler') = 1, 'average 3.0 from 3 reviews flags Dawit'; end $$;
-- Receivers too: Sami gets two 1-star reviews from travelers.
select done_pair('f8', 'd1', '10000000-0000-0000-0000-000000000001', 5, 1);
select done_pair('f9', 'd1', '10000000-0000-0000-0000-000000000002', 5, 1);
do $$ begin assert open_flags('d1', 'receiver') = 1, 'Sami flagged as a receiver'; end $$;

-- 10. Reports: only the person reviewed, once; an admin hides or keeps it.
set local role authenticated;
select as_user('b1');
select must_fail($$select report_review(id('r1'), 'contact')$$, 'author reports own review', 'only the person reviewed');
select as_user('d1');
select must_fail($$select report_review(id('r1'), 'contact')$$, 'stranger reports', 'only the person reviewed');
select as_user('c1');
select must_fail($$select report_review(id('r1'), 'rude')$$, 'unknown reason', 'choose a reason');
select report_review(id('r1'), 'untrue');
select must_fail($$select report_review(id('r1'), 'abusive')$$, 'report twice', 'already');
do $$ begin assert notes_like('a1', 'A review of Hana was reported%') = 1, 'admin told about the report'; end $$;
select must_fail($$select decide_report(id('r1'), true)$$, 'non-admin decides', 'admins only');
select must_fail($$select * from reviews_to_check()$$, 'non-admin reads the list', 'admins only');
select must_fail($$select * from reviews_about(u('c1'), 'traveler')$$, 'non-admin reads notes', 'admins only');
select as_user('a1');
do $$ begin
  assert (select count(*) from reviews_to_check() where kind = 'report') = 1, 'report listed';
  assert (select count(*) from reviews_to_check() where kind = 'flag') = 3, 'flags listed';
  assert (select note from reviews_about(u('c1'), 'traveler') where note is not null limit 1) = 'She was lovely', 'admin reads the private note';
end $$;
select decide_report(id('r1'), true);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin assert not exists (select 1 from reviews where id = id('r1')), 'hidden after the report'; end $$;
set local role authenticated;
select as_user('c1');
do $$ begin assert (select count(*) from review_notes) = 0, 'notes still private'; end $$;

-- 11. Blocking a receiver closes what isn't paid; their paid order carries on; new requests, prices and payments are refused.
reset role;
select order_in('s_paid', 'd1', '10000000-0000-0000-0000-000000000001', 'paid');
select order_in('s_wait', 'd1', '10000000-0000-0000-0000-000000000001', 'awaiting_payment');
select as_user('d1');
with q as (insert into requests (kind, countries, needed_by, item_name, item_url, unit_price, currency)
  values ('open', '{AE}', addis_today() + 10, 'Sami open', 'https://a.com/w', 10, 'AED') returning id) insert into ids select 's_open', q.id from q;
select as_user('c2');
insert into ids select 's_offer', make_offer(id('s_open'), '10000000-0000-0000-0000-000000000002', 300);
select as_user('a1');
select must_fail($$select resolve_flag(flag_of('d1'), 'revoke')$$, 'revoke a receiver', 'not an option');
select resolve_flag(flag_of('d1'), 'block');
do $$ begin
  assert exists (select 1 from blocked_receivers where user_id = u('d1')), 'blocked';
  assert (select status from requests where id = id('s_open')) = 'cancelled', 'open request closed';
  assert (select status from offers where id = id('s_offer')) = 'closed', 'pending offer closed';
  assert notes_like('c2', '%Sami open%closed%') >= 1, 'traveler told';
  assert (select status from requests where id = id('s_wait')) = 'cancelled', 'unpaid order closed';
  assert (select status from requests where id = id('s_paid')) = 'paid', 'paid order carries on';
end $$;
do $$ begin assert (select count(*) from reviews_to_check() where kind = 'blocked' and user_id = u('d1')) = 1, 'blocked receiver listed for unblocking'; end $$;
set local role authenticated;
select as_user('d1');
select must_fail($$insert into requests (kind, trip_id, item_name, item_url, unit_price, currency) values ('trip', '10000000-0000-0000-0000-000000000001', 'x', 'https://a.com', 10, 'AED')$$, 'blocked receiver posts', 'can''t make new requests');
select must_fail($$select accept_offer(id('s_offer'))$$, 'blocked receiver accepts', 'can''t make new requests');
select must_fail($$select submit_payment(id('s_wait'), 'telebirr', 'x/y.jpg')$$, 'blocked receiver pays', 'can''t make new requests');
reset role;
select as_user('a1');
select unblock_receiver(u('d1'));
do $$ begin assert (select count(*) from reviews_to_check() where kind = 'blocked') = 0, 'unblocked drops off'; end $$;
set local role authenticated;
select as_user('d1');
insert into requests (kind, trip_id, item_name, item_url, unit_price, currency) values ('trip', '10000000-0000-0000-0000-000000000001', 'After unblock', 'https://a.com', 10, 'AED');

-- 12. Revoking a flagged traveler uses the existing revoke.
select as_user('a1');
select resolve_flag(flag_of('c2'), 'revoke');
do $$ begin assert not is_verified_traveler(u('c2')), 'Dawit revoked'; end $$;
select must_fail($$select resolve_flag(flag_of('c1'), 'block')$$, 'block a traveler', 'not an option');

rollback;
