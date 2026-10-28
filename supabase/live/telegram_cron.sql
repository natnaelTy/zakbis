-- Runs deadlines and sends Telegram notes every minute. NOT a migration and not run by the tests: run it once on the
-- live database after migrations 0009 and 0010.
--
-- Before running:
--   1. Supabase Dashboard -> Database -> Extensions: enable pg_cron and pg_net.
--   2. In the SQL editor, store the bot token (paste it yourself; never commit it):
--        select vault.create_secret('<bot token>', 'telegram_bot_token');
--   3. Run this file wrapped in begin; / commit;.

create or replace function send_telegram() returns void language plpgsql security definer set search_path = public as $$
declare
  token text := (select decrypted_secret from vault.decrypted_secrets where name = 'telegram_bot_token');
  x record;
  sent uuid[] := '{}';
begin
  if token is null then return; end if;
  for x in select * from telegram_outbox(50) loop
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || token || '/sendMessage',
      body := jsonb_build_object('chat_id', x.chat_id, 'text', x.text, 'disable_web_page_preview', true),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    sent := sent || x.note_id;
  end loop;
  -- pg_net is fire-and-forget: a note is marked sent once queued, so a failed send is never retried (it stays in the Inbox).
  perform mark_telegram_sent(sent);
end $$;
revoke execute on function send_telegram() from public, anon, authenticated;

select cron.schedule('zakbis-every-minute', '* * * * *', 'select run_deadlines(); select send_telegram();');
