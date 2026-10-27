-- Post a trip: every trip carries a ticket (or crew roster) and an admin checks it before anyone else can see it.
-- AI ticket reading comes later; for now decide_trip is the only way a trip goes live.

create type trip_status as enum ('checking', 'live', 'needs_fix', 'cancelled');
create type proof_kind as enum ('ticket', 'roster');

alter table trips
  add column status trip_status not null default 'checking',
  add column proof_kind proof_kind not null default 'ticket',
  add column proof_path text,
  add column rejection_reason text,
  add column decided_at timestamptz,
  add column decided_by uuid references profiles,
  add column customs_agreed_at timestamptz,
  add column submitted_at timestamptz; -- when it last went to checking; decide_trip approves only that version

-- Others read only the trip card; proof, crew flag, reason and decision stay with the owner and admins (my_trips, trips_to_check).
revoke all on trips from anon, authenticated;
grant select (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, note, created_at, status)
  on trips to anon, authenticated;
grant insert (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, note, proof_kind, proof_path, customs_agreed_at)
  on trips to authenticated;
grant update (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, note, proof_kind, proof_path, customs_agreed_at, status)
  on trips to authenticated;

-- No delete: cancelling is the only way out.
drop policy "own trips" on trips;
create policy "own trip insert" on trips for insert to authenticated with check (traveler_id = auth.uid());
create policy "own trip update" on trips for update to authenticated using (traveler_id = auth.uid()) with check (traveler_id = auth.uid());

drop policy "listed trips" on trips;
create policy "listed trips" on trips for select to anon, authenticated using (
  (status = 'live' and shop_by >= addis_today() and is_verified_traveler(traveler_id))
  or traveler_id = auth.uid() or is_admin()
  or exists (select 1 from requests r where r.trip_id = trips.id and r.receiver_id = auth.uid())
);

-- Owner writes are (re)submissions unless they only touch kg, note or cancel. Only decide_trip sets live/needs_fix.
create function trips_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return new; end if; -- server-side code
  if current_setting('zakbis.deciding', true) = 'on' and is_admin() then return new; end if;

  if tg_op = 'UPDATE' then
    if old.status = 'cancelled' then raise exception 'cancelled trips are final'; end if;
    new.traveler_id := old.traveler_id;
    new.rejection_reason := old.rejection_reason;
    new.decided_at := old.decided_at;
    new.decided_by := old.decided_by;
    new.created_at := old.created_at;
    new.submitted_at := old.submitted_at;
    if new.status = 'cancelled' then
      new := old;
      new.status := 'cancelled';
      return new;
    end if;
    new.customs_agreed_at := old.customs_agreed_at;
    if (new.origin_country, new.origin_city, new.origin_airport, new.shop_by, new.arrival_date, new.proof_kind, new.proof_path)
       is not distinct from (old.origin_country, old.origin_city, old.origin_airport, old.shop_by, old.arrival_date, old.proof_kind, old.proof_path)
       and old.status <> 'needs_fix' then
      new.status := old.status;
      return new;
    end if;
  else
    new.traveler_id := uid;
    if new.customs_agreed_at is null then raise exception 'agree to the customs rules'; end if;
    new.customs_agreed_at := now();
  end if;

  if not is_verified_traveler(uid) then raise exception 'verify before posting a trip'; end if;
  if (select passport_expiry from traveler_verifications where user_id = uid) < new.arrival_date then
    raise exception 'your passport must be valid until you land';
  end if;
  -- The proof must be a file this traveler actually uploaded to the tickets bucket.
  if new.proof_path is null or split_part(new.proof_path, '/', 1) <> uid::text
     or not exists (select 1 from storage.objects where bucket_id = 'tickets' and name = new.proof_path) then
    raise exception 'upload your ticket';
  end if;
  new.status := 'checking';
  new.submitted_at := clock_timestamp();
  new.rejection_reason := null;
  new.decided_at := null;
  new.decided_by := null;
  return new;
end $$;
create trigger trips_guard before insert or update on trips for each row execute function trips_guard();

-- p_submitted_at is the version the admin looked at: a resubmission since then (new ticket or dates) must be seen first.
create function decide_trip(p_trip uuid, p_submitted_at timestamptz, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required to reject'; end if;
  perform set_config('zakbis.deciding', 'on', true);
  -- One statement, so a cancel that lands mid-decision can't be overwritten.
  update trips
    set status = case when p_approve then 'live'::trip_status else 'needs_fix'::trip_status end,
        rejection_reason = case when p_approve then null else trim(p_reason) end,
        decided_at = now(), decided_by = auth.uid()
    where id = p_trip and status = 'checking' and submitted_at = p_submitted_at;
  if not found then
    if exists (select 1 from trips where id = p_trip and status = 'checking') then raise exception 'this trip changed since you opened it'; end if;
    raise exception 'this trip is not waiting for a check';
  end if;
  perform set_config('zakbis.deciding', 'off', true);
end $$;

create function my_trips() returns setof trips language sql stable security definer set search_path = public as $$
  select * from trips where traveler_id = auth.uid() order by arrival_date desc
$$;

create function trips_to_check() returns table (
  id uuid, traveler_id uuid, origin_country country_code, origin_city text, origin_airport text, shop_by date,
  arrival_date date, free_kg numeric, note text, created_at timestamptz, submitted_at timestamptz, proof_kind proof_kind, proof_path text,
  legal_name text, given_name text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  return query
    select t.id, t.traveler_id, t.origin_country, t.origin_city, t.origin_airport, t.shop_by, t.arrival_date, t.free_kg,
           t.note, t.created_at, t.submitted_at, t.proof_kind, t.proof_path, v.legal_name, v.given_name
    from trips t left join traveler_verifications v on v.user_id = t.traveler_id
    where t.status = 'checking' order by t.submitted_at;
end $$;

-- Requests and offers only on live trips (each function as last defined, plus the status check).
create or replace function requests_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.receiver_id := auth.uid();
  if new.receiver_id is null then raise exception 'login required'; end if;
  if (select first_name from profiles where id = new.receiver_id) is null then raise exception 'set up your receiver side first'; end if;
  new.status := 'open';
  new.receipt_path := null;
  new.accepted_at := null;
  new.purchased_at := null;
  new.landed_at := null;
  select etb_per_unit into new.fx_rate from fx_rates where currency = new.currency;
  if not found then raise exception 'no fx rate for %', new.currency; end if;

  if new.kind = 'trip' then
    select traveler_id into new.traveler_id from trips where id = new.trip_id and shop_by >= addis_today() and status = 'live';
    if not found then raise exception 'trip is not available'; end if;
    if new.traveler_id = new.receiver_id then raise exception 'cannot request on your own trip'; end if;
    if not is_verified_traveler(new.traveler_id) then raise exception 'this traveler is not verified'; end if;
  else
    new.traveler_id := null;
    new.trip_id := null;
    new.reward_etb := null; -- travelers name the reward in their offers
    if new.needed_by is null or new.needed_by not between addis_today() + 3 and addis_today() + 60 then
      raise exception 'needed by must be 3 to 60 days ahead';
    end if;
  end if;
  return new;
end $$;

create or replace function make_offer(p_request uuid, p_trip uuid, p_reward int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r requests;
  t trips;
  new_id uuid;
begin
  if uid is null then raise exception 'login required'; end if;
  select * into r from requests where id = p_request;
  if not found or r.kind <> 'open' or r.status <> 'open' or r.needed_by < addis_today() then
    raise exception 'this request is not open for offers';
  end if;
  if r.receiver_id = uid then raise exception 'cannot offer on your own request'; end if;
  if not is_verified_traveler(uid) then raise exception 'only verified travelers can offer'; end if;
  select * into t from trips where id = p_trip and traveler_id = uid and status = 'live';
  if not found then raise exception 'trip not found'; end if;
  if not (t.origin_country = any (r.countries) and t.arrival_date <= r.needed_by and t.shop_by >= addis_today()) then
    raise exception 'your trip does not match this request';
  end if;
  if exists (select 1 from offers where request_id = p_request and traveler_id = uid and status in ('pending', 'accepted')) then
    raise exception 'you already have an offer on this request';
  end if;
  insert into offers (request_id, traveler_id, trip_id, reward_etb) values (p_request, uid, p_trip, p_reward) returning id into new_id;
  return new_id;
end $$;

create or replace function accept_offer(p_offer uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  o offers;
  r requests;
begin
  select * into o from offers where id = p_offer;
  if not found then raise exception 'offer not found'; end if;
  -- Lock the request so two accepts can't both win.
  select * into r from requests where id = o.request_id for update;
  if r.receiver_id is distinct from auth.uid() then raise exception 'only the receiver can accept'; end if;
  if r.status <> 'open' or o.status <> 'pending' then raise exception 'this offer can no longer be accepted'; end if;
  if not is_verified_traveler(o.traveler_id) then raise exception 'this traveler is not verified'; end if;
  -- Re-check the match: the trip may have been edited, re-checked or its shopping window may have passed since the offer.
  if not exists (
    select 1 from trips t where t.id = o.trip_id and t.status = 'live' and t.origin_country = any (r.countries)
      and t.arrival_date <= r.needed_by and t.shop_by >= addis_today() and r.needed_by >= addis_today()
  ) then
    raise exception 'this offer is no longer valid for the trip';
  end if;
  update requests set traveler_id = o.traveler_id, trip_id = o.trip_id, reward_etb = o.reward_etb,
    status = 'awaiting_payment', accepted_at = now(), updated_at = now() where id = r.id;
  update offers set status = case when id = p_offer then 'accepted' else 'rejected' end
    where request_id = r.id and status = 'pending';
end $$;

create or replace function advance_request(p_id uuid, p_to request_status, p_code text default null, p_receipt text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r requests;
begin
  if uid is null then raise exception 'login required'; end if;
  select * into r from requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;

  if p_to in ('awaiting_payment', 'declined') and r.kind = 'trip' and r.status = 'open' and uid = r.traveler_id then
    if p_to = 'awaiting_payment' then
      if not is_verified_traveler(uid) then raise exception 'this traveler is not verified'; end if;
      if not exists (select 1 from trips where id = r.trip_id and shop_by >= addis_today() and status = 'live') then
        raise exception 'this trip is no longer open';
      end if;
      update requests set accepted_at = now() where id = p_id;
    end if;
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
  elsif p_to = 'cancelled' and r.status not in ('delivered', 'paid_out', 'cancelled', 'declined')
    and (is_admin() or (uid = r.receiver_id and r.status in ('open', 'awaiting_payment') and not has_pending_escrow(p_id))) then
    null;
  else
    raise exception 'cannot move this request from % to %', r.status, p_to;
  end if;

  update requests set status = p_to, updated_at = now() where id = p_id;
end $$;

-- Tickets and rosters: private, 10 MB, PDF or image; owner uploads to own folder; owner and admins read; nobody deletes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('tickets', 'tickets', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
create policy "tickets upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "tickets read" on storage.objects for select to authenticated
  using (bucket_id = 'tickets' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
drop policy "manage own files" on storage.objects;
create policy "manage own files" on storage.objects for delete to authenticated
  using (bucket_id not in ('proofs', 'identity', 'tickets') and (storage.foldername(name))[1] = auth.uid()::text);
