-- Flight changes on paid orders: the traveler asks, an admin approves or rejects; receivers keep the order or take a full
-- refund; a cancelled flight refunds every paid order. Flight-change refunds never open reviews.
-- Spec: docs/superpowers/specs/2026-10-31-flight-changes-design.md. Apply inside begin;/commit;.

create table flight_changes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips on delete cascade,
  kind text not null check (kind in ('moved', 'cancelled')),
  new_shop_by date,
  new_arrival date,
  proof_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles
);
create unique index flight_changes_one_pending on flight_changes (trip_id) where status = 'pending';
alter table flight_changes enable row level security;
create policy "own or admin flight changes" on flight_changes for select to authenticated using (
  is_admin() or exists (select 1 from trips t where t.id = trip_id and t.traveler_id = auth.uid())
);

alter table requests
  add column flight_moved_at timestamptz,   -- an admin approved new dates; the receiver may keep the order or cancel
  add column flight_kept_at timestamptz,
  add column no_review boolean not null default false;

create or replace function requests_review_window() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review_open_at is null and new.traveler_id is not null and not new.no_review -- flight-change refunds aren't the traveler's fault
     and ((new.status = 'delivered' and old.status is distinct from 'delivered') or (old.refund_decided_at is null and new.refund_decided_at is not null)) then
    new.review_open_at := now();
    perform notify(new.receiver_id, 'receiver', new.id, format('How was %s? Leave a review for %s.', traveler_name(new.traveler_id), new.item_name));
    perform notify(new.traveler_id, 'traveler', new.id, format('How was %s? Leave a review for %s.', receiver_name(new.receiver_id), new.item_name));
  end if;
  return new;
end $$;

-- Like decide_refund, but marked so the review window stays shut.
create function flight_refund(r requests, p_receiver_note text, p_traveler_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update requests set status = 'cancelled', refund_decided_at = now(), hold = null, no_review = true, updated_at = now() where id = r.id;
  perform notify(r.receiver_id, 'receiver', r.id, p_receiver_note);
  perform notify(r.traveler_id, 'traveler', r.id, p_traveler_note);
end $$;

create function trip_change_state(p_trip uuid) returns table (paid_orders int, pending_change text)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from requests where trip_id = t.id and status in ('paid', 'purchased')),
         (select kind from flight_changes where trip_id = t.id and status = 'pending')
  from trips t where t.id = p_trip and (t.traveler_id = auth.uid() or is_admin())
$$;

create function request_flight_change(p_trip uuid, p_kind text, p_shop_by date default null, p_arrival date default null, p_proof text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t trips;
  new_id uuid;
begin
  select * into t from trips where id = p_trip for update;
  if not found or t.traveler_id is distinct from uid then raise exception 'only the traveler can do that'; end if;
  if t.status <> 'live' then raise exception 'this trip is no longer live'; end if;
  if exists (select 1 from requests where trip_id = t.id and status = 'landed') then
    raise exception 'someone is already meeting you in Addis. Contact support';
  end if;
  if not exists (select 1 from requests where trip_id = t.id and status in ('paid', 'purchased')) then
    raise exception 'this trip has no paid orders: change the trip directly';
  end if;
  if exists (select 1 from flight_changes where trip_id = t.id and status = 'pending') then
    raise exception 'Zakbis is already checking a change for this trip';
  end if;
  if p_kind is null or p_kind not in ('moved', 'cancelled') then raise exception 'choose moved or cancelled'; end if;
  if p_proof is not null and (split_part(p_proof, '/', 1) <> uid::text
     or not exists (select 1 from storage.objects where bucket_id = 'tickets' and name = p_proof)) then
    raise exception 'upload your new ticket';
  end if;
  if p_kind = 'moved' then
    if p_shop_by is null or p_arrival is null or p_shop_by < addis_today() or p_arrival < p_shop_by then raise exception 'check the dates'; end if;
    if p_proof is null then raise exception 'upload your new ticket'; end if;
    if (select passport_expiry from traveler_verifications where user_id = uid) < p_arrival then
      raise exception 'your passport must be valid until you land';
    end if;
  end if;
  insert into flight_changes (trip_id, kind, new_shop_by, new_arrival, proof_path)
    values (t.id, p_kind, case when p_kind = 'moved' then p_shop_by end, case when p_kind = 'moved' then p_arrival end, p_proof)
    returning id into new_id;
  perform notify_admins(format('Flight change to check: %s (%s).', traveler_name(uid), p_kind));
  return new_id;
end $$;

create function decide_flight_change(p_change uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  c flight_changes;
  t trips;
  rq requests;
  x record;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into c from flight_changes where id = p_change for update;
  if not found or c.status <> 'pending' then raise exception 'this change was already decided'; end if;
  select * into t from trips where id = c.trip_id for update;
  if not p_approve then
    if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required to reject'; end if;
    update flight_changes set status = 'rejected', reason = trim(p_reason), decided_at = now(), decided_by = auth.uid() where id = c.id;
    perform notify(t.traveler_id, 'traveler', null, format('Zakbis couldn''t approve your flight change: %s', trim(p_reason)));
    return;
  end if;
  if t.status <> 'live' then raise exception 'this trip is no longer live'; end if;
  if c.kind = 'moved' then
    perform set_config('zakbis.deciding', 'on', true);
    update trips set shop_by = c.new_shop_by, arrival_date = c.new_arrival, proof_path = c.proof_path where id = t.id;
    perform set_config('zakbis.deciding', 'off', true);
    -- Deadlines that read the trip (buying, In Addis, no-show) follow it; an earlier buying extension no longer applies.
    for x in update requests r set buy_due_at = null, flight_moved_at = now(), flight_kept_at = null, updated_at = now()
             where r.trip_id = t.id and (r.status in ('paid', 'purchased') or (r.status = 'awaiting_payment' and has_pending_escrow(r.id)))
             returning r.id, r.receiver_id, r.item_name loop
      perform notify(x.receiver_id, 'receiver', x.id, format('%s''s flight moved. Your %s now arrives around %s. Keep the order or cancel for a full refund.',
        traveler_name(t.traveler_id), x.item_name, to_char(c.new_arrival, 'FMDD Mon')));
    end loop;
    perform notify(t.traveler_id, 'traveler', null, 'Zakbis approved your new dates.');
  else
    -- Paid and bought orders: refunded, no reviews. Screenshots still waiting: the admin checks the money on Payment checks first.
    for rq in select * from requests q where q.trip_id = t.id and q.status in ('paid', 'purchased') for update loop
      perform flight_refund(rq, format('%s''s flight was cancelled. We''ll refund you %s.', traveler_name(t.traveler_id), etb_text(rq.total_etb)),
        format('The order for %s is cancelled. Return the item to the shop if you can.', rq.item_name));
    end loop;
    for x in select q.id, q.receiver_id from requests q where q.trip_id = t.id and q.status = 'awaiting_payment' and has_pending_escrow(q.id) loop
      perform notify(x.receiver_id, 'receiver', x.id, format('%s''s flight was cancelled. We''ll refund you once we''ve checked your payment.', traveler_name(t.traveler_id)));
    end loop;
    perform set_config('zakbis.deciding', 'on', true);
    update trips set status = 'cancelled' where id = t.id; -- trips_after_change closes unpaid requests and offers
    perform set_config('zakbis.deciding', 'off', true);
    perform notify(t.traveler_id, 'traveler', null, 'Zakbis cancelled your trip and is refunding your receivers.');
  end if;
  update flight_changes set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = c.id;
end $$;

create function keep_after_move(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can do that'; end if;
  if r.flight_moved_at is null or r.status not in ('paid', 'purchased') then raise exception 'this order is no longer valid for that'; end if;
  update requests set flight_kept_at = now() where id = r.id;
end $$;

create function cancel_after_move(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can do that'; end if;
  if r.flight_moved_at is null or r.status not in ('paid', 'purchased') then raise exception 'this order is no longer valid for that'; end if;
  perform flight_refund(r, format('You cancelled %s. We''ll refund you %s.', r.item_name, etb_text(r.total_etb)),
    format('%s cancelled %s after your flight moved. Return the item to the shop if you can.', receiver_name(r.receiver_id), r.item_name));
end $$;

create function flight_changes_to_check() returns table (
  id uuid, trip_id uuid, kind text, traveler_name text, origin_city text, old_shop_by date, old_arrival date,
  new_shop_by date, new_arrival date, proof_path text, paid_orders int, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  return query
    select c.id, t.id, c.kind, traveler_name(t.traveler_id), t.origin_city, t.shop_by, t.arrival_date, c.new_shop_by, c.new_arrival,
           c.proof_path, (select count(*)::int from requests r where r.trip_id = t.id and r.status in ('paid', 'purchased')), c.created_at
    from flight_changes c join trips t on t.id = c.trip_id where c.status = 'pending' order by c.created_at;
end $$;

revoke execute on function flight_refund(requests, text, text) from public, anon, authenticated;

-- Deadlines: while a flight change waits for an admin, the steps that would blame the traveler (9-11) hold off. --------

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
           where r.status = 'paid' and r.hold is null and buy_due(r) < now() and not exists (select 1 from flight_changes f where f.trip_id = r.trip_id and f.status = 'pending')
           returning r.id, r.receiver_id, r.traveler_id, r.item_name loop
    perform notify(x.receiver_id, 'receiver', x.id, format('%s hasn''t marked %s bought yet. Zakbis is looking into it.', traveler_name(x.traveler_id), x.item_name));
    perform notify(x.traveler_id, 'traveler', x.id, format('You didn''t mark %s bought in time. Zakbis will contact you.', x.item_name));
  end loop;

  -- 10. "Not right" and no swap by the buying deadline: cancelled and refunded.
  for rq in select * from requests q where q.status = 'purchased' and q.photo_status = 'rejected' and q.hold is null and buy_due(q) < now() and not exists (select 1 from flight_changes f where f.trip_id = q.trip_id and f.status = 'pending') for update loop
    perform decide_refund(rq, format('%s didn''t swap %s in time, so the order is cancelled. We''ll refund you %s.', traveler_name(rq.traveler_id), rq.item_name, etb_text(rq.total_etb)),
      format('You didn''t swap %s in time, so the order is cancelled.', rq.item_name));
  end loop;

  -- 11. The traveler never said they're in Addis, a week after the arrival date: cancelled and refunded.
  for rq in select q.* from requests q join trips t on t.id = q.trip_id
           where q.status = 'purchased' and q.hold is null and addis_today() > t.arrival_date + 7 and not exists (select 1 from flight_changes f where f.trip_id = q.trip_id and f.status = 'pending') for update of q loop
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

  -- 15. Reviews still hidden when the 14-day window closes: show them anyway, and check the people reviewed.
  for x in update reviews v set visible_at = clock_timestamp() from requests q
           where q.id = v.request_id and v.visible_at is null and q.review_open_at + interval '14 days' < now()
           returning v.subject_id, v.side loop
    perform check_flags(x.subject_id, x.side);
  end loop;

  -- 16. A week into the window: remind whoever hasn't reviewed yet.
  for x in update requests q set review_reminded = true
           where q.review_open_at is not null and not q.review_reminded
             and now() > q.review_open_at + interval '7 days' and now() < q.review_open_at + interval '14 days'
           returning q.id, q.receiver_id, q.traveler_id, q.item_name loop
    if not exists (select 1 from reviews where request_id = x.id and author_id = x.receiver_id) then
      perform notify(x.receiver_id, 'receiver', x.id, format('A week left to review %s for %s.', traveler_name(x.traveler_id), x.item_name));
    end if;
    if not exists (select 1 from reviews where request_id = x.id and author_id = x.traveler_id) then
      perform notify(x.traveler_id, 'traveler', x.id, format('A week left to review %s for %s.', receiver_name(x.receiver_id), x.item_name));
    end if;
  end loop;
end $$;
