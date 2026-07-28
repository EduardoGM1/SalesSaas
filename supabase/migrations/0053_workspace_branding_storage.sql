-- Bucket público para logos white-label (empresa / sala).
-- No cambia el modelo de workspaces; solo Storage + policies mínimas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-branding',
  'workspace-branding',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "workspace_branding_public_read" on storage.objects;
create policy "workspace_branding_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'workspace-branding');

drop policy if exists "workspace_branding_service_write" on storage.objects;
-- Escritura vía service role (API admin); sin policy de insert para authenticated.
