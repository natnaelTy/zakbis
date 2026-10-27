-- Travelers type only their full passport name. The public first name defaults to its first word, and the admin
-- corrects it on the review card for surname-first passports before approving.

create or replace function traveler_verifications_submit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only decide_verification (admin) or server-side code (no auth user) may skip the reset to pending.
  if current_setting('zakbis.deciding', true) = 'on' and (is_admin() or auth.uid() is null) then return new; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'not your verification'; end if;
  new.given_name := split_part(trim(new.legal_name), ' ', 1); -- only an admin sets anything else
  if split_part(new.passport_path, '/', 1) <> new.user_id::text or split_part(new.selfie_path, '/', 1) <> new.user_id::text then
    raise exception 'documents must be your own uploads';
  end if;
  if new.passport_expiry < addis_today() then raise exception 'this passport has expired'; end if;
  new.status := 'pending';
  new.rejection_reason := null;
  new.decided_at := null;
  new.decided_by := null;
  new.submitted_at := now();
  update profiles set verified = false where id = new.user_id;
  return new;
end $$;

drop function decide_verification(uuid, boolean, text);
create function decide_verification(p_user uuid, p_approve boolean, p_reason text default null, p_given_name text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required to reject'; end if;
  if p_approve and p_given_name is not null and trim(p_given_name) = '' then raise exception 'no first name to approve'; end if;
  perform set_config('zakbis.deciding', 'on', true);
  if p_approve and p_given_name is not null then
    update traveler_verifications set given_name = trim(p_given_name) where user_id = p_user;
  end if;
  if p_approve and (select given_name from traveler_verifications where user_id = p_user) is null then
    raise exception 'no first name to approve';
  end if;
  update traveler_verifications
    set status = case when p_approve then 'approved' else 'rejected' end,
        rejection_reason = case when p_approve then null else p_reason end,
        decided_at = now(), decided_by = auth.uid()
    where user_id = p_user;
  if not found then raise exception 'no verification for this user'; end if;
  update profiles set verified = p_approve where id = p_user;
  perform set_config('zakbis.deciding', 'off', true);
end $$;

-- A receiver photo is the owner's own upload or the photo Telegram/Google gave at sign-up, never a link to any host
-- (that would let a receiver log who views their photo). Mirrored in lib/photos.ts.
alter table profiles add constraint receiver_photo_source check (
  receiver_photo_path ~ '^https://(t\.me/i/userpic/|lh3\.googleusercontent\.com/)'
  or (receiver_photo_path !~ '^[a-z]+:' and split_part(receiver_photo_path, '/', 1) = id::text)
);
