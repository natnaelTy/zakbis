-- telegram_links: one Telegram id per account and vice versa; unreachable for app users. Rolls back.
begin;

create function must_fail(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then return; end;
  raise exception 'expected failure: %', label;
end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1');
insert into telegram_links (telegram_id, user_id) values (42, '00000000-0000-0000-0000-0000000000a1');
select must_fail($$insert into telegram_links (telegram_id, user_id) values (42, '00000000-0000-0000-0000-0000000000b1')$$, 'same telegram id twice');
select must_fail($$insert into telegram_links (telegram_id, user_id) values (43, '00000000-0000-0000-0000-0000000000a1')$$, 'same user twice');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$select count(*) from telegram_links$$, 'authenticated reads');
select must_fail($$insert into telegram_links (telegram_id, user_id) values (44, '00000000-0000-0000-0000-0000000000b1')$$, 'authenticated writes');
set local role anon;
select must_fail($$select count(*) from telegram_links$$, 'anon reads');

rollback;
