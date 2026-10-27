-- Which Supabase account a Telegram user signs into. Only the server (service role) touches it:
-- Supabase can't search users by metadata, and app users must never see Telegram ids.
create table telegram_links (
  telegram_id bigint primary key,
  user_id uuid not null unique references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table telegram_links enable row level security;
revoke all on telegram_links from anon, authenticated;
