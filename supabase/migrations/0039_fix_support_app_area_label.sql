-- Hotfix: columnas de 0035 que pueden faltar si esa migración no se aplicó.
-- Idempotente; seguro correr aunque 0035 ya exista.

alter table public.support_requests
  add column if not exists app_area_label text;

alter table public.support_requests
  add column if not exists screenshot_purged_at timestamptz;

comment on column public.support_requests.app_area_label is
  'Etiqueta legible del mapa del sitio (ej. Clientes > Worksheet).';
