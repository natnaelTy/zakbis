-- Buy Me MVP: travelers post trips, receivers request items (on a trip or open), manual escrow.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Phone lives apart from profiles so it is only revealed via counterpart_phone() after payment.
create table private_contacts (
  user_id uuid primary key references profiles on delete cascade,
  phone text not null
);

-- Admin-maintained; locked onto each request at creation to avoid FX disputes.
create table fx_rates (
  currency text primary key check (currency in ('USD', 'GBP', 'CNY', 'AED')),
  etb_per_unit numeric not null check (etb_per_unit > 0),
  updated_at timestamptz not null default now()
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references profiles on delete cascade,
  origin_country text not null check (origin_country in ('US', 'GB', 'CN', 'AE')),
  origin_city text not null,
  shop_by date not null,
  arrival_date date not null check (arrival_date >= shop_by),
  free_kg numeric not null check (free_kg > 0),
  categories text[] not null default '{}',
  note text,
  created_at timestamptz not null default now()
);

create type request_status as enum
  ('open', 'awaiting_payment', 'paid', 'purchased', 'delivered', 'paid_out', 'cancelled');

create table requests (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references profiles on delete cascade,
  trip_id uuid references trips on delete set null, -- null = open request any traveler can take
  traveler_id uuid references profiles,
  item_name text not null,
  item_url text,
  item_image_path text,
  quantity int not null default 1 check (quantity > 0),
  item_price numeric not null check (item_price > 0),
  currency text not null references fx_rates,
  reward_etb numeric not null check (reward_etb >= 0),
  fx_rate numeric,
  receipt_path text,
  status request_status not null default 'open',
  created_at timestamptz not null default now()
);

-- Kept apart from requests so the traveler can never read the code they must be given.
create table handover_codes (
  request_id uuid primary key references requests on delete cascade,
  code text not null default lpad(floor(random() * 1000000)::text, 6, '0')
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests on delete cascade,
  kind text not null check (kind in ('escrow', 'payout')),
  amount_etb numeric not null check (amount_etb > 0),
  proof_path text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

create function requests_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.receiver_id := auth.uid();
  new.status := 'open';
  new.traveler_id := (select traveler_id from trips where id = new.trip_id);
  new.fx_rate := (select etb_per_unit from fx_rates where currency = new.currency);
  if new.fx_rate is null then raise exception 'no fx rate for %', new.currency; end if;
  new.receipt_path := null;
  return new;
end $$;
create trigger requests_before_insert before insert on requests
  for each row execute function requests_before_insert();

create function requests_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into handover_codes (request_id) values (new.id);
  return new;
end $$;
create trigger requests_after_insert after insert on requests
  for each row execute function requests_after_insert();

-- The only way status changes: each transition checks who may do it.
create function advance_request(p_id uuid, p_to request_status, p_code text default null, p_receipt text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  select * into r from requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;

  if p_to = 'awaiting_payment' and r.status = 'open'
     and auth.uid() <> r.receiver_id
     and (r.traveler_id = auth.uid() or (r.trip_id is null and r.traveler_id is null)) then
    update requests set status = p_to, traveler_id = auth.uid() where id = p_id;
  elsif p_to = 'paid' and r.status = 'awaiting_payment' and is_admin() then
    update requests set status = p_to where id = p_id;
  elsif p_to = 'purchased' and r.status = 'paid' and r.traveler_id = auth.uid() and p_receipt is not null then
    update requests set status = p_to, receipt_path = p_receipt where id = p_id;
  elsif p_to = 'delivered' and r.status = 'purchased' and r.traveler_id = auth.uid() then
    if p_code is distinct from (select code from handover_codes where request_id = p_id) then
      raise exception 'wrong handover code';
    end if;
    update requests set status = p_to where id = p_id;
  elsif p_to = 'paid_out' and r.status = 'delivered' and is_admin() then
    update requests set status = p_to where id = p_id;
  elsif p_to = 'cancelled' and r.status in ('open', 'awaiting_payment')
     and (r.receiver_id = auth.uid() or is_admin()) then
    update requests set status = p_to where id = p_id;
  else
    raise exception 'transition % -> % not allowed', r.status, p_to;
  end if;
end $$;

create function counterpart_phone(p_request uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.phone from requests r
  join private_contacts c on c.user_id =
    case when r.receiver_id = auth.uid() then r.traveler_id else r.receiver_id end
  where r.id = p_request
    and auth.uid() in (r.receiver_id, r.traveler_id)
    and r.status in ('paid', 'purchased', 'delivered', 'paid_out')
$$;

-- RLS
alter table profiles enable row level security;
alter table private_contacts enable row level security;
alter table fx_rates enable row level security;
alter table trips enable row level security;
alter table requests enable row level security;
alter table handover_codes enable row level security;
alter table payments enable row level security;

create policy "profiles readable" on profiles for select to authenticated using (true);
create policy "own profile insert" on profiles for insert to authenticated with check (id = auth.uid() and not is_admin);
create policy "own profile update" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and is_admin = is_admin());

create policy "own contact" on private_contacts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "rates readable" on fx_rates for select to authenticated using (true);
create policy "admin rates" on fx_rates for all to authenticated using (is_admin()) with check (is_admin());

create policy "trips readable" on trips for select to authenticated using (true);
create policy "own trips" on trips for all to authenticated
  using (traveler_id = auth.uid()) with check (traveler_id = auth.uid());

create policy "requests visible" on requests for select to authenticated using (
  (status = 'open' and trip_id is null) or auth.uid() in (receiver_id, traveler_id) or is_admin()
);
create policy "create request" on requests for insert to authenticated with check (true); -- trigger sets owner/status
-- No update/delete policies: changes go through advance_request().

create policy "receiver sees code" on handover_codes for select to authenticated using (
  exists (select 1 from requests where id = request_id and receiver_id = auth.uid())
);

create policy "payments visible" on payments for select to authenticated using (
  is_admin() or exists (select 1 from requests where id = request_id and auth.uid() in (receiver_id, traveler_id))
);
create policy "receiver uploads escrow proof" on payments for insert to authenticated with check (
  kind = 'escrow' and status = 'pending'
  and exists (select 1 from requests where id = request_id and receiver_id = auth.uid() and status = 'awaiting_payment')
);
create policy "admin payments" on payments for all to authenticated using (is_admin()) with check (is_admin());

-- Storage: public item photos; private proofs/receipts under "<uid>/..."
insert into storage.buckets (id, name, public) values ('items', 'items', true), ('proofs', 'proofs', false);
create policy "upload own files" on storage.objects for insert to authenticated with check (
  bucket_id in ('items', 'proofs') and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "read own proofs" on storage.objects for select to authenticated using (
  bucket_id = 'proofs' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin())
);
