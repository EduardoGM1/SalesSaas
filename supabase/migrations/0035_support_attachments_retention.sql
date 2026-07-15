-- Soporte: bucket dedicado, etiqueta de área, retención de adjuntos, acceso admin.
-- Las imágenes siguen en Storage (solo path en DB), nunca como blob.

-- Etiqueta legible del mapa del sitio (ej. "Clientes > Worksheet").
alter table public.support_requests
  add column if not exists app_area_label text;

-- Ampliar descripción (meta ya no va embebida; margen por textos legacy).
alter table public.support_requests
  drop constraint if exists support_requests_description_check;

alter table public.support_requests
  add constraint support_requests_description_check
  check (char_length(trim(description)) >= 10 and char_length(description) <= 1500);

-- Marca de purga de adjunto (el ticket histórico permanece).
alter table public.support_requests
  add column if not exists screenshot_purged_at timestamptz;

-- Bucket dedicado (privado). Límite 5 MB por objeto (post-compresión en cliente suele ser << 1 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'soporte-adjuntos',
  'soporte-adjuntos',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

-- Usuarios: subir/leer/borrar solo su carpeta {user_id}/...
drop policy if exists "Users upload own support attachments" on storage.objects;
create policy "Users upload own support attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'soporte-adjuntos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users read own support attachments" on storage.objects;
create policy "Users read own support attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'soporte-adjuntos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own support attachments" on storage.objects;
create policy "Users delete own support attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'soporte-adjuntos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins: leer todos los adjuntos de soporte (panel).
drop policy if exists "Admins read support attachments" on storage.objects;
create policy "Admins read support attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('soporte-adjuntos', 'support-screenshots')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_super_admin = true or p.role = 'admin')
    )
  );

-- Admins: actualizar estado de tickets.
drop policy if exists "Admins update support requests" on public.support_requests;
create policy "Admins update support requests"
  on public.support_requests for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_super_admin = true or p.role = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_super_admin = true or p.role = 'admin')
    )
  );

grant update on public.support_requests to authenticated;

create index if not exists support_requests_retention_idx
  on public.support_requests (status, updated_at)
  where screenshot_path is not null and screenshot_purged_at is null;

comment on column public.support_requests.screenshot_path is
  'Ruta en bucket soporte-adjuntos (o legacy support-screenshots). Nunca blob en Postgres.';
comment on column public.support_requests.screenshot_purged_at is
  'Cuando el cron elimina el objeto del Storage tras retención (ticket resuelto/cerrado).';
