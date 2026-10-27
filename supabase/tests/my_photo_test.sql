-- Owners read their own real-photo path through my_photo_path(); photo_path itself stays unreadable. Rolls back.
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1');
insert into profiles (id, first_name, active_side, photo_path) values
  ('00000000-0000-0000-0000-0000000000b1', 'Meron', 'receiver', null),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', 'traveler', '00000000-0000-0000-0000-0000000000c1/1.jpg');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert my_photo_path() = '00000000-0000-0000-0000-0000000000c1/1.jpg', 'owner gets own path';
  assert not has_column_privilege('public.profiles', 'photo_path', 'select'), 'photo_path column stays private';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert my_photo_path() is null, 'another user never gets Hana''s path'; end $$;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin assert my_photo_path() is null, 'signed out gets nothing'; end $$;

rollback;
