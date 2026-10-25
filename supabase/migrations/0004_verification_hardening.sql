-- Hardening from the traveler-verification review.

-- Identity documents are evidence: like proofs, their owner can't delete (or swap) them.
drop policy "manage own files" on storage.objects;
create policy "manage own files" on storage.objects for delete to authenticated
  using (bucket_id not in ('proofs', 'identity') and (storage.foldername(name))[1] = auth.uid()::text);

-- Second guard on the decision bypass: a non-admin who sets zakbis.deciding still lands in pending.
create or replace function traveler_verifications_submit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only decide_verification (admin) or server-side code (no auth user) may skip the reset to pending.
  if current_setting('zakbis.deciding', true) = 'on' and (is_admin() or auth.uid() is null) then return new; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'not your verification'; end if;
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
