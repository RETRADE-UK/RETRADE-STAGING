-- The app creates a fresh object for each photo and stores its path on the item.
-- Supabase's documented SQL bucket creation keeps the bucket and its policies atomic.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif']);

create policy retrade_item_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'item-photos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and cardinality(storage.foldername(name)) = 2
  );

create policy retrade_item_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'item-photos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy retrade_item_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'item-photos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
