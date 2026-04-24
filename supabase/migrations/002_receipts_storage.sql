-- ============================================================
-- Supabase Storage bucket for receipt images
-- Run this in the Supabase SQL Editor or via CLI
-- ============================================================

-- Create a public bucket for receipt images
insert into storage.buckets (id, name, public) 
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to the receipts bucket
create policy "Authenticated users can upload receipts" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts');

-- Allow authenticated users to read receipts
create policy "Anyone can view receipts" on storage.objects
  for select using (bucket_id = 'receipts');

-- Allow users to delete their own uploads
create policy "Users can delete own receipts" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
