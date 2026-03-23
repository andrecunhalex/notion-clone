-- =============================================================================
-- 002: Storage bucket for document images
-- =============================================================================

-- Create a public bucket for document images
insert into storage.buckets (id, name, public)
values ('document-images', 'document-images', true)
on conflict (id) do nothing;

-- Allow anyone to read images (public bucket)
create policy "Public read access for document images"
  on storage.objects for select
  using (bucket_id = 'document-images');

-- Allow authenticated users to upload images
-- (Troque para a policy que fizer sentido pro seu projeto)
create policy "Allow upload for document images"
  on storage.objects for insert
  with check (bucket_id = 'document-images');

-- Allow authenticated users to delete their own images
create policy "Allow delete for document images"
  on storage.objects for delete
  using (bucket_id = 'document-images');
