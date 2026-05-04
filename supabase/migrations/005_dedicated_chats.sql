-- ============================================================
-- Dedicated chat tables for triangular and shopping flows
-- ============================================================
-- This migration keeps the chat model split so triangular delivery threads
-- (sender, traveler, receiver) and shopping threads (traveler, receiver)
-- can have independent RLS and no shared participant table.

-- Tables
create table if not exists triangular_chats (
  id                  uuid primary key default uuid_generate_v4(),
  delivery_request_id uuid not null unique references delivery_requests(id) on delete cascade,
  sender_id           uuid not null references profiles(id) on delete cascade,
  traveler_id         uuid not null references profiles(id) on delete cascade,
  receiver_id         uuid not null references profiles(id) on delete cascade,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table if not exists shopping_chats (
  id                uuid primary key default uuid_generate_v4(),
  buy_me_request_id uuid not null unique references buy_me_requests(id) on delete cascade,
  traveler_id       uuid not null references profiles(id) on delete cascade,
  receiver_id       uuid not null references profiles(id) on delete cascade,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- RLS
alter table triangular_chats enable row level security;
alter table shopping_chats enable row level security;

-- Triangular chats
DROP POLICY IF EXISTS "Triangular chat participants can view chats" ON triangular_chats;
create policy "Triangular chat participants can view chats" on triangular_chats
  for select using (auth.uid() in (sender_id, traveler_id, receiver_id));

DROP POLICY IF EXISTS "Triangular chat participants can create chats" ON triangular_chats;
create policy "Triangular chat participants can create chats" on triangular_chats
  for insert with check (auth.uid() in (sender_id, traveler_id, receiver_id));

DROP POLICY IF EXISTS "Triangular chat participants can update chats" ON triangular_chats;
create policy "Triangular chat participants can update chats" on triangular_chats
  for update using (auth.uid() in (sender_id, traveler_id, receiver_id))
  with check (auth.uid() in (sender_id, traveler_id, receiver_id));

-- Shopping chats
DROP POLICY IF EXISTS "Shopping chat participants can view chats" ON shopping_chats;
create policy "Shopping chat participants can view chats" on shopping_chats
  for select using (auth.uid() in (traveler_id, receiver_id));

DROP POLICY IF EXISTS "Shopping chat participants can create chats" ON shopping_chats;
create policy "Shopping chat participants can create chats" on shopping_chats
  for insert with check (auth.uid() in (traveler_id, receiver_id));

DROP POLICY IF EXISTS "Shopping chat participants can update chats" ON shopping_chats;
create policy "Shopping chat participants can update chats" on shopping_chats
  for update using (auth.uid() in (traveler_id, receiver_id))
  with check (auth.uid() in (traveler_id, receiver_id));

-- Messages
DROP POLICY IF EXISTS "Chat participants can read messages" ON messages;
create policy "Chat participants can read messages" on messages
  for select using (
    exists (
      select 1
      from triangular_chats tc
      where tc.id = messages.chat_id
        and auth.uid() in (tc.sender_id, tc.traveler_id, tc.receiver_id)
    )
    or exists (
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
      or exists (
        select 1
        from shopping_chats sc
        where sc.id = messages.chat_id
          and auth.uid() in (sc.traveler_id, sc.receiver_id)
      )
    )
  );
