-- Traveler and receiver sides: active side, optional receiver name, passport first name, public traveler names, receiver photos. Rolls back.
begin;

create function must_fail(q text, label text, expect text default null) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if expect is not null and position(expect in sqlerrm) = 0 then
      raise exception '% failed with "%" instead of "%"', label, sqlerrm, expect;
    end if;
    return;
  end;
  raise exception 'expected failure: %', label;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000e1');
insert into profiles (id, first_name, is_admin, active_side) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin', true, 'receiver'),
  ('00000000-0000-0000-0000-0000000000b1', 'Meron', false, 'receiver'),
  ('00000000-0000-0000-0000-0000000000c1', 'Hana', false, 'traveler'),
  ('00000000-0000-0000-0000-0000000000d1', 'Sami', false, 'traveler');
insert into fx_rates (currency, etb_per_unit) values ('AED', 38.5);

-- A traveler-first account: a profile row with a side and no receiver name.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
insert into profiles (id, active_side) values ('00000000-0000-0000-0000-0000000000e1', 'traveler');
select must_fail($$update profiles set active_side = 'admin' where id = '00000000-0000-0000-0000-0000000000e1'$$, 'unknown side');
update profiles set active_side = 'traveler' where id = '00000000-0000-0000-0000-0000000000b1';
update profiles set active_side = 'traveler' where id = '00000000-0000-0000-0000-0000000000e1';
reset role;
do $$ begin
  assert (select active_side from profiles where id = '00000000-0000-0000-0000-0000000000e1') = 'traveler', 'own side saved';
  assert (select active_side from profiles where id = '00000000-0000-0000-0000-0000000000b1') = 'receiver', 'others'' side untouched';
end $$;

-- No receiver name, no requests.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select must_fail($$insert into requests (kind, countries, needed_by, item_name, item_url, unit_price, currency)
  values ('open', '{AE}', addis_today() + 10, 'X', 'https://a.com', 10, 'AED')$$, 'request without receiver name', 'set up your receiver side first');

-- The passport first name defaults to the first word of the full name; the admin corrects it when approving.
insert into traveler_verifications (user_id, legal_name, nationality, passport_expiry, passport_path, selfie_path)
  values ('00000000-0000-0000-0000-0000000000e1', '  TESFAYE HANA', 'ET', addis_today() + 400,
          '00000000-0000-0000-0000-0000000000e1/p.jpg', '00000000-0000-0000-0000-0000000000e1/s.jpg');
do $$ begin
  assert (select status from traveler_verifications where user_id = '00000000-0000-0000-0000-0000000000e1') = 'pending', 'submitted pending';
  assert (select given_name from traveler_verifications where user_id = '00000000-0000-0000-0000-0000000000e1') = 'TESFAYE', 'first word by default';
end $$;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin assert not exists (select 1 from traveler_names where traveler_id = '00000000-0000-0000-0000-0000000000e1'), 'pending traveler hidden'; end $$;

-- Approving needs a given name.
reset role;
set local request.jwt.claim.sub = '';
select test_verify('00000000-0000-0000-0000-0000000000c1');
select test_verify('00000000-0000-0000-0000-0000000000d1');
select set_config('zakbis.deciding', 'on', true);
update traveler_verifications set given_name = null, status = 'pending' where user_id = '00000000-0000-0000-0000-0000000000d1';
select set_config('zakbis.deciding', 'off', true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select must_fail($$select decide_verification('00000000-0000-0000-0000-0000000000d1', true)$$, 'approve without given name', 'first name');
select must_fail($$select decide_verification('00000000-0000-0000-0000-0000000000e1', true, null, '  ')$$, 'approve with blank given name', 'first name');
select decide_verification('00000000-0000-0000-0000-0000000000e1', true, null, ' Hana ');
reset role;
set local request.jwt.claim.sub = '';
select test_verify('00000000-0000-0000-0000-0000000000d1');
select set_config('zakbis.deciding', 'on', true);
update traveler_verifications set passport_expiry = addis_today() - 1 where user_id = '00000000-0000-0000-0000-0000000000d1';
select set_config('zakbis.deciding', 'off', true);

-- Public traveler names: first name only, verified travelers only.
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select array_agg(column_name::text order by column_name) from information_schema.columns where table_name = 'traveler_names')
    = '{given_name,traveler_id}', 'only two columns';
  assert (select given_name from traveler_names where traveler_id = '00000000-0000-0000-0000-0000000000c1') = 'Test', 'verified traveler listed';
  assert (select given_name from traveler_names where traveler_id = '00000000-0000-0000-0000-0000000000e1') = 'Hana', 'admin-corrected name listed';
  assert not exists (select 1 from traveler_names where traveler_id = '00000000-0000-0000-0000-0000000000d1'), 'expired passport hidden';
  assert (select count(*) from traveler_verifications) = 0, 'verifications stay private';
end $$;

-- Receiver photos: own folder only; photo buckets limited to 8 MB images.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into storage.objects (bucket_id, name) values ('receiver-photos', '00000000-0000-0000-0000-0000000000b1/1.jpg');
select must_fail($$insert into storage.objects (bucket_id, name) values ('receiver-photos', '00000000-0000-0000-0000-0000000000c1/1.jpg')$$, 'upload to another folder');
update profiles set receiver_photo_path = '00000000-0000-0000-0000-0000000000b1/1.jpg' where id = '00000000-0000-0000-0000-0000000000b1';
select must_fail($$update profiles set receiver_photo_path = 'https://tracker.example/x.gif' where id = '00000000-0000-0000-0000-0000000000b1'$$, 'photo link to any host');
select must_fail($$update profiles set receiver_photo_path = '00000000-0000-0000-0000-0000000000c1/1.jpg' where id = '00000000-0000-0000-0000-0000000000b1'$$, 'someone else''s upload');
update profiles set receiver_photo_path = 'https://t.me/i/userpic/320/abc.jpg' where id = '00000000-0000-0000-0000-0000000000b1';
update profiles set receiver_photo_path = 'https://lh3.googleusercontent.com/a/xyz=s96-c' where id = '00000000-0000-0000-0000-0000000000b1';
update profiles set receiver_photo_path = '00000000-0000-0000-0000-0000000000b1/1.jpg' where id = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'receiver-photos') = 1, 'owner reads own receiver photo object (Storage selects after insert)'; end $$;
set local role anon;
do $$ begin
  assert (select receiver_photo_path from profiles where id = '00000000-0000-0000-0000-0000000000b1') is not null, 'receiver photo public';
  assert (select count(*) from storage.buckets where id in ('receiver-photos', 'photos', 'photos-blur')
    and file_size_limit = 8388608 and allowed_mime_types = '{image/jpeg,image/png,image/webp}') = 3, 'photo bucket limits';
  assert (select public from storage.buckets where id = 'receiver-photos'), 'receiver photos public';
end $$;

rollback;
