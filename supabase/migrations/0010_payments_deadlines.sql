-- Save for real, part 2: manual payments checked by an admin, server-run deadlines and reminders, the Telegram outbox.
-- The cron job and HTTP calls live in supabase/live/telegram_cron.sql (run once on the live database). Apply inside begin;/commit;.

-- Payments ---------------------------------------------------------------------------

alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check check (status in ('pending', 'confirmed', 'rejected', 'refunded'));
alter table payments
  add column method text check (method in ('telebirr', 'bank')),
  add column reject_reason text,
  add column decided_at timestamptz,
  add column decided_by uuid references profiles,
  add constraint payments_escrow_method check (kind <> 'escrow' or method is not null);

-- Screenshots go through submit_payment only (no phone check yet: that comes with the handover piece).
drop policy "receiver uploads escrow proof" on payments;

create function submit_payment(p_request uuid, p_method text, p_proof text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r requests;
  new_id uuid;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can pay'; end if;
  if r.status <> 'awaiting_payment' then raise exception 'this order is not waiting for payment'; end if;
  if has_pending_escrow(r.id) then raise exception 'we already have your screenshot; we''re checking it'; end if;
  if r.payment_due_at < now() then raise exception 'time is up'; end if;
  if not exists (select 1 from trips where id = r.trip_id and status = 'live') then raise exception 'this trip is no longer open'; end if;
  if p_method is null or p_method not in ('telebirr', 'bank') then raise exception 'choose Telebirr or bank'; end if;
  if p_proof is null or split_part(p_proof, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects where bucket_id = 'proofs' and name = p_proof) then
    raise exception 'upload your payment screenshot';
  end if;
  insert into payments (request_id, kind, amount_etb, proof_path, method) values (r.id, 'escrow', r.total_etb, p_proof, p_method)
    returning id into new_id;
  update requests set payment_left = payment_due_at - now() where id = r.id;
  perform notify(r.traveler_id, 'traveler', r.id, format('%s sent payment for %s. We''re checking it.', receiver_name(r.receiver_id), r.item_name));
  return new_id;
end $$;

-- A re-upload is a new row, so deciding by id only ever acts on the screenshot the admin saw.
create function pending_payment_for_update(p_payment uuid) returns payments language plpgsql security definer set search_path = public as $$
declare
  p payments;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select * into p from payments where id = p_payment;
  if not found then raise exception 'this payment is not waiting for a check'; end if;
  perform 1 from requests where id = p.request_id for update;
  select * into p from payments where id = p_payment;
  -- The order itself must still be waiting: an admin may have cancelled it while the screenshot sat in the queue.
  if p.status <> 'pending' or p.kind <> 'escrow' or (select status from requests where id = p.request_id) <> 'awaiting_payment' then
    raise exception 'this payment is not waiting for a check';
  end if;
  return p;
end $$;

create function decide_payment(p_payment uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  p payments := pending_payment_for_update(p_payment);
  r requests;
begin
  select * into r from requests where id = p.request_id;
  if p_approve then
    if not exists (select 1 from trips where id = r.trip_id and status = 'live') then raise exception 'the trip changed: refund instead'; end if;
    update payments set status = 'confirmed', decided_at = now(), decided_by = auth.uid() where id = p.id;
    update requests set status = 'paid', updated_at = now() where id = r.id;
    perform notify(r.receiver_id, 'receiver', r.id, format('Your payment for %s is confirmed. %s will go shopping.', r.item_name, traveler_name(r.traveler_id)));
    perform notify(r.traveler_id, 'traveler', r.id, format('%s paid for %s. Go shopping!', receiver_name(r.receiver_id), r.item_name));
  else
    if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required to reject'; end if;
    -- A re-upload would be for a trip that's gone.
    if not exists (select 1 from trips where id = r.trip_id and status = 'live') then raise exception 'the trip changed: refund instead'; end if;
    update payments set status = 'rejected', reject_reason = trim(p_reason), decided_at = now(), decided_by = auth.uid() where id = p.id;
    -- The receiver gets back the time that was left when they uploaded, but never less than 2 hours.
    update requests set payment_due_at = now() + greatest(coalesce(payment_left, interval '0'), interval '2 hours'),
      payment_reminded = greatest(coalesce(payment_left, interval '0'), interval '2 hours') <= interval '4 hours'
      where id = r.id;
    perform notify(r.receiver_id, 'receiver', r.id,
      format('We couldn''t confirm your payment for %s: %s. Please upload it again.', r.item_name, trim(p_reason)));
  end if;
end $$;

-- The money arrived but the trip changed: the admin sends it back by hand, then marks it here.
create function mark_refunded(p_payment uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  p payments := pending_payment_for_update(p_payment);
  r requests;
begin
  select * into r from requests where id = p.request_id;
  if exists (select 1 from trips where id = r.trip_id and status = 'live') then raise exception 'the trip is live: confirm or reject instead'; end if;
  update payments set status = 'refunded', decided_at = now(), decided_by = auth.uid() where id = p.id;
  update requests set status = 'cancelled', updated_at = now() where id = r.id;
  perform notify(r.receiver_id, 'receiver', r.id, format('%s''s trip changed, so we refunded your payment for %s.', traveler_name(r.traveler_id), r.item_name));
  perform notify(r.traveler_id, 'traveler', r.id, format('The order for %s was cancelled because your trip changed.', r.item_name));
end $$;

create function payments_to_check() returns table (
  id uuid, request_id uuid, item_name text, quantity int, amount_etb int, method text, proof_path text, created_at timestamptz,
  receiver_name text, traveler_name text, trip_changed boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  return query
    select p.id, r.id, r.item_name, r.quantity, p.amount_etb, p.method, p.proof_path, p.created_at,
           receiver_name(r.receiver_id), traveler_name(r.traveler_id),
           not exists (select 1 from trips t where t.id = r.trip_id and t.status = 'live')
    from payments p join requests r on r.id = p.request_id
    where p.kind = 'escrow' and p.status = 'pending' order by p.created_at;
end $$;

-- The admin "paid" shortcut is gone: decide_payment replaces it.
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

-- Deadlines (run every minute by pg_cron; see supabase/live/telegram_cron.sql) ------------------

create function hours_left(due timestamptz) returns int language sql stable as $$
  select greatest(1, ceil(extract(epoch from due - now()) / 3600))::int
$$;

create function run_deadlines() returns void language plpgsql security definer set search_path = public as $$
declare
  x record;
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
end $$;

-- Telegram outbox: notes for users with a Telegram link, unsent and under a day old (the chat id is their Telegram id).
create function telegram_outbox(p_limit int default 50) returns table (note_id uuid, chat_id bigint, text text)
language sql stable security definer set search_path = public as $$
  select n.id, l.telegram_id, n.body || coalesce(E'\n' || 'https://app.zakbis.com/orders/requests/' || n.request_id, '')
  from notes n join telegram_links l on l.user_id = n.user_id
  where n.telegram_sent_at is null and n.created_at > now() - interval '1 day'
  order by n.created_at limit p_limit
$$;

create function mark_telegram_sent(p_ids uuid[]) returns void language sql security definer set search_path = public as $$
  update notes set telegram_sent_at = now() where id = any (p_ids)
$$;

revoke execute on function run_deadlines(), telegram_outbox(int), mark_telegram_sent(uuid[]), pending_payment_for_update(uuid)
  from public, anon, authenticated;

-- Exchange rates until there's an admin screen (edit them in the Supabase table editor).
insert into fx_rates (currency, etb_per_unit) values ('USD', 141.4), ('GBP', 180), ('CNY', 19.9), ('AED', 38.5)
  on conflict (currency) do nothing;
