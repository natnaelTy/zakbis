-- ============================================================
-- Zakbis P2P Logistics Platform — Supabase Schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES TABLE
-- ============================================================
create type user_role as enum ('SENDER', 'TRAVELER', 'RECEIVER');

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  avatar_url  text,
  role        user_role not null default 'SENDER',
  rating      numeric(3,2) default 5.00,
  verified    boolean default false,
  phone       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'SENDER')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- TRIPS TABLE
-- ============================================================
create type trip_type as enum ('TRIANGULAR', 'BUY_ME');
create type trip_status as enum ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

create table if not exists trips (
  id                uuid primary key default uuid_generate_v4(),
  traveler_id       uuid not null references profiles(id) on delete cascade,
  trip_type         trip_type not null default 'TRIANGULAR',
  flight_number     text not null,
  departure_city    text not null,
  destination_city  text not null,
  departure_date    date not null,
  available_weight  numeric(5,2) default 10.00, -- kg
  price_per_kg      numeric(8,2) default 0.00,  -- USD
  status            trip_status default 'OPEN',
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ============================================================
-- DELIVERY REQUESTS TABLE
-- ============================================================
create type delivery_status as enum (
  'PENDING',
  'MATCHED',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
  'CANCELLED'
);

create table if not exists delivery_requests (
  id               uuid primary key default uuid_generate_v4(),
  sender_id        uuid references profiles(id) on delete set null,
  receiver_id      uuid references profiles(id) on delete set null,
  trip_id          uuid references trips(id) on delete set null,
  item_description text not null,
  weight           numeric(5,2),
  pickup_city      text not null,
  dropoff_city     text not null,
  status           delivery_status default 'PENDING',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ============================================================
-- BUY ME REQUESTS TABLE
-- ============================================================
create type buy_me_status as enum (
  'OPEN',
  'ACCEPTED',
  'PURCHASED',
  'DELIVERED',
  'CANCELLED'
);

create table if not exists buy_me_requests (
  id              uuid primary key default uuid_generate_v4(),
  receiver_id     uuid not null references profiles(id) on delete cascade,
  traveler_id     uuid references profiles(id) on delete set null,
  trip_id         uuid references trips(id) on delete set null,
  product_url     text not null,
  product_name    text not null,
  product_image   text,
  estimated_price numeric(10,2),
  destination     text not null,
  notes           text,
  receipt_url     text,  -- uploaded by traveler to confirm purchase
  status          buy_me_status default 'OPEN',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- DEDICATED CHAT TABLES
-- ============================================================
create table if not exists triangular_chats (
  id                 uuid primary key default uuid_generate_v4(),
  delivery_request_id uuid not null unique references delivery_requests(id) on delete cascade,
  sender_id          uuid not null references profiles(id) on delete cascade,
  traveler_id        uuid not null references profiles(id) on delete cascade,
  receiver_id        uuid references profiles(id) on delete cascade,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists shopping_chats (
  id               uuid primary key default uuid_generate_v4(),
  buy_me_request_id uuid not null unique references buy_me_requests(id) on delete cascade,
  traveler_id      uuid not null references profiles(id) on delete cascade,
  receiver_id      uuid not null references profiles(id) on delete cascade,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ============================================================
-- MESSAGES TABLE
-- ============================================================
create table if not exists messages (
  id          uuid primary key default uuid_generate_v4(),
  chat_id     uuid not null,
  sender_id   uuid not null references profiles(id) on delete cascade,
  text        text not null,
  created_at  timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table profiles enable row level security;
alter table trips enable row level security;
alter table delivery_requests enable row level security;
alter table buy_me_requests enable row level security;
alter table triangular_chats enable row level security;
alter table shopping_chats enable row level security;
alter table messages enable row level security;

-- Profiles: users can read all, only update their own
create policy "Profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Trips: anyone can read open trips, only traveler can insert/update their own
create policy "Trips are viewable by everyone" on trips for select using (true);
create policy "Travelers can insert trips" on trips for insert with check (auth.uid() = traveler_id);
create policy "Travelers can update own trips" on trips for update using (auth.uid() = traveler_id);

-- Delivery requests: participants can view
create policy "Delivery requests viewable by participants" on delivery_requests
  for select using (
    auth.uid() = sender_id or
    auth.uid() = receiver_id or
    auth.uid() in (select traveler_id from trips where id = trip_id)
  );
create policy "Authenticated users can create delivery requests" on delivery_requests
  for insert with check (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Participants can update delivery requests" on delivery_requests
  for update using (
    auth.uid() = sender_id or
    auth.uid() = receiver_id or
    auth.uid() in (select traveler_id from trips where id = trip_id)
  );

-- Buy me requests: open ones visible to all, participants can update
create policy "Open buy me requests are viewable by everyone" on buy_me_requests
  for select using (status = 'OPEN' or auth.uid() = receiver_id or auth.uid() = traveler_id);
create policy "Receivers can create buy me requests" on buy_me_requests
  for insert with check (auth.uid() = receiver_id);
create policy "Participants can update buy me requests" on buy_me_requests
  for update using (auth.uid() = receiver_id or auth.uid() = traveler_id);

-- Triangular chats: sender, traveler, and receiver can view and create rows
DROP POLICY IF EXISTS "Triangular chat participants can view chats" ON triangular_chats;
create policy "Triangular chat participants can view chats" on triangular_chats
  for select using (
    auth.uid() in (sender_id, traveler_id, receiver_id)
  );

DROP POLICY IF EXISTS "Triangular chat participants can create chats" ON triangular_chats;
create policy "Triangular chat participants can create chats" on triangular_chats
  for insert with check (
    auth.uid() in (sender_id, traveler_id, receiver_id)
  );

DROP POLICY IF EXISTS "Triangular chat participants can update chats" ON triangular_chats;
create policy "Triangular chat participants can update chats" on triangular_chats
  for update using (
    auth.uid() in (sender_id, traveler_id, receiver_id)
  ) with check (
    auth.uid() in (sender_id, traveler_id, receiver_id)
  );

-- Shopping chats: traveler and receiver can view and create rows
DROP POLICY IF EXISTS "Shopping chat participants can view chats" ON shopping_chats;
create policy "Shopping chat participants can view chats" on shopping_chats
  for select using (
    auth.uid() in (traveler_id, receiver_id)
  );

DROP POLICY IF EXISTS "Shopping chat participants can create chats" ON shopping_chats;
create policy "Shopping chat participants can create chats" on shopping_chats
  for insert with check (
    auth.uid() in (traveler_id, receiver_id)
  );

DROP POLICY IF EXISTS "Shopping chat participants can update chats" ON shopping_chats;
create policy "Shopping chat participants can update chats" on shopping_chats
  for update using (
    auth.uid() in (traveler_id, receiver_id)
  ) with check (
    auth.uid() in (traveler_id, receiver_id)
  );

-- Messages: only chat participants can read/write
DROP POLICY IF EXISTS "Chat participants can read messages" ON messages;
create policy "Chat participants can read messages" on messages
  for select using (
    exists (
      select 1
      from triangular_chats tc
      where tc.id = messages.chat_id
        and auth.uid() in (tc.sender_id, tc.traveler_id, tc.receiver_id)
    )
    or
    exists (
      select 1
      from shopping_chats sc
      where sc.id = messages.chat_id
        and auth.uid() in (sc.traveler_id, sc.receiver_id)
    )
  );

DROP POLICY IF EXISTS "Chat participants can send messages" ON messages;
create policy "Chat participants can send messages" on messages
  for insert with check (
    auth.uid() = sender_id and (
      exists (
        select 1
        from triangular_chats tc
        where tc.id = messages.chat_id
          and auth.uid() in (tc.sender_id, tc.traveler_id, tc.receiver_id)
      )
      or
      exists (
        select 1
        from shopping_chats sc
        where sc.id = messages.chat_id
          and auth.uid() in (sc.traveler_id, sc.receiver_id)
      )
    )
  );

-- ============================================================
-- REALTIME
-- ============================================================
-- Enable realtime for messages (for live chat)
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table delivery_requests;
alter publication supabase_realtime add table buy_me_requests;
