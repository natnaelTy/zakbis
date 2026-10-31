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
    raise exception 'cancelled flights are handled below';
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
