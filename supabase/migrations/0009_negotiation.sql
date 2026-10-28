-- Save for real, part 1: the price back-and-forth on trip and open requests, Inbox notes, and closing on trip changes.
-- Spec: docs/superpowers/specs/2026-10-28-save-for-real-design.md. Apply inside begin;/commit;.
-- The new enum value below is only used inside function bodies: Postgres can't use it in the transaction that adds it.

alter type request_status add value 'expired';

-- Helpers -----------------------------------------------------------------------

create function end_of_addis_day(d date) returns timestamptz language sql immutable as $$
  select ((d + 1)::timestamp at time zone 'Africa/Addis_Ababa')
$$;

-- Same patterns as hasContactDetails in lib/negotiation.ts: Ethiopian phone numbers (09/07…, 251…), +international numbers,
-- @handles, emails, links. Dates and amounts (2026-11-03, 1 500 000) pass.
create function has_contact(t text) returns boolean language sql immutable as $$
  select coalesce(
    t ~ '(\+?251|(^|[^0-9])0)[ -]?[79]([ -]?[0-9]){7}'
    or t ~ '\+[0-9]([ -]?[0-9]){7,}'
    or t ~ '(^|[^[:alnum:]_])@[[:alnum:]_]{3,}'
    or t ~* '[[:alnum:]._+-]+@[[:alnum:]-]+\.[a-z]+'
    or t ~* '(https?://|www\.|t\.me/|wa\.me/)', false)
$$;

create function reason_label(k text) returns text language sql immutable as $$
  select case k when 'too_heavy' then 'Too heavy' when 'cant_find' then 'Can''t find it' when 'no_space' then 'Not enough space'
    when 'price_low' then 'Price too low' when 'other' then 'Other' end
$$;

create function etb_text(n int) returns text language sql immutable as $$ select to_char(n, 'FM999,999,999') || ' ETB' $$;

-- Requests ------------------------------------------------------------------------

-- A trip request no longer carries a reward when it's made: the traveler names it.
do $$ declare c text; begin
  select conname into c from pg_constraint
    where conrelid = 'requests'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind = ''trip''%';
  execute format('alter table requests drop constraint %I', c);
end $$;
alter table requests add constraint requests_kind_shape check (
  (kind = 'trip' and trip_id is not null and countries is null and needed_by is null)
  or (kind = 'open' and cardinality(countries) > 0 and needed_by is not null)
);
alter table requests
  add column answer_due_at timestamptz,      -- trip request: the traveler's first answer
  add column answer_reminded boolean not null default false,
  add column payment_due_at timestamptz,
  add column payment_left interval,          -- time left when a screenshot stopped the clock
  add column payment_reminded boolean not null default false,
  add column decline_reason text check (decline_reason in ('too_heavy', 'cant_find', 'no_space', 'price_low', 'other'));

-- Offers and their history ---------------------------------------------------------------

alter table offers drop constraint offers_status_check;
alter table offers add constraint offers_status_check check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'expired', 'closed'));
alter table offers
  add column turn text not null default 'receiver' check (turn in ('receiver', 'traveler')),
  add column suggestion_etb int check (suggestion_etb >= 1),
  add column suggestions_used int not null default 0 check (suggestions_used between 0 and 3),
  add column due_at timestamptz,
  add column reminded boolean not null default false,
  add column decline_reason text check (decline_reason in ('too_heavy', 'cant_find', 'no_space', 'price_low', 'other'));
-- One offer per traveler per request, ever: a declined traveler can't restart the back-and-forth.
drop index offers_one_live_per_traveler;
create unique index offers_one_per_traveler on offers (request_id, traveler_id);

create table offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers on delete cascade,
  actor text check (actor in ('receiver', 'traveler')), -- null when Zakbis closed or expired it
  kind text not null check (kind in ('price', 'suggest', 'accept', 'decline', 'withdraw', 'expire', 'close')),
  reward_etb int,
  created_at timestamptz not null default clock_timestamp()
);
create index on offer_events (offer_id);

-- Security definer so the offers and requests policies don't recurse into each other.
create function can_see_offer(p_offer uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from offers o join requests r on r.id = o.request_id
    where o.id = p_offer and (o.traveler_id = auth.uid() or r.receiver_id = auth.uid() or is_admin()))
$$;
create function has_offer_on(p_request uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from offers where request_id = p_request and traveler_id = auth.uid())
$$;

alter table offer_events enable row level security;
create policy "offer event parties" on offer_events for select to authenticated using (can_see_offer(offer_id));

drop policy "visible requests" on requests;
create policy "visible requests" on requests for select to anon, authenticated using (
  (kind = 'open' and status = 'open' and needed_by >= addis_today())
  or auth.uid() in (receiver_id, traveler_id) or is_admin() or has_offer_on(id)
);

-- Notes (the Inbox; also sent to Telegram) -------------------------------------------

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  side text not null check (side in ('receiver', 'traveler')),
  request_id uuid references requests on delete cascade,
  body text not null,
  read_at timestamptz,
  telegram_sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index on notes (user_id, side, created_at desc);
alter table notes enable row level security;
create policy "own notes" on notes for select to authenticated using (user_id = auth.uid());

create function notify(p_user uuid, p_side text, p_request uuid, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into notes (user_id, side, request_id, body) values (p_user, p_side, p_request, p_body)
$$;

create function mark_notes_read(p_side text) returns void language sql security definer set search_path = public as $$
  update notes set read_at = now() where user_id = auth.uid() and side = p_side and read_at is null
$$;

create function unread_notes() returns table (side text, n int) language sql stable security definer set search_path = public as $$
  select side, count(*)::int from notes where user_id = auth.uid() and read_at is null group by side
$$;

create function traveler_name(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select given_name from traveler_verifications where user_id = uid), (select first_name from profiles where id = uid), 'The traveler')
$$;
create function receiver_name(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select first_name from profiles where id = uid), 'The receiver')
$$;

create function log_offer(p_offer uuid, p_actor text, p_kind text, p_reward int) returns void
language sql security definer set search_path = public as $$
  insert into offer_events (offer_id, actor, kind, reward_etb) values (p_offer, p_actor, p_kind, p_reward)
$$;

-- Each pricing turn: 24 hours, cut off at the end of the shop-by day (and the needed-by day for open requests).
create function turn_due(r requests, t trips) returns timestamptz language sql stable as $$
  select least(now() + interval '24 hours', end_of_addis_day(t.shop_by), end_of_addis_day(r.needed_by))
$$;

-- Making a request -------------------------------------------------------------------

create or replace function requests_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare
  shop date;
begin
  new.receiver_id := auth.uid();
  if new.receiver_id is null then raise exception 'login required'; end if;
  if (select first_name from profiles where id = new.receiver_id) is null then raise exception 'set up your receiver side first'; end if;
  if has_contact(new.item_name) or has_contact(new.notes) then raise exception 'please remove phone numbers, @handles, emails and links'; end if;
  new.status := 'open';
  new.reward_etb := null; -- the traveler names it; it's fixed when a price is accepted
  new.receipt_path := null;
  new.accepted_at := null;
  new.purchased_at := null;
  new.landed_at := null;
  new.answer_due_at := null;
  new.answer_reminded := false;
  new.payment_due_at := null;
  new.payment_left := null;
  new.payment_reminded := false;
  new.decline_reason := null;
  select etb_per_unit into new.fx_rate from fx_rates where currency = new.currency;
  if not found then raise exception 'no fx rate for %', new.currency; end if;

  if new.kind = 'trip' then
    select traveler_id, shop_by into new.traveler_id, shop from trips where id = new.trip_id and shop_by >= addis_today() and status = 'live';
    if not found then raise exception 'trip is not available'; end if;
    if new.traveler_id = new.receiver_id then raise exception 'cannot request on your own trip'; end if;
    if not is_verified_traveler(new.traveler_id) then raise exception 'this traveler is not verified'; end if;
    new.answer_due_at := least(now() + interval '48 hours', end_of_addis_day(shop));
    new.answer_reminded := new.answer_due_at - now() <= interval '24 hours';
  else
    new.traveler_id := null;
    new.trip_id := null;
    if new.needed_by is null or new.needed_by not between addis_today() + 3 and addis_today() + 60 then
      raise exception 'needed by must be 3 to 60 days ahead';
    end if;
  end if;
  return new;
end $$;

create or replace function requests_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into handover_codes (request_id) values (new.id);
  if new.kind = 'trip' then
    perform notify(new.traveler_id, 'traveler', new.id,
      format('%s asked you to bring %s. Name your reward or decline.', receiver_name(new.receiver_id), new.item_name));
  end if;
  return new;
end $$;

-- Pricing ----------------------------------------------------------------------------

-- Locks the request first, so two taps or two tabs can't both act; returns the offer as it is after the lock.
create function lock_offer(p_offer uuid) returns offers language plpgsql security definer set search_path = public as $$
declare
  o offers;
begin
  select * into o from offers where id = p_offer;
  if not found then raise exception 'offer not found'; end if;
  perform 1 from requests where id = o.request_id for update;
  select * into o from offers where id = p_offer;
  return o;
end $$;

create function check_turn(o offers, r requests, p_who text) returns void language plpgsql stable as $$
begin
  if p_who = 'receiver' and r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can do that'; end if;
  if p_who = 'traveler' and o.traveler_id is distinct from auth.uid() then raise exception 'only the traveler can do that'; end if;
  if o.status <> 'pending' or r.status <> 'open' then raise exception 'this offer is no longer valid'; end if;
  if o.turn <> p_who then raise exception 'not your turn'; end if;
  if o.due_at < now() then raise exception 'time is up'; end if;
end $$;

-- An open request: any matching traveler. A trip request: its traveler names the first price.
create or replace function make_offer(p_request uuid, p_trip uuid, p_reward int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r requests;
  t trips;
  due timestamptz;
  new_id uuid;
begin
  if uid is null then raise exception 'login required'; end if;
  select * into r from requests where id = p_request for update;
  if not found then raise exception 'this request is not open for offers'; end if;
  if r.receiver_id = uid then raise exception 'cannot offer on your own request'; end if;
  if exists (select 1 from offers where request_id = p_request and traveler_id = uid) then
    raise exception 'you already offered on this request';
  end if;
  if r.kind = 'open' then
    if r.status <> 'open' or r.needed_by < addis_today() then raise exception 'this request is not open for offers'; end if;
    if not is_verified_traveler(uid) then raise exception 'only verified travelers can offer'; end if;
    select * into t from trips where id = p_trip and traveler_id = uid and status = 'live';
    if not found then raise exception 'trip not found'; end if;
    if not (t.origin_country = any (r.countries) and t.arrival_date <= r.needed_by and t.shop_by >= addis_today()) then
      raise exception 'your trip does not match this request';
    end if;
  else
    if r.traveler_id is distinct from uid then raise exception 'only the traveler can price this request'; end if;
    if r.status <> 'open' then raise exception 'this request is no longer open'; end if;
    if r.answer_due_at < now() then raise exception 'time is up'; end if;
    if p_trip is distinct from r.trip_id then raise exception 'trip not found'; end if;
    if not is_verified_traveler(uid) then raise exception 'this traveler is not verified'; end if;
    select * into t from trips where id = p_trip and status = 'live' and shop_by >= addis_today();
    if not found then raise exception 'this trip is no longer open'; end if;
  end if;
  if p_reward is null or p_reward < 1 then raise exception 'enter a reward in ETB'; end if;

  due := turn_due(r, t);
  insert into offers (request_id, traveler_id, trip_id, reward_etb, turn, due_at, reminded)
    values (p_request, uid, p_trip, p_reward, 'receiver', due, due - now() <= interval '4 hours') returning id into new_id;
  perform log_offer(new_id, 'traveler', 'price', p_reward);
  perform notify(r.receiver_id, 'receiver', r.id, format('%s named %s for %s', traveler_name(uid), etb_text(p_reward), r.item_name));
  return new_id;
end $$;

create function suggest_reward(p_offer uuid, p_reward int) returns void language plpgsql security definer set search_path = public as $$
declare
  o offers := lock_offer(p_offer);
  r requests;
  due timestamptz;
begin
  select * into r from requests where id = o.request_id;
  perform check_turn(o, r, 'receiver');
  if o.suggestions_used >= 3 then raise exception 'no suggestions left'; end if;
  if p_reward is null or p_reward < 1 or p_reward >= o.reward_etb then raise exception 'suggest a lower reward'; end if;
  due := turn_due(r, (select t from trips t where t.id = o.trip_id));
  update offers set suggestion_etb = p_reward, suggestions_used = suggestions_used + 1, turn = 'traveler',
    due_at = due, reminded = due - now() <= interval '4 hours' where id = o.id;
  perform log_offer(o.id, 'receiver', 'suggest', p_reward);
  perform notify(o.traveler_id, 'traveler', r.id, format('%s suggested %s for %s', receiver_name(r.receiver_id), etb_text(p_reward), r.item_name));
end $$;

create function counter_offer(p_offer uuid, p_reward int) returns void language plpgsql security definer set search_path = public as $$
declare
  o offers := lock_offer(p_offer);
  r requests;
  due timestamptz;
begin
  select * into r from requests where id = o.request_id;
  perform check_turn(o, r, 'traveler');
  if p_reward is null or p_reward <= o.suggestion_etb then raise exception 'name more than the suggestion, or accept it'; end if;
  due := turn_due(r, (select t from trips t where t.id = o.trip_id));
  update offers set reward_etb = p_reward, suggestion_etb = null, turn = 'receiver',
    due_at = due, reminded = due - now() <= interval '4 hours' where id = o.id;
  perform log_offer(o.id, 'traveler', 'price', p_reward);
  perform notify(r.receiver_id, 'receiver', r.id, format('%s named %s for %s', traveler_name(o.traveler_id), etb_text(p_reward), r.item_name));
end $$;

-- Fixes the reward on the request and starts the payment clock; other offers close.
create function settle_offer(o offers, p_reward int) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
  t trips;
  due timestamptz;
  by_receiver boolean;
  x record;
begin
  select * into r from requests where id = o.request_id;
  by_receiver := auth.uid() = r.receiver_id;
  if not is_verified_traveler(o.traveler_id) then raise exception 'this traveler is not verified'; end if;
  select * into t from trips where id = o.trip_id and status = 'live' and shop_by >= addis_today();
  if not found or (r.kind = 'open' and not (t.origin_country = any (r.countries) and t.arrival_date <= r.needed_by and r.needed_by >= addis_today())) then
    raise exception 'this offer is no longer valid for the trip';
  end if;
  due := least(now() + interval '24 hours', end_of_addis_day(t.shop_by));
  update requests set traveler_id = o.traveler_id, trip_id = o.trip_id, reward_etb = p_reward, status = 'awaiting_payment',
    accepted_at = now(), updated_at = now(), payment_due_at = due, payment_reminded = due - now() <= interval '4 hours'
    where id = r.id;
  update offers set status = 'accepted', suggestion_etb = case when by_receiver then suggestion_etb else p_reward end where id = o.id;
  perform log_offer(o.id, case when by_receiver then 'receiver' else 'traveler' end, 'accept', p_reward);
  for x in update offers set status = 'closed' where request_id = r.id and status = 'pending' returning id, traveler_id loop
    perform log_offer(x.id, null, 'close', null);
    perform notify(x.traveler_id, 'traveler', r.id, format('The receiver chose another traveler for %s', r.item_name));
  end loop;
  if by_receiver then
    perform notify(o.traveler_id, 'traveler', r.id, format('%s accepted %s for %s. We''ll tell you when they pay.', receiver_name(r.receiver_id), etb_text(p_reward), r.item_name));
  else
    perform notify(o.traveler_id, 'traveler', r.id, format('You accepted %s for %s. We''ll tell you when %s pays.', etb_text(p_reward), r.item_name, receiver_name(r.receiver_id)));
  end if;
  perform notify(r.receiver_id, 'receiver', r.id, format('%s for %s is agreed. Pay %s within 24 h.', etb_text(p_reward), r.item_name, etb_text(r.item_etb + p_reward)));
end $$;

create or replace function accept_offer(p_offer uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  o offers := lock_offer(p_offer);
begin
  perform check_turn(o, (select r from requests r where r.id = o.request_id), 'receiver');
  perform settle_offer(o, o.reward_etb);
end $$;

create function accept_suggestion(p_offer uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  o offers := lock_offer(p_offer);
begin
  perform check_turn(o, (select r from requests r where r.id = o.request_id), 'traveler');
  perform settle_offer(o, o.suggestion_etb);
end $$;

-- Declining and withdrawing end that offer; on a trip request that also ends the request.
drop function reject_offer(uuid);
create function decline_offer(p_offer uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  o offers := lock_offer(p_offer);
  r requests;
begin
  select * into r from requests where id = o.request_id;
  if r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can do that'; end if;
  if o.status <> 'pending' or r.status <> 'open' then raise exception 'this offer is no longer valid'; end if;
  update offers set status = 'rejected' where id = o.id;
  perform log_offer(o.id, 'receiver', 'decline', null);
  if r.kind = 'trip' then update requests set status = 'declined', updated_at = now() where id = r.id; end if;
  perform notify(o.traveler_id, 'traveler', r.id, format('%s passed on your price for %s', receiver_name(r.receiver_id), r.item_name));
end $$;

drop function withdraw_offer(uuid);
create function withdraw_offer(p_offer uuid, p_reason text default null) returns void language plpgsql security definer set search_path = public as $$
declare
  o offers := lock_offer(p_offer);
  r requests;
begin
  select * into r from requests where id = o.request_id;
  if o.traveler_id is distinct from auth.uid() then raise exception 'only the traveler can do that'; end if;
  if o.status <> 'pending' or r.status <> 'open' then raise exception 'this offer is no longer valid'; end if;
  if p_reason is not null and reason_label(p_reason) is null then raise exception 'choose a reason'; end if;
  update offers set status = 'withdrawn', decline_reason = p_reason where id = o.id;
  perform log_offer(o.id, 'traveler', 'withdraw', null);
  if r.kind = 'trip' then update requests set status = 'declined', decline_reason = p_reason, updated_at = now() where id = r.id; end if;
  perform notify(r.receiver_id, 'receiver', r.id,
    format('%s withdrew their offer for %s', traveler_name(o.traveler_id), r.item_name) || coalesce(': ' || reason_label(p_reason), ''));
end $$;

create function decline_request(p_request uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.kind <> 'trip' or r.traveler_id is distinct from auth.uid() then raise exception 'only the traveler can do that'; end if;
  if r.status <> 'open' or exists (select 1 from offers where request_id = r.id) then raise exception 'this request is no longer open'; end if;
  if reason_label(p_reason) is null then raise exception 'choose a reason'; end if;
  update requests set status = 'declined', decline_reason = p_reason, updated_at = now() where id = r.id;
  perform notify(r.receiver_id, 'receiver', r.id, format('%s can''t bring %s: %s', traveler_name(r.traveler_id), r.item_name, reason_label(p_reason)));
end $$;

-- Before paying only: once a screenshot waits for the admin, the money is in Zakbis's hands.
create function cancel_request(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
  x record;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can cancel'; end if;
  if not (r.status = 'open' or (r.status = 'awaiting_payment' and not has_pending_escrow(r.id))) then
    raise exception 'this request can''t be cancelled now';
  end if;
  update requests set status = 'cancelled', updated_at = now() where id = r.id;
  for x in update offers set status = 'closed' where request_id = r.id and status = 'pending' returning id loop
    perform log_offer(x.id, null, 'close', null);
  end loop;
  for x in select distinct traveler_id from offers where request_id = r.id and status in ('closed', 'accepted')
           union select r.traveler_id where r.traveler_id is not null loop
    perform notify(x.traveler_id, 'traveler', r.id, format('%s cancelled the request for %s', receiver_name(r.receiver_id), r.item_name));
  end loop;
end $$;

-- Old shortcuts: accepting and declining now go through offers; receivers cancel with cancel_request.
-- The admin "paid" step stays until 0010 replaces it with decide_payment.
create or replace function advance_request(p_id uuid, p_to request_status, p_code text default null, p_receipt text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r requests;
begin
  if uid is null then raise exception 'login required'; end if;
  select * into r from requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;

  if p_to in ('awaiting_payment', 'declined') then
    raise exception 'use make_offer, accept_offer or decline_request instead';
  elsif p_to = 'paid' and r.status = 'awaiting_payment' and is_admin() then
    if not has_pending_escrow(p_id) then raise exception 'no payment proof to confirm'; end if;
    update payments set status = 'confirmed' where request_id = p_id and kind = 'escrow' and status = 'pending';
  elsif p_to = 'purchased' and r.status = 'paid' and uid = r.traveler_id then
    if p_receipt is null then raise exception 'receipt required'; end if;
    if split_part(p_receipt, '/', 1) <> uid::text then raise exception 'receipt must be your own upload'; end if;
    update requests set receipt_path = p_receipt, purchased_at = now() where id = p_id;
  elsif p_to = 'landed' and r.status = 'purchased' and uid = r.traveler_id then
    if coalesce(phone_of(uid), '') not like '251%' then raise exception 'verify an Ethiopian phone number first'; end if;
    update requests set landed_at = now() where id = p_id;
  elsif p_to = 'delivered' then
    raise exception 'use deliver() with the handover code';
  elsif p_to = 'paid_out' and r.status = 'delivered' and is_admin() then
    null;
  elsif p_to = 'cancelled' and r.status not in ('delivered', 'paid_out', 'cancelled', 'declined') and is_admin() then
    null;
  else
    raise exception 'cannot move this request from % to %', r.status, p_to;
  end if;

  update requests set status = p_to, updated_at = now() where id = p_id;
end $$;

-- Trips ------------------------------------------------------------------------------

-- Runs after trips_guard (triggers fire by name), so new.status already shows a cancel or a re-check.
create function trips_rules() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only a new or changed note: an old one must never lock the trip out of cancelling or approval.
  if (tg_op = 'INSERT' or new.note is distinct from old.note) and has_contact(new.note) then raise exception 'please remove phone numbers, @handles, emails and links'; end if;
  if tg_op = 'UPDATE' and old.status = 'live' and new.status <> 'live'
     and exists (select 1 from requests where trip_id = new.id and status in ('paid', 'purchased', 'landed')) then
    raise exception 'this trip has paid orders. Contact support to change it';
  end if;
  return new;
end $$;
create trigger trips_rules before insert or update on trips for each row execute function trips_rules();

-- A trip that stops being live closes what's still being priced or waiting for payment (not a waiting screenshot).
create function trips_after_change() returns trigger language plpgsql security definer set search_path = public as $$
declare
  x record;
  who text := traveler_name(new.traveler_id);
begin
  for x in update requests set status = 'cancelled', updated_at = now()
           where trip_id = new.id and (status = 'open' or (status = 'awaiting_payment' and not has_pending_escrow(id)))
           returning id, receiver_id, item_name loop
    perform log_offer(o.id, null, 'close', null) from offers o where o.request_id = x.id and o.status = 'pending';
    update offers set status = 'closed' where request_id = x.id and status = 'pending';
    perform notify(x.receiver_id, 'receiver', x.id, format('%s''s trip changed, so your request for %s closed.', who, x.item_name));
  end loop;
  for x in update offers o set status = 'closed' from requests r
           where o.trip_id = new.id and o.status = 'pending' and r.id = o.request_id
           returning o.id, r.id as rid, r.receiver_id, r.item_name loop
    perform log_offer(x.id, null, 'close', null);
    perform notify(x.receiver_id, 'receiver', x.rid, format('%s''s trip changed, so their offer for %s closed.', who, x.item_name));
  end loop;
  return null;
end $$;
create trigger trips_after_change after update on trips for each row
  when (old.status = 'live' and new.status <> 'live') execute function trips_after_change();

-- Orders lists ------------------------------------------------------------------------

-- One row per request the caller is part of on that side, with the stage seen from that side.
create function my_orders(p_side text) returns table (
  id uuid, kind request_kind, item_name text, quantity int, status request_status, total_etb int, item_etb int,
  created_at timestamptz, stage text, due_at timestamptz, counterpart text, offers int, my_offer uuid
) language sql stable security definer set search_path = public as $$
  select m.id, m.kind, m.item_name, m.quantity, m.status, m.total_etb, m.item_etb, m.created_at, s.stage,
    case when s.stage in ('answer', 'waiting') and m.status = 'open' then coalesce(o.due_at, m.answer_due_at)
         when m.status = 'awaiting_payment' then m.payment_due_at end,
    case when p_side = 'traveler' then receiver_name(m.receiver_id)
         when m.traveler_id is not null then traveler_name(m.traveler_id) end,
    case when p_side = 'receiver' and m.kind = 'open' and m.status = 'open' then pc.n else 0 end,
    case when p_side = 'traveler' then o.id end
  from requests m
  left join lateral (
    select * from offers x where x.request_id = m.id
      and (case when p_side = 'traveler' then x.traveler_id = auth.uid() else m.kind = 'trip' end)
    order by x.created_at desc limit 1
  ) o on true
  left join lateral (select count(*)::int as n from offers x where x.request_id = m.id and x.status = 'pending') pc on true
  cross join lateral (select case
    when p_side = 'traveler' and m.status <> 'open' and m.traveler_id is distinct from auth.uid() then 'closed'
    when m.status in ('paid', 'purchased', 'landed', 'delivered', 'paid_out') then 'paid'
    when m.status = 'awaiting_payment' and has_pending_escrow(m.id) then 'checking_payment'
    when m.status = 'awaiting_payment' then case when p_side = 'receiver' then 'pay' else 'waiting' end
    when m.status <> 'open' then 'closed'
    when p_side = 'receiver' and m.kind = 'open' then case when pc.n > 0 then 'offers' else 'no_offers' end
    when o.id is null then case when p_side = 'traveler' then 'answer' else 'waiting' end
    when o.status <> 'pending' then 'closed'
    when o.turn = p_side then 'answer'
    else 'waiting' end as stage) s
  where case when p_side = 'receiver' then m.receiver_id = auth.uid()
             else m.receiver_id <> auth.uid() and ((m.kind = 'trip' and m.traveler_id = auth.uid()) or has_offer_on(m.id)) end
  order by m.created_at desc
$$;

-- Internal helpers stay out of the API.
revoke execute on function notify(uuid, text, uuid, text), log_offer(uuid, text, text, int), settle_offer(offers, int),
  lock_offer(uuid), check_turn(offers, requests, text), turn_due(requests, trips), traveler_name(uuid), receiver_name(uuid)
  from public, anon, authenticated;
