-- Solicitudes de atención a usuario (Configuración → Ayuda).
create table if not exists public.support_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  request_type    text not null,
  app_area        text not null,
  platform        text not null check (platform in ('web', 'mobile')),
  description     text not null check (char_length(trim(description)) >= 10 and char_length(description) <= 1000),
  screenshot_path text,
  user_agent      text,
  app_version     text,
  status          text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists support_requests_user_idx
  on public.support_requests (user_id, created_at desc);
create index if not exists support_requests_status_idx
  on public.support_requests (status, created_at desc);

create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

alter table public.support_requests enable row level security;

drop policy if exists "Users insert own support requests" on public.support_requests;
create policy "Users insert own support requests"
  on public.support_requests for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users read own support requests" on public.support_requests;
create policy "Users read own support requests"
  on public.support_requests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins read all support requests" on public.support_requests;
create policy "Admins read all support requests"
  on public.support_requests for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_super_admin = true or p.role = 'admin')
    )
  );

-- Capturas opcionales (máx. 10 MB, solo imágenes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-screenshots',
  'support-screenshots',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own support screenshots" on storage.objects;
create policy "Users upload own support screenshots"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'support-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users read own support screenshots" on storage.objects;
create policy "Users read own support screenshots"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own support screenshots" on storage.objects;
create policy "Users delete own support screenshots"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'support-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

grant select, insert on public.support_requests to authenticated;
grant all on public.support_requests to service_role;

comment on table public.support_requests is
  'Solicitudes de ayuda / reportes desde Configuración → Ayuda.';
