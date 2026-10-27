-- Traveler and receiver sides on one login: the active side, the receiver name and photo, and the passport first name
-- that is a traveler's only public name. Spec: docs/superpowers/specs/2026-10-27-role-switch-design.md

-- Profiles: first_name is now the receiver name; null means the receiver side isn't set up.
alter table profiles alter column first_name drop not null;
alter table profiles add column active_side text check (active_side in ('receiver', 'traveler'));
alter table profiles add column receiver_photo_path text;
update profiles set active_side = 'receiver' where active_side is null;
grant select (active_side, receiver_photo_path) on profiles to anon, authenticated;
grant insert (active_side, receiver_photo_path), update (active_side, receiver_photo_path) on profiles to authenticated;

-- The traveler's public name: the given name as printed in the passport, checked by an admin.
alter table traveler_verifications add column given_name text check (length(trim(given_name)) between 1 and 40);

create or replace function traveler_verifications_submit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only decide_verification (admin) or server-side code (no auth user) may skip the reset to pending.
  if current_setting('zakbis.deciding', true) = 'on' and (is_admin() or auth.uid() is null) then return new; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'not your verification'; end if;
  if coalesce(trim(new.given_name), '') = '' then raise exception 'enter your first name as in your passport'; end if;
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

create or replace function decide_verification(p_user uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required to reject'; end if;
  if p_approve and (select given_name from traveler_verifications where user_id = p_user) is null then
    raise exception 'no first name to approve';
  end if;
  perform set_config('zakbis.deciding', 'on', true);
  update traveler_verifications
    set status = case when p_approve then 'approved' else 'rejected' end,
        rejection_reason = case when p_approve then null else p_reason end,
        decided_at = now(), decided_by = auth.uid()
    where user_id = p_user;
  if not found then raise exception 'no verification for this user'; end if;
  update profiles set verified = p_approve where id = p_user;
  perform set_config('zakbis.deciding', 'off', true);
end $$;

-- Owner-run like traveler_stats, so traveler_verifications itself stays private.
create view traveler_names as
  select user_id as traveler_id, given_name from traveler_verifications where is_verified_traveler(user_id);
grant select on traveler_names to anon, authenticated;

create or replace function requests_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.receiver_id := auth.uid();
  if new.receiver_id is null then raise exception 'login required'; end if;
  if (select first_name from profiles where id = new.receiver_id) is null then raise exception 'set up your receiver side first'; end if;
  new.status := 'open';
  new.receipt_path := null;
  new.accepted_at := null;
  new.purchased_at := null;
  new.landed_at := null;
  select etb_per_unit into new.fx_rate from fx_rates where currency = new.currency;
  if not found then raise exception 'no fx rate for %', new.currency; end if;

  if new.kind = 'trip' then
    select traveler_id into new.traveler_id from trips where id = new.trip_id and shop_by >= addis_today();
    if not found then raise exception 'trip is not available'; end if;
    if new.traveler_id = new.receiver_id then raise exception 'cannot request on your own trip'; end if;
    if not is_verified_traveler(new.traveler_id) then raise exception 'this traveler is not verified'; end if;
  else
    new.traveler_id := null;
    new.trip_id := null;
    new.reward_etb := null; -- travelers name the reward in their offers
    if new.needed_by is null or new.needed_by not between addis_today() + 3 and addis_today() + 60 then
      raise exception 'needed by must be 3 to 60 days ahead';
    end if;
  end if;
  return new;
end $$;

-- Photos: receiver photos are public and live apart from traveler photos, so revealing one never exposes the other.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('receiver-photos', 'receiver-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp']);
update storage.buckets set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id in ('photos', 'photos-blur');
create policy "receiver photo upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'receiver-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- Storage reads back the row it just inserted, so owners need to see their own receiver photos too.
create policy "receiver photo owner" on storage.objects for select to authenticated
  using (bucket_id = 'receiver-photos' and (storage.foldername(name))[1] = auth.uid()::text);
