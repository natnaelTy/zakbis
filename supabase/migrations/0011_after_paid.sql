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
