-- Private Supabase Storage bucket for driver verification documents.
-- Object paths are stored as: <auth.uid>/<document-type>/<timestamp>-<filename>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'taxi-driver-documents',
  'taxi-driver-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.taxi_driver_documents add column if not exists storage_bucket text;
alter table public.taxi_driver_documents add column if not exists storage_path text;
alter table public.taxi_driver_documents add column if not exists mime_type text;
alter table public.taxi_driver_documents add column if not exists file_size_bytes integer;

create index if not exists taxi_driver_documents_storage_idx
on public.taxi_driver_documents(storage_bucket, storage_path)
where storage_path is not null;

-- Reset policies so this migration is safe to re-run.
drop policy if exists "driver docs upload own folder" on storage.objects;
drop policy if exists "driver docs read own folder or admin" on storage.objects;
drop policy if exists "driver docs update own folder or admin" on storage.objects;
drop policy if exists "driver docs delete own folder or admin" on storage.objects;

create policy "driver docs upload own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'taxi-driver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "driver docs read own folder or admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'taxi-driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.taximun_is_admin()
  )
);

create policy "driver docs update own folder or admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'taxi-driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.taximun_is_admin()
  )
)
with check (
  bucket_id = 'taxi-driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.taximun_is_admin()
  )
);

create policy "driver docs delete own folder or admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'taxi-driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.taximun_is_admin()
  )
);
