-- Zakbis "Buy Me": trips, trip/open requests, offers, escrow, two-step phone reveal, reviews.
-- Spec: docs/superpowers/specs/2026-10-21-database-design.md. Status changes only through functions.

create type country_code as enum ('US', 'GB', 'CN', 'AE');
create type request_kind as enum ('trip', 'open');
create type request_status as enum
  ('open', 'declined', 'awaiting_payment', 'paid', 'purchased', 'landed', 'delivered', 'paid_out', 'cancelled');

create function addis_today() returns date language sql stable as $$
  select (now() at time zone 'Africa/Addis_Ababa')::date
$$;

-- Profiles ------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 40),
  photo_blur_path text,
  photo_path text,
  verified boolean not null default false, -- set by admins; what earns it is still undecided
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- Confirmed phone from Supabase Auth. Never callable by users: it would expose anyone's number.
create function phone_of(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select phone from auth.users where id = uid and phone_confirmed_at is not null
$$;
revoke execute on function phone_of(uuid) from public, anon, authenticated;

-- Safe for policies: only answers about the caller.
create function my_phone_confirmed() returns boolean language sql stable security definer set search_path = public as $$
  select phone_of(auth.uid()) is not null
$$;

create table payout_accounts (
  user_id uuid primary key references profiles on delete cascade,
  method text not null check (method in ('telebirr', 'bank')),
  account_name text not null,
  account_number text not null,
  bank_name text,
  check (method <> 'bank' or bank_name is not null)
);

create table fx_rates (
  currency text primary key check (currency in ('USD', 'GBP', 'CNY', 'AED')),
  etb_per_unit numeric not null check (etb_per_unit > 0),
  updated_at timestamptz not null default now()
);

-- Trips ----------------------------------------------------------------------

create table trips (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null default auth.uid() references profiles on delete cascade,
  origin_country country_code not null,
  origin_city text not null,
  origin_airport text not null,
  shop_by date not null,
  arrival_date date not null check (arrival_date >= shop_by),
  free_kg numeric not null check (free_kg > 0),
  note text,
  created_at timestamptz not null default now()
);

-- Requests -------------------------------------------------------------------

create table requests (
  id uuid primary key default gen_random_uuid(),
  kind request_kind not null,
  receiver_id uuid not null references profiles,
  traveler_id uuid references profiles,
  trip_id uuid references trips,
  countries country_code[],
  needed_by date,
  item_name text not null check (length(trim(item_name)) > 0),
  item_url text,
  screenshot_path text,
  quantity int not null default 1 check (quantity between 1 and 10),
  notes text,
  unit_price numeric not null check (unit_price > 0),
  currency text not null check (currency in ('USD', 'GBP', 'CNY', 'AED')),
  fx_rate numeric not null,
  reward_etb int check (reward_etb >= 1),
  -- Whole birr; Zakbis keeps 9% of the reward only. Generated so the browser can never set money.
  item_etb int generated always as (round(unit_price * quantity * fx_rate)::int) stored,
  fee_etb int generated always as (round(reward_etb * 9 / 100.0)::int) stored,
  total_etb int generated always as (round(unit_price * quantity * fx_rate)::int + reward_etb) stored,
  payout_etb int generated always as (round(unit_price * quantity * fx_rate)::int + reward_etb - round(reward_etb * 9 / 100.0)::int) stored,
  status request_status not null default 'open',
  receipt_path text,
  accepted_at timestamptz,  -- reveals the traveler's real photo to the receiver
  purchased_at timestamptz, -- reveals the receiver's phone to the traveler
  landed_at timestamptz,    -- reveals the traveler's phone to the receiver
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (item_url is not null or screenshot_path is not null),
  check (
    (kind = 'trip' and trip_id is not null and reward_etb is not null and countries is null and needed_by is null)
    or (kind = 'open' and cardinality(countries) > 0 and needed_by is not null)
  )
);

create table handover_codes (
  request_id uuid primary key references requests on delete cascade,
  code text not null default lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0'),
  attempts int not null default 0 -- wrong guesses; delivery locks at 5 until an admin resets it
);

create function requests_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
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
create trigger requests_before_insert before insert on requests for each row execute function requests_before_insert();

create function requests_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into handover_codes (request_id) values (new.id);
  return new;
end $$;
create trigger requests_after_insert after insert on requests for each row execute function requests_after_insert();

-- Payments -------------------------------------------------------------------

create table payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests on delete cascade,
  kind text not null check (kind in ('escrow', 'payout', 'refund')),
  amount_etb int not null check (amount_etb > 0),
  proof_path text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  check (kind <> 'escrow' or proof_path is not null)
);

create function payments_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'escrow' then
    new.amount_etb := (select total_etb from requests where id = new.request_id);
    new.status := 'pending';
  end if;
  return new;
end $$;
create trigger payments_before_insert before insert on payments for each row execute function payments_before_insert();

create function has_pending_escrow(p_request uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from payments where request_id = p_request and kind = 'escrow' and status = 'pending')
$$;

-- Status changes --------------------------------------------------------------

create function advance_request(p_id uuid, p_to request_status, p_code text default null, p_receipt text default null)
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

-- Returns 'delivered', 'wrong_code' or 'locked' instead of raising, so a wrong guess is counted (a raise would roll the count back).
create function deliver(p_id uuid, p_code text) returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r requests;
  h handover_codes;
begin
  select * into r from requests where id = p_id for update;
  if not found or uid is null or uid is distinct from r.traveler_id or r.status <> 'landed' then
    raise exception 'cannot deliver this request';
  end if;
  if not exists (select 1 from payout_accounts where user_id = uid) then raise exception 'add a payout account first'; end if;
  select * into h from handover_codes where request_id = p_id for update;
  if h.attempts >= 5 then return 'locked'; end if;
  if p_code is distinct from h.code then
    update handover_codes set attempts = attempts + 1 where request_id = p_id;
    return 'wrong_code';
  end if;
  update requests set status = 'delivered', updated_at = now() where id = p_id;
  return 'delivered';
end $$;

-- Admins unlock a delivery after checking a dispute, without ever reading the code.
create function reset_handover_attempts(p_request uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  update handover_codes set attempts = 0 where request_id = p_request;
end $$;

-- Traveler sees the receiver's phone from purchase; receiver sees the traveler's from landing. Revealed stays revealed.
create function counterpart_phone(p_request uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() = r.traveler_id and r.purchased_at is not null then phone_of(r.receiver_id)
    when auth.uid() = r.receiver_id and r.landed_at is not null then phone_of(r.traveler_id)
  end
  from requests r where r.id = p_request
$$;

-- Access ---------------------------------------------------------------------

alter table profiles enable row level security;
alter table payout_accounts enable row level security;
alter table fx_rates enable row level security;
alter table trips enable row level security;
alter table requests enable row level security;
alter table handover_codes enable row level security;
alter table payments enable row level security;

-- Public profile columns only; photo_path and is_admin stay private.
revoke all on profiles from anon, authenticated;
grant select (id, first_name, photo_blur_path, verified) on profiles to anon, authenticated;
grant insert (id, first_name, photo_blur_path, photo_path), update (first_name, photo_blur_path, photo_path) on profiles to authenticated;
create policy "profiles public" on profiles for select to anon, authenticated using (true);
create policy "own profile insert" on profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own payout account" on payout_accounts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin reads payout accounts" on payout_accounts for select to authenticated using (is_admin());

create policy "rates public" on fx_rates for select to anon, authenticated using (true);
create policy "admin rates" on fx_rates for all to authenticated using (is_admin()) with check (is_admin());

create policy "listed trips" on trips for select to anon, authenticated
  using (shop_by >= addis_today() or traveler_id = auth.uid() or is_admin());
create policy "own trips" on trips for all to authenticated
  using (traveler_id = auth.uid()) with check (traveler_id = auth.uid());

create policy "visible requests" on requests for select to anon, authenticated using (
  (kind = 'open' and status = 'open' and needed_by >= addis_today())
  or auth.uid() in (receiver_id, traveler_id) or is_admin()
);
create policy "create request" on requests for insert to authenticated with check (receiver_id = auth.uid());
-- No update/delete policies: changes go through advance_request / accept_offer.

create policy "receiver reads code" on handover_codes for select to authenticated using (
  exists (select 1 from requests r where r.id = request_id and r.receiver_id = auth.uid())
);

create policy "parties read payments" on payments for select to authenticated using (
  is_admin() or exists (select 1 from requests r where r.id = request_id and auth.uid() in (r.receiver_id, r.traveler_id))
);
create policy "receiver uploads escrow proof" on payments for insert to authenticated with check (
  kind = 'escrow' and my_phone_confirmed() and not has_pending_escrow(request_id)
  and split_part(proof_path, '/', 1) = auth.uid()::text
  and exists (select 1 from requests r where r.id = request_id and r.receiver_id = auth.uid() and r.status = 'awaiting_payment')
);
create policy "admin payments" on payments for all to authenticated using (is_admin()) with check (is_admin());

-- Offers (open requests) --------------------------------------------------------

create table offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests on delete cascade,
  traveler_id uuid not null references profiles,
  trip_id uuid not null references trips,
  reward_etb int not null check (reward_etb >= 1),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now()
);
create unique index offers_one_live_per_traveler on offers (request_id, traveler_id) where status in ('pending', 'accepted');

-- Same rule as isVisibleToTrip in lib/open-requests.ts.
create function make_offer(p_request uuid, p_trip uuid, p_reward int) returns uuid
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

create function accept_offer(p_offer uuid) returns void language plpgsql security definer set search_path = public as $$
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

create function reject_offer(p_offer uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update offers o set status = 'rejected' from requests r
    where o.id = p_offer and r.id = o.request_id and r.receiver_id = auth.uid() and o.status = 'pending';
  if not found then raise exception 'cannot reject this offer'; end if;
end $$;

create function withdraw_offer(p_offer uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update offers set status = 'withdrawn' where id = p_offer and traveler_id = auth.uid() and status = 'pending';
  if not found then raise exception 'cannot withdraw this offer'; end if;
end $$;

alter table offers enable row level security;
create policy "offer parties" on offers for select to authenticated using (
  traveler_id = auth.uid() or is_admin()
  or exists (select 1 from requests r where r.id = request_id and r.receiver_id = auth.uid())
);
-- No insert/update policies: offers change only through the functions above.

-- Reviews (both directions, after delivery) --------------------------------------

create table reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests on delete cascade,
  author_id uuid not null references profiles,
  subject_id uuid not null references profiles,
  rating int not null check (rating between 1 and 5),
  text text not null check (length(trim(text)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (request_id, author_id)
);

create function can_review(p_request uuid, p_author uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from requests r
    where r.id = p_request and r.status in ('delivered', 'paid_out')
      and ((p_author = r.receiver_id and p_subject = r.traveler_id) or (p_author = r.traveler_id and p_subject = r.receiver_id))
  )
$$;

alter table reviews enable row level security;
create policy "reviews public" on reviews for select to anon, authenticated using (true);
create policy "write own review" on reviews for insert to authenticated
  with check (author_id = auth.uid() and can_review(request_id, author_id, subject_id));

-- Aggregates for cards. Plain views run as their owner, so they count across rows the viewer can't read; they expose only totals.
create view traveler_stats as
  select p.id as traveler_id,
    (select round(avg(v.rating), 1)::numeric(2,1) from reviews v join requests r on r.id = v.request_id
      where v.subject_id = p.id and v.author_id = r.receiver_id) as rating,
    (select count(*) from reviews v join requests r on r.id = v.request_id
      where v.subject_id = p.id and v.author_id = r.receiver_id) as review_count,
    (select count(*) from requests r where r.traveler_id = p.id and r.status in ('delivered', 'paid_out')) as deliveries
  from profiles p;

create view receiver_stats as
  select p.id as receiver_id,
    (select round(avg(v.rating), 1)::numeric(2,1) from reviews v join requests r on r.id = v.request_id
      where v.subject_id = p.id and v.author_id = r.traveler_id) as rating,
    (select count(*) from reviews v join requests r on r.id = v.request_id
      where v.subject_id = p.id and v.author_id = r.traveler_id) as review_count
  from profiles p;

grant select on traveler_stats, receiver_stats to anon, authenticated;

-- Storage --------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('screenshots', 'screenshots', true),  -- open requests are browsable without login; product shots aren't sensitive
  ('photos-blur', 'photos-blur', true),  -- blurred copy made in the browser at upload
  ('photos', 'photos', false),           -- real photos: counterpart only, after acceptance
  ('proofs', 'proofs', false);           -- receipts and payment proofs

-- A traveler's real photo: themselves, admins, or a receiver whose request with them was accepted (stays after a cancel).
create function can_see_photo(p_owner text) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid()::text = p_owner or is_admin() or exists (
    select 1 from requests r where r.traveler_id::text = p_owner and r.receiver_id = auth.uid() and r.accepted_at is not null
  )
$$;

create function can_see_proof(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from requests r
    where auth.uid() in (r.receiver_id, r.traveler_id)
      and (r.receipt_path = p_name or exists (select 1 from payments p where p.request_id = r.id and p.proof_path = p_name))
  )
$$;

create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('screenshots', 'photos-blur', 'photos', 'proofs') and (storage.foldername(name))[1] = auth.uid()::text);
-- Proofs are evidence in disputes, so even their owner can't delete them.
create policy "manage own files" on storage.objects for delete to authenticated
  using (bucket_id <> 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
-- Public buckets serve files by URL without a policy; only the owner may list their own folder.
create policy "list own public files" on storage.objects for select to authenticated
  using (bucket_id in ('screenshots', 'photos-blur') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "real photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and can_see_photo((storage.foldername(name))[1]));
create policy "proofs" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = auth.uid()::text or can_see_proof(name)));
