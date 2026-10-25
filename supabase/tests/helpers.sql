-- Test-only helpers, loaded after the migrations. Never applied to Supabase.
-- Marks a traveler as verified (approved, passport valid for a year), bypassing the owner-submit trigger.
create function test_verify(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('zakbis.deciding', 'on', true);
  insert into traveler_verifications (user_id, legal_name, nationality, passport_expiry, passport_path, selfie_path, status)
    values (uid, 'TEST TRAVELER', 'ET', addis_today() + 365, uid || '/p.jpg', uid || '/s.jpg', 'approved')
    on conflict (user_id) do update set status = 'approved', passport_expiry = addis_today() + 365;
  update profiles set verified = true where id = uid;
  perform set_config('zakbis.deciding', 'off', true);
end $$;
