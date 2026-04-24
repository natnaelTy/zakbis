-- ============================================================
-- Track when each user last read each chat
-- ============================================================
-- This table stores the timestamp of when a user last viewed a chat.
-- By comparing this with the latest message timestamp, we derive unread count.

create table if not exists chat_read_receipts (
  chat_id    uuid not null references chats(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  last_read  timestamptz not null default now(),
  primary key (chat_id, user_id)
);

alter table chat_read_receipts enable row level security;

-- Users can read/write only their own receipts
create policy "Users can view own read receipts" on chat_read_receipts
  for select using (auth.uid() = user_id);

create policy "Users can upsert own read receipts" on chat_read_receipts
  for insert with check (auth.uid() = user_id);

create policy "Users can update own read receipts" on chat_read_receipts
  for update using (auth.uid() = user_id);
