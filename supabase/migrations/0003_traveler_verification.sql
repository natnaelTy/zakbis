-- Traveler verification: passport + selfie reviewed by an admin. Only verified travelers get listed trips,
-- make offers, or accept new trip requests; deals already underway carry on.
-- Spec: docs/superpowers/specs/2026-10-25-traveler-verification-design.md

create table traveler_verifications (
  user_id uuid primary key references profiles on delete cascade,
  legal_name text not null check (length(trim(legal_name)) between 2 and 100),
  nationality text not null check (nationality ~ '^[A-Z]{2}$'),
  passport_expiry date not null,
  passport_path text not null,
  selfie_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references profiles
);

-- The one definition of "verified", used by every check below and by the public badge.
create function is_verified_traveler(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join traveler_verifications v on v.user_id = p.id
    where p.id = uid and p.verified and v.status = 'approved' and v.passport_expiry >= addis_today()
  )
$$;

-- Any write by the owner is a (re)submission: back to pending and unverified until an admin decides.
create function traveler_verifications_submit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('zakbis.deciding', true) = 'on' then return new; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'not your verification'; end if;
  if split_part(new.passport_path, '/', 1) <> new.user_id::text or split_part(new.selfie_path, '/', 1) <> new.user_id::text then
    raise exception 'documents must be your own uploads';
  end if;
  if new.passport_expiry < addis_today() then raise exception 'this passport has expired'; end if;
  new.status := 'pending';
  new.rejection_reason := null;
  new.decided_at := null;
  new.decided_by := null;
  new.submitted_at := now();
  update profiles set verified = false where id = new.user_id;
  return new;
end $$;
create trigger traveler_verifications_submit before insert or update on traveler_verifications
  for each row execute function traveler_verifications_submit();

create function decide_verification(p_user uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required to reject'; end if;
  perform set_config('zakbis.deciding', 'on', true);
  update traveler_verifications
    set status = case when p_approve then 'approved' else 'rejected' end,
        rejection_reason = case when p_approve then null else p_reason end,
        decided_at = now(), decided_by = auth.uid()
    where user_id = p_user;
  if not found then raise exception 'no verification for this user'; end if;
  update profiles set verified = p_approve where id = p_user;
  perform set_config('zakbis.deciding', 'off', true);
end $$;

alter table traveler_verifications enable row level security;
create policy "own verification read" on traveler_verifications for select to authenticated using (user_id = auth.uid() or is_admin());
create policy "own verification submit" on traveler_verifications for insert to authenticated with check (user_id = auth.uid());
-- Owner may resubmit unless approved with a still-valid passport.
create policy "own verification resubmit" on traveler_verifications for update to authenticated
  using (user_id = auth.uid() and (status <> 'approved' or passport_expiry < addis_today()))
  with check (user_id = auth.uid());

-- Trips: listed only for verified travelers; owners, admins and receivers of a request on the trip always see it.
drop policy "listed trips" on trips;
create policy "listed trips" on trips for select to anon, authenticated using (
  (shop_by >= addis_today() and is_verified_traveler(traveler_id))
  or traveler_id = auth.uid() or is_admin()
  or exists (select 1 from requests r where r.trip_id = trips.id and r.receiver_id = auth.uid())
);

create or replace function requests_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.receiver_id := auth.uid();
  if new.receiver_id is null then raise exception 'login required'; end if;
  new.status := 'open';
  new.receipt_path := null;
  new.accepted_at := null;
  new.purchased_at := null;
  new.landed_at := null;
  select etb_per_unit into new.fx_rate from fx_rates where currency = new.currency;
  if not found then raise exception 'no fx rate for %', new.currency; end if;

  if new.kind = 'trip' then
    select traveler_id into new.traveler_id from trips where id = new.trip_id and shop_by >= addis_today();
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
      if not exists (select 1 from trips where id = r.trip_id and shop_by >= addis_today()) then
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
  select * into t from trips where id = p_trip and traveler_id = uid;
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
  -- Re-check the match: the trip may have been edited or its shopping window may have passed since the offer.
  if not exists (
    select 1 from trips t where t.id = o.trip_id and t.origin_country = any (r.countries)
      and t.arrival_date <= r.needed_by and t.shop_by >= addis_today() and r.needed_by >= addis_today()
  ) then
    raise exception 'this offer is no longer valid for the trip';
  end if;
  update requests set traveler_id = o.traveler_id, trip_id = o.trip_id, reward_etb = o.reward_etb,
    status = 'awaiting_payment', accepted_at = now(), updated_at = now() where id = r.id;
  update offers set status = case when id = p_offer then 'accepted' else 'rejected' end
    where request_id = r.id and status = 'pending';
end $$;

create or replace view traveler_stats as
  select p.id as traveler_id,
    (select round(avg(v.rating), 1)::numeric(2,1) from reviews v join requests r on r.id = v.request_id
      where v.subject_id = p.id and v.author_id = r.receiver_id) as rating,
    (select count(*) from reviews v join requests r on r.id = v.request_id
      where v.subject_id = p.id and v.author_id = r.receiver_id) as review_count,
    (select count(*) from requests r where r.traveler_id = p.id and r.status in ('delivered', 'paid_out')) as deliveries,
    is_verified_traveler(p.id) as verified
  from profiles p;

-- Identity documents: private, images only, 8 MB; owner uploads to own folder; owner and admins read; nobody deletes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('identity', 'identity', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']);
create policy "identity upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'identity' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "identity read" on storage.objects for select to authenticated
  using (bucket_id = 'identity' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
