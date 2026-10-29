-- After paid: the 15% cut, bought with receipt and item photo, the receiver's photo check, swaps, "I'm in Addis" with an SMS code,
-- the phone reveal, handover, admin holds, refunds and payouts, and their deadlines.
-- Spec: docs/superpowers/specs/2026-10-29-after-paid-design.md. Apply inside begin;/commit;.

-- The cut ------------------------------------------------------------------------------

-- One row. Zakbis keeps this share of the traveler's reward (never of the item cost); locked on each order when the price is agreed.
create table settings (
  id boolean primary key default true check (id),
  fee_pct int not null check (fee_pct between 0 and 50)
);
insert into settings (fee_pct) values (15);
alter table settings enable row level security;
create policy "settings public" on settings for select to anon, authenticated using (true);

create function fee_pct() returns int language sql stable security definer set search_path = public as $$
  select fee_pct from settings
$$;

-- 15% applies to every order, including ones already agreed (user, 2026-10-29).
alter table requests drop column payout_etb, drop column fee_etb;
alter table requests add column fee_pct int not null default 15 check (fee_pct between 0 and 50);
alter table requests
  add column fee_etb int generated always as (round(reward_etb * fee_pct / 100.0)::int) stored,
  add column payout_etb int generated always as (round(unit_price * quantity * fx_rate)::int + reward_etb - round(reward_etb * fee_pct / 100.0)::int) stored;

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
  new.fee_pct := fee_pct(); -- the cut is Zakbis's to set, never the browser's
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

create or replace function settle_offer(o offers, p_reward int) returns void language plpgsql security definer set search_path = public as $$
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
    accepted_at = now(), updated_at = now(), fee_pct = fee_pct(), payment_due_at = due, payment_reminded = due - now() <= interval '4 hours'
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

-- Bought, photo check, swap ------------------------------------------------------------------

alter table requests
  add column item_photo_path text,
  add column photo_status text check (photo_status in ('pending', 'ok', 'rejected')),
  add column photo_reason text check (photo_reason in ('wrong_color', 'wrong_model', 'wrong_size', 'not_asked', 'other')),
  add column photo_due_at timestamptz,
  add column buy_due_at timestamptz,          -- null: the end of the trip's shop-by day; "Give 2 more days" sets it
  add column hold text check (hold in ('not_bought', 'item_problem', 'cant_reach', 'no_receiver_phone')), -- an admin decides; clocks stop
  add column held_at timestamptz,
  add column refund_decided_at timestamptz,
  add column handover_due_at timestamptz,
  add column delivered_by_timeout boolean not null default false,
  add column buy_reminded boolean not null default false,
  add column arrival_reminded boolean not null default false,
  add column handover_reminders int not null default 0;

create function buy_due(r requests) returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(r.buy_due_at, (select end_of_addis_day(t.shop_by) from trips t where t.id = r.trip_id))
$$;

create function item_reason_label(k text) returns text language sql immutable as $$
  select case k when 'wrong_color' then 'Wrong color' when 'wrong_model' then 'Wrong model' when 'wrong_size' then 'Wrong size'
    when 'not_asked' then 'Not what I asked for' when 'other' then 'Other' end
$$;

-- A file the caller uploaded to the private proofs bucket.
create function own_proof(p_path text) returns boolean language sql stable security definer set search_path = public as $$
  select p_path is not null and split_part(p_path, '/', 1) = auth.uid()::text
    and exists (select 1 from storage.objects where bucket_id = 'proofs' and name = p_path)
$$;

-- Cancels a paid order and queues the refund; the admin sends the money and marks it refunded.
create function decide_refund(r requests, p_receiver_note text, p_traveler_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update requests set status = 'cancelled', refund_decided_at = now(), hold = null, updated_at = now() where id = r.id;
  perform notify(r.receiver_id, 'receiver', r.id, p_receiver_note);
  perform notify(r.traveler_id, 'traveler', r.id, p_traveler_note);
end $$;

create function mark_bought(p_request uuid, p_receipt text, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r requests;
  due timestamptz;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.traveler_id is distinct from auth.uid() then raise exception 'only the traveler can do that'; end if;
  if r.status <> 'paid' then raise exception 'this order is no longer valid for that'; end if;
  if r.hold is not null then raise exception 'this order is on hold'; end if;
  if now() > buy_due(r) then raise exception 'time is up'; end if;
  if not (own_proof(p_receipt) and own_proof(p_photo)) then raise exception 'upload the receipt and a photo of the item'; end if;
  due := least(now() + interval '24 hours', buy_due(r));
  update requests set status = 'purchased', purchased_at = now(), receipt_path = p_receipt, item_photo_path = p_photo,
    photo_status = 'pending', photo_reason = null, photo_due_at = due, updated_at = now() where id = r.id;
  perform notify(r.receiver_id, 'receiver', r.id, format('%s bought %s. Check the photo within %s h.', traveler_name(r.traveler_id), r.item_name, hours_left(due)));
end $$;

create function check_item(p_request uuid, p_ok boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can do that'; end if;
  if r.status <> 'purchased' or r.photo_status is distinct from 'pending' then raise exception 'this order is no longer valid for that'; end if;
  if r.hold is not null then raise exception 'this order is on hold'; end if;
  if r.photo_due_at < now() then raise exception 'time is up'; end if;
  if p_ok then
    update requests set photo_status = 'ok', updated_at = now() where id = r.id;
    perform notify(r.traveler_id, 'traveler', r.id, format('%s says %s looks right.', receiver_name(r.receiver_id), r.item_name));
  else
    if item_reason_label(p_reason) is null then raise exception 'choose a reason'; end if;
    update requests set photo_status = 'rejected', photo_reason = p_reason, updated_at = now() where id = r.id;
    perform notify(r.traveler_id, 'traveler', r.id, format('%s says %s isn''t right: %s. Swap it by the end of %s, or tell us you can''t.',
      receiver_name(r.receiver_id), r.item_name, item_reason_label(p_reason), to_char(buy_due(r) at time zone 'Africa/Addis_Ababa' - interval '1 second', 'FMDD Mon')));
  end if;
end $$;

create function swap_item(p_request uuid, p_receipt text, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r requests;
  due timestamptz;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.traveler_id is distinct from auth.uid() then raise exception 'only the traveler can do that'; end if;
  if r.status <> 'purchased' or r.photo_status is distinct from 'rejected' then raise exception 'this order is no longer valid for that'; end if;
  if r.hold is not null then raise exception 'this order is on hold'; end if;
  if now() > buy_due(r) then raise exception 'time is up'; end if;
  if not (own_proof(p_receipt) and own_proof(p_photo)) then raise exception 'upload the receipt and a photo of the item'; end if;
  due := least(now() + interval '24 hours', buy_due(r));
  update requests set receipt_path = p_receipt, item_photo_path = p_photo, photo_status = 'pending', photo_reason = null,
    photo_due_at = due, updated_at = now() where id = r.id;
  perform notify(r.receiver_id, 'receiver', r.id, format('%s swapped %s. Check the new photo within %s h.', traveler_name(r.traveler_id), r.item_name, hours_left(due)));
end $$;

create function cant_swap(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.traveler_id is distinct from auth.uid() then raise exception 'only the traveler can do that'; end if;
  if r.status <> 'purchased' or r.photo_status is distinct from 'rejected' then raise exception 'this order is no longer valid for that'; end if;
  if r.hold is not null then raise exception 'this order is on hold'; end if;
  perform decide_refund(r,
    format('%s can''t swap %s, so the order is cancelled. We''ll refund you %s.', traveler_name(r.traveler_id), r.item_name, etb_text(r.total_etb)),
    format('The order for %s is cancelled. Return the item to the shop if you can.', r.item_name));
end $$;

create or replace function can_see_proof(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from requests r
    where auth.uid() in (r.receiver_id, r.traveler_id)
      and (r.receipt_path = p_name or r.item_photo_path = p_name
           or exists (select 1 from payments p where p.request_id = r.id and p.proof_path = p_name))
  )
$$;

-- Every step after payment has its own function now; only the admin cancel remains here.
create or replace function advance_request(p_id uuid, p_to request_status, p_code text default null, p_receipt text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r requests;
begin
  if uid is null then raise exception 'login required'; end if;
  select * into r from requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;

  if p_to in ('awaiting_payment', 'declined', 'paid') then
    raise exception 'use make_offer, accept_offer, decline_request or decide_payment instead';
  elsif p_to in ('purchased', 'landed', 'delivered', 'paid_out') then
    raise exception 'use mark_bought, the In Addis step, deliver or mark_paid_out instead';
  elsif p_to = 'cancelled' and r.status not in ('delivered', 'paid_out', 'cancelled', 'declined') and is_admin() then
    null;
  else
    raise exception 'cannot move this request from % to %', r.status, p_to;
  end if;

  update requests set status = p_to, updated_at = now() where id = p_id;
end $$;

revoke execute on function buy_due(requests), own_proof(text), decide_refund(requests, text, text) from public, anon, authenticated;

-- Phone codes, "I'm in Addis", the reveal ---------------------------------------------------------

-- SMS codes for the phone check; only the server (service role) reads or writes them.
create table phone_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  phone text not null check (phone ~ '^251[79][0-9]{8}$'),
  code_hash text not null,
  request_id uuid references requests on delete cascade, -- set when the code is for "I'm in Addis"
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on phone_codes (user_id, created_at desc);
alter table phone_codes enable row level security;

create function display_phone(p text) returns text language sql immutable as $$
  select '+251 ' || substr(p, 4, 3) || ' ' || substr(p, 7, 3) || ' ' || substr(p, 10, 3)
$$;

-- Called by /api/phone/verify after a fresh SMS code reached the traveler's Ethiopian SIM: the code is the proof they've arrived.
create function mark_in_addis(p_request uuid, p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
  them text;
  who text;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.traveler_id is distinct from p_user then raise exception 'only the traveler can do that'; end if;
  if r.status <> 'purchased' or r.photo_status is distinct from 'ok' then raise exception 'this order is no longer valid for that'; end if;
  if r.hold is not null then raise exception 'this order is on hold'; end if;
  if addis_today() < (select arrival_date from trips where id = r.trip_id) then raise exception 'not before the arrival date'; end if;
  if addis_today() > (select arrival_date from trips where id = r.trip_id) + 7 then raise exception 'time is up'; end if; -- deadline step 11, even if the cron is late
  if coalesce(phone_of(p_user), '') not like '251%' then raise exception 'confirm an Ethiopian phone number first'; end if;
  update requests set status = 'landed', landed_at = now(), handover_due_at = now() + interval '7 days', updated_at = now() where id = r.id;
  who := traveler_name(r.traveler_id);
  them := phone_of(r.receiver_id);
  if them is not null then
    perform notify(r.receiver_id, 'receiver', r.id, format('%s is in Addis. Call %s on %s. Pick a public place to meet for safety.', who, who, display_phone(phone_of(p_user))));
    perform notify(r.traveler_id, 'traveler', r.id, format('You''re marked in Addis. %s''s number is on the order.', receiver_name(r.receiver_id)));
  else
    perform notify(r.receiver_id, 'receiver', r.id, format('%s is in Addis. Confirm your phone number to see their number and meet.', who));
    perform notify(r.traveler_id, 'traveler', r.id, format('You''re marked in Addis. %s hasn''t confirmed their number yet; we''ve asked them.', receiver_name(r.receiver_id)));
  end if;
end $$;
revoke execute on function mark_in_addis(uuid, uuid) from public, anon, authenticated;
grant execute on function mark_in_addis(uuid, uuid) to service_role;

-- Both numbers appear at "I'm in Addis", and only to someone who confirmed their own. Revealed stays revealed.
create or replace function counterpart_phone(p_request uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() = r.traveler_id then phone_of(r.receiver_id)
    when auth.uid() = r.receiver_id and phone_of(auth.uid()) is not null then phone_of(r.traveler_id)
  end
  from requests r where r.id = p_request and r.landed_at is not null
$$;

-- Handover, problems, admin holds, refunds and payouts ------------------------------------------------

-- Same contract as before (a wrong guess is counted, so it returns instead of raising); now also blocked while on hold.
create or replace function deliver(p_id uuid, p_code text) returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r requests;
  h handover_codes;
begin
  select * into r from requests where id = p_id for update;
  if not found or uid is null or uid is distinct from r.traveler_id or r.status <> 'landed' then
    raise exception 'cannot deliver this request';
  end if;
  if r.hold is not null then raise exception 'this order is on hold'; end if;
  if not exists (select 1 from payout_accounts where user_id = uid) then raise exception 'add a payout account first'; end if;
  select * into h from handover_codes where request_id = p_id for update;
  if h.attempts >= 5 then return 'locked'; end if;
  if p_code is distinct from h.code then
    update handover_codes set attempts = attempts + 1 where request_id = p_id;
    return 'wrong_code';
  end if;
  update requests set status = 'delivered', updated_at = now() where id = p_id;
  perform notify(r.traveler_id, 'traveler', r.id, format('%s confirmed the handover. We''ll send you %s.', receiver_name(r.receiver_id), etb_text(r.payout_etb)));
  perform notify(r.receiver_id, 'receiver', r.id, format('You got %s. Thanks for using Zakbis!', r.item_name));
  return 'delivered';
end $$;

-- The receiver stops the clock and asks Zakbis to step in.
create function report_problem(p_request uuid, p_kind text) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can do that'; end if;
  if r.status <> 'landed' then raise exception 'this order is no longer valid for that'; end if;
  if r.hold is not null then raise exception 'this order is on hold'; end if;
  if r.handover_due_at < now() then raise exception 'time is up'; end if; -- deadline step 12, even if the cron is late
  if p_kind is null or p_kind not in ('item_problem', 'cant_reach') then raise exception 'choose a problem'; end if;
  update requests set hold = p_kind, held_at = now(), updated_at = now() where id = r.id;
  perform notify(r.traveler_id, 'traveler', r.id, format('%s reported a problem with %s. Zakbis will contact you.', receiver_name(r.receiver_id), r.item_name));
end $$;

-- refund for any hold; extend (2 more days to buy) for not_bought; restart (a fresh handover week) for cant_reach;
-- pay (treated as delivered) for item_problem and no_receiver_phone.
create function resolve_hold(p_request uuid, p_action text) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into r from requests where id = p_request for update;
  if not found or r.hold is null then raise exception 'this order is not on hold'; end if;
  if p_action = 'refund' then
    perform decide_refund(r, format('Zakbis decided to refund you %s for %s.', etb_text(r.total_etb), r.item_name), format('Zakbis cancelled the order for %s.', r.item_name));
  elsif p_action = 'extend' and r.hold = 'not_bought' then
    update requests set hold = null, buy_due_at = now() + interval '2 days', updated_at = now() where id = r.id;
    perform notify(r.traveler_id, 'traveler', r.id, format('You have 2 more days to buy %s.', r.item_name));
    perform notify(r.receiver_id, 'receiver', r.id, format('%s has 2 more days to buy %s.', traveler_name(r.traveler_id), r.item_name));
  elsif p_action = 'restart' and r.hold = 'cant_reach' then
    update requests set hold = null, handover_due_at = now() + interval '7 days', handover_reminders = 0, updated_at = now() where id = r.id;
    perform notify(r.traveler_id, 'traveler', r.id, format('You have another week to hand over %s.', r.item_name));
    perform notify(r.receiver_id, 'receiver', r.id, format('%s has another week to hand over %s.', traveler_name(r.traveler_id), r.item_name));
  elsif p_action = 'pay' and r.hold in ('item_problem', 'no_receiver_phone') then
    update requests set hold = null, status = 'delivered', updated_at = now() where id = r.id;
    perform notify(r.traveler_id, 'traveler', r.id, format('Zakbis decided to pay you for %s. We''ll send you %s.', r.item_name, etb_text(r.payout_etb)));
    perform notify(r.receiver_id, 'receiver', r.id, format('Zakbis closed the order for %s.', r.item_name));
  else
    raise exception 'that is not an option for this hold';
  end if;
end $$;

-- The admin sent the money back by hand.
create function mark_order_refunded(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
  pay uuid;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into r from requests where id = p_request for update;
  select id into pay from payments where request_id = p_request and kind = 'escrow' and status = 'confirmed' order by created_at desc limit 1;
  if not found or r.status <> 'cancelled' or r.refund_decided_at is null or pay is null then raise exception 'no refund to mark for this order'; end if;
  update payments set status = 'refunded', decided_at = now(), decided_by = auth.uid() where id = pay;
  perform notify(r.receiver_id, 'receiver', r.id, format('We refunded %s for %s.', etb_text(r.total_etb), r.item_name));
end $$;

-- The admin sent the traveler item cost + reward − Zakbis's cut.
create function mark_paid_out(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into r from requests where id = p_request for update;
  if not found or r.status <> 'delivered' then raise exception 'this order is no longer valid for that'; end if;
  if not exists (select 1 from payout_accounts where user_id = r.traveler_id) then raise exception 'the traveler has no payout account'; end if;
  update requests set status = 'paid_out', updated_at = now() where id = r.id;
  perform notify(r.traveler_id, 'traveler', r.id, format('We sent you %s for %s.', etb_text(r.payout_etb), r.item_name));
end $$;

-- Everything waiting on an admin: holds to decide, refunds to send, payouts to send.
create function orders_to_act() returns table (
  request_id uuid, item_name text, quantity int, kind text, hold text, held_at timestamptz, amount_etb int,
  receiver_name text, traveler_name text, payout_method text, payout_account_name text, payout_account_number text,
  payout_bank_name text, refund_method text, delivered_by_timeout boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  return query
    select r.id, r.item_name, r.quantity, k.kind, r.hold, coalesce(r.held_at, r.updated_at),
           case when k.kind = 'payout' then r.payout_etb else r.total_etb end,
           receiver_name(r.receiver_id), traveler_name(r.traveler_id),
           pa.method, pa.account_name, pa.account_number, pa.bank_name, pm.method, r.delivered_by_timeout
    from requests r
    cross join lateral (select case
      when r.hold is not null then 'hold'
      when r.status = 'delivered' then 'payout'
      when r.status = 'cancelled' and r.refund_decided_at is not null then 'refund' end as kind) k
    left join payout_accounts pa on pa.user_id = r.traveler_id
    left join lateral (select p.method from payments p where p.request_id = r.id and p.kind = 'escrow' and p.status = 'confirmed'
                       order by p.created_at desc limit 1) pm on true
    where k.kind is not null and (k.kind <> 'refund' or pm.method is not null)
    order by 6;
end $$;

-- Deadlines (the every-minute cron already calls run_deadlines) ------------------------------------------

create or replace function run_deadlines() returns void language plpgsql security definer set search_path = public as $$
declare
  x record;
  rq requests;
begin
  -- 1. Trip requests the traveler never answered.
  for x in update requests r set status = 'expired', updated_at = now()
           where r.kind = 'trip' and r.status = 'open' and r.answer_due_at < now()
             and not exists (select 1 from offers o where o.request_id = r.id)
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('%s didn''t answer in time, so your request for %s closed.', traveler_name(x.traveler_id), x.item_name));
    perform notify(x.traveler_id, 'traveler', x.id, format('You didn''t answer in time, so the request for %s closed.', x.item_name));
  end loop;

  -- 2. Reminder 24 hours before the first answer is due.
  for x in update requests r set answer_reminded = true
           where r.kind = 'trip' and r.status = 'open' and not r.answer_reminded and r.answer_due_at - now() <= interval '24 hours'
             and not exists (select 1 from offers o where o.request_id = r.id)
           returning r.id, r.receiver_id, r.traveler_id, r.item_name, r.answer_due_at loop
    perform notify(x.traveler_id, 'traveler', x.id, format('Reminder: %s h left to answer %s about %s', hours_left(x.answer_due_at), receiver_name(x.receiver_id), x.item_name));
  end loop;

  -- 3. Pricing turns that ran out. A trip request has only this offer, so it ends too.
  for x in update offers o set status = 'expired'
           from requests r where r.id = o.request_id and o.status = 'pending' and o.due_at < now()
           returning o.id, o.traveler_id, r.id as rid, r.kind, r.receiver_id, r.item_name loop
    perform log_offer(x.id, null, 'expire', null);
    if x.kind = 'trip' then update requests set status = 'expired', updated_at = now() where id = x.rid and status = 'open'; end if;
    perform notify(x.receiver_id, 'receiver', x.rid, format('Time ran out on %s''s offer for %s, so it closed in time.', traveler_name(x.traveler_id), x.item_name));
    perform notify(x.traveler_id, 'traveler', x.rid, format('Time ran out on your offer for %s, so it closed in time.', x.item_name));
  end loop;

  -- 4. Reminder 4 hours before a pricing turn ends, to whoever's turn it is.
  for x in update offers o set reminded = true
           from requests r where r.id = o.request_id and o.status = 'pending' and not o.reminded and o.due_at - now() <= interval '4 hours'
           returning o.turn, o.traveler_id, o.due_at, r.id as rid, r.receiver_id, r.item_name loop
    if x.turn = 'receiver' then
      perform notify(x.receiver_id, 'receiver', x.rid, format('Reminder: %s h left to answer %s about %s', hours_left(x.due_at), traveler_name(x.traveler_id), x.item_name));
    else
      perform notify(x.traveler_id, 'traveler', x.rid, format('Reminder: %s h left to answer %s about %s', hours_left(x.due_at), receiver_name(x.receiver_id), x.item_name));
    end if;
  end loop;

  -- 5. Open requests past their needed-by date.
  for x in update requests r set status = 'expired', updated_at = now()
           where r.kind = 'open' and r.status = 'open' and r.needed_by < addis_today()
           returning r.id, r.receiver_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('Your request for %s reached its needed-by date and closed.', x.item_name));
    perform log_offer(o.id, null, 'close', null) from offers o where o.request_id = x.id and o.status = 'pending';
    perform notify(o.traveler_id, 'traveler', x.id, format('The request for %s closed.', x.item_name)) from offers o where o.request_id = x.id and o.status = 'pending';
    update offers set status = 'closed' where request_id = x.id and status = 'pending';
  end loop;

  -- 6. Orders not paid in time (a waiting screenshot stops the clock).
  for x in update requests r set status = 'cancelled', updated_at = now()
           where r.status = 'awaiting_payment' and r.payment_due_at < now() and not has_pending_escrow(r.id)
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('You didn''t pay for %s in time, so the order was cancelled.', x.item_name));
    perform notify(x.traveler_id, 'traveler', x.id, format('%s didn''t pay for %s in time, so the order was cancelled.', receiver_name(x.receiver_id), x.item_name));
  end loop;

  -- 7. Reminder 4 hours before payment is due.
  for x in update requests r set payment_reminded = true
           where r.status = 'awaiting_payment' and not r.payment_reminded and r.payment_due_at - now() <= interval '4 hours'
             and not has_pending_escrow(r.id)
           returning r.id, r.receiver_id, r.item_name, r.payment_due_at loop
    perform notify(x.receiver_id, 'receiver', x.id, format('Reminder: %s h left to pay for %s', hours_left(x.payment_due_at), x.item_name));
  end loop;

  -- 8. The receiver didn't check the item photo in time: it counts as looks right.
  for x in update requests r set photo_status = 'ok', updated_at = now()
           where r.status = 'purchased' and r.photo_status = 'pending' and r.photo_due_at < now() and r.hold is null
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.traveler_id, 'traveler', x.id, format('%s didn''t answer in time, so the photo of %s counts as right.', receiver_name(x.receiver_id), x.item_name));
  end loop;

  -- 9. Not marked bought by the buying deadline: an admin decides (the traveler may have bought without uploading).
  for x in update requests r set hold = 'not_bought', held_at = now(), updated_at = now()
           where r.status = 'paid' and r.hold is null and buy_due(r) < now()
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('%s hasn''t marked %s bought yet. Zakbis is looking into it.', traveler_name(x.traveler_id), x.item_name));
    perform notify(x.traveler_id, 'traveler', x.id, format('You didn''t mark %s bought in time. Zakbis will contact you.', x.item_name));
  end loop;

  -- 10. "Not right" and no swap by the buying deadline: cancelled and refunded.
  for rq in select * from requests q where q.status = 'purchased' and q.photo_status = 'rejected' and q.hold is null and buy_due(q) < now() for update loop
    perform decide_refund(rq, format('%s didn''t swap %s in time, so the order is cancelled. We''ll refund you %s.', traveler_name(rq.traveler_id), rq.item_name, etb_text(rq.total_etb)),
      format('You didn''t swap %s in time, so the order is cancelled.', rq.item_name));
  end loop;

  -- 11. The traveler never said they're in Addis, a week after the arrival date: cancelled and refunded.
  for rq in select q.* from requests q join trips t on t.id = q.trip_id
           where q.status = 'purchased' and q.hold is null and addis_today() > t.arrival_date + 7 for update of q loop
    perform decide_refund(rq, format('%s didn''t arrive with %s, so the order is cancelled. We''ll refund you %s.', traveler_name(rq.traveler_id), rq.item_name, etb_text(rq.total_etb)),
      format('You didn''t mark yourself in Addis within a week of landing, so the order for %s is cancelled.', rq.item_name));
  end loop;

  -- 12. A week after "I'm in Addis" with no handover: the traveler is paid if the receiver had their number, otherwise an admin decides.
  for rq in select * from requests q where q.status = 'landed' and q.hold is null and q.handover_due_at < now() for update loop
    if phone_of(rq.receiver_id) is not null then
      update requests set status = 'delivered', delivered_by_timeout = true, updated_at = now() where id = rq.id;
      perform notify(rq.traveler_id, 'traveler', rq.id, format('%s didn''t meet you within a week. We''ll send you %s for %s.', receiver_name(rq.receiver_id), etb_text(rq.payout_etb), rq.item_name));
      perform notify(rq.receiver_id, 'receiver', rq.id, format('You didn''t meet %s within a week, so the order for %s is closed.', traveler_name(rq.traveler_id), rq.item_name));
    else
      update requests set hold = 'no_receiver_phone', held_at = now(), updated_at = now() where id = rq.id;
      perform notify(rq.traveler_id, 'traveler', rq.id, format('%s never confirmed their number. Zakbis will look into %s.', receiver_name(rq.receiver_id), rq.item_name));
    end if;
  end loop;

  -- 13. Reminders: the last day to buy (traveler), and the arrival day (receiver).
  for x in update requests r set buy_reminded = true from trips t
           where t.id = r.trip_id and r.status = 'paid' and r.hold is null and not r.buy_reminded and addis_today() = t.shop_by
           returning r.id, r.traveler_id, r.item_name loop
    perform notify(x.traveler_id, 'traveler', x.id, format('Today is the last day to buy %s.', x.item_name));
  end loop;
  for x in update requests r set arrival_reminded = true from trips t
           where t.id = r.trip_id and r.status = 'purchased' and r.hold is null and not r.arrival_reminded and addis_today() >= t.arrival_date
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('%s is due in Addis today. We''ll tell you when they''re here.', traveler_name(x.traveler_id)));
  end loop;

  -- 14. Handover reminders to the receiver on days 3 and 6 of the week.
  for x in update requests r set handover_reminders = handover_reminders + 1
           where r.status = 'landed' and r.hold is null
             and ((r.handover_reminders < 1 and now() > r.landed_at + interval '3 days') or (r.handover_reminders < 2 and now() > r.landed_at + interval '6 days'))
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    if phone_of(x.receiver_id) is not null then
      perform notify(x.receiver_id, 'receiver', x.id, format('%s is waiting to hand over %s. Call them on %s.', traveler_name(x.traveler_id), x.item_name, display_phone(phone_of(x.traveler_id))));
    else
      perform notify(x.receiver_id, 'receiver', x.id, format('%s is waiting to hand over %s. Confirm your phone number to meet them.', traveler_name(x.traveler_id), x.item_name));
    end if;
  end loop;
end $$;

-- Orders lists ------------------------------------------------------------------------

-- Same as 0009's, with a stage for every step after payment.
create or replace function my_orders(p_side text) returns table (
  id uuid, kind request_kind, item_name text, quantity int, status request_status, total_etb int, item_etb int,
  created_at timestamptz, stage text, due_at timestamptz, counterpart text, offers int, my_offer uuid
) language sql stable security definer set search_path = public as $$
  select m.id, m.kind, m.item_name, m.quantity, m.status, m.total_etb, m.item_etb, m.created_at, s.stage,
    case when s.stage in ('answer', 'waiting') and m.status = 'open' then coalesce(o.due_at, m.answer_due_at)
         when m.status = 'awaiting_payment' then m.payment_due_at
         when s.stage in ('buy', 'swap') then buy_due(m)
         when s.stage = 'check_item' then m.photo_due_at end,
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
    when m.hold is not null then 'on_hold'
    when m.status = 'paid' then case when p_side = 'traveler' then 'buy' else 'paid' end
    when m.status = 'purchased' and m.photo_status = 'pending' then case when p_side = 'receiver' then 'check_item' else 'bought' end
    when m.status = 'purchased' and m.photo_status = 'rejected' then case when p_side = 'traveler' then 'swap' else 'bought' end
    when m.status = 'purchased' then 'bought'
    when m.status = 'landed' then 'in_addis'
    when m.status in ('delivered', 'paid_out') then m.status::text
    when m.status = 'cancelled' and p_side = 'receiver' and m.refund_decided_at is not null
         and exists (select 1 from payments p where p.request_id = m.id and p.kind = 'escrow' and p.status = 'confirmed') then 'refunding'
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
