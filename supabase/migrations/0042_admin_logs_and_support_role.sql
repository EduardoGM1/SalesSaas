-- ============================================================
-- Logs de administración (append-only) + rol sistema Soporte
-- + permisos ver_logs / tickets + respuestas a tickets
-- ============================================================

-- ---------- Tabla logs (append-only) ----------
create table if not exists public.logs_administracion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete restrict,
  accion text not null,
  entidad_afectada text not null,
  entidad_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  fecha timestamptz not null default now()
);

create index if not exists logs_administracion_fecha_idx
  on public.logs_administracion (fecha desc);
create index if not exists logs_administracion_usuario_idx
  on public.logs_administracion (usuario_id);
create index if not exists logs_administracion_accion_idx
  on public.logs_administracion (accion);

alter table public.logs_administracion enable row level security;

-- Sin UPDATE/DELETE policies: append-only incluso para Superadmin.
drop policy if exists "logs_admin_select" on public.logs_administracion;
create policy "logs_admin_select" on public.logs_administracion
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
      from unnest(public.resolve_user_permission_keys(auth.uid())) k
      where k = 'ver_logs_administracion'
    )
  );

-- Insert solo vía security definer (no policy INSERT para authenticated).

create or replace function public.insert_admin_log(
  p_usuario_id uuid,
  p_accion text,
  p_entidad_afectada text,
  p_entidad_id uuid,
  p_detalle jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_usuario_id is null or coalesce(trim(p_accion), '') = '' then
    raise exception 'Log inválido';
  end if;

  -- Solo el propio actor (sesión) o service_role / admin puede insertar.
  if auth.uid() is not null
     and auth.uid() <> p_usuario_id
     and not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  insert into public.logs_administracion (usuario_id, accion, entidad_afectada, entidad_id, detalle)
  values (
    p_usuario_id,
    trim(p_accion),
    coalesce(nullif(trim(p_entidad_afectada), ''), 'desconocido'),
    p_entidad_id,
    coalesce(p_detalle, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_admin_log(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.insert_admin_log(uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.insert_admin_log(uuid, text, text, uuid, jsonb) to service_role;

-- ---------- Respuestas a tickets ----------
create table if not exists public.support_request_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_requests(id) on delete cascade,
  autor_id uuid not null references public.profiles(id) on delete restrict,
  cuerpo text not null check (char_length(trim(cuerpo)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_request_replies_ticket_idx
  on public.support_request_replies (ticket_id, created_at desc);

alter table public.support_request_replies enable row level security;

drop policy if exists "support_replies_select_owner_or_admin" on public.support_request_replies;
create policy "support_replies_select_owner_or_admin" on public.support_request_replies
  for select to authenticated
  using (
    autor_id = auth.uid()
    or exists (
      select 1 from public.support_requests sr
      where sr.id = ticket_id and sr.user_id = auth.uid()
    )
    or public.is_admin()
  );

-- Insert vía API (service role / RPC); sin INSERT policy para client directo.
drop policy if exists "support_replies_insert_admin" on public.support_request_replies;
create policy "support_replies_insert_admin" on public.support_request_replies
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and public.is_admin()
  );

do $$
declare
  t text := 'support_request_replies';
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = t
  ) then
    execute format('alter publication supabase_realtime add table public.%I', t);
  end if;
end $$;

-- ---------- Nuevos permisos ----------
insert into public.permisos (clave, nombre_visible, modulo, capa) values
  ('ver_logs_administracion', 'Ver logs de administración', 'admin', 'admin'),
  ('ver_tickets_soporte', 'Ver tickets de soporte', 'admin', 'admin'),
  ('responder_tickets_soporte', 'Responder tickets de soporte', 'admin', 'admin')
on conflict (clave) do nothing;

-- Rol sistema Soporte
insert into public.roles (id, nombre, slug, es_sistema)
values ('a0000000-0000-4000-8000-000000000004', 'Soporte', 'soporte', true)
on conflict (slug) do nothing;

-- Soporte: base app (vendedor) + ver/responder tickets (sin resto del panel)
insert into public.rol_permisos (rol_id, permiso_id)
select 'a0000000-0000-4000-8000-000000000004', p.id
from public.permisos p
where (
  (p.capa = 'app' and p.clave not like '%:ver_equipo')
  or p.clave in ('ver_tickets_soporte', 'responder_tickets_soporte', 'support:read')
)
on conflict do nothing;

-- Admin sistema: tickets + responder (además de support:read legacy)
insert into public.rol_permisos (rol_id, permiso_id)
select 'a0000000-0000-4000-8000-000000000002', p.id
from public.permisos p
where p.clave in ('ver_tickets_soporte', 'responder_tickets_soporte')
on conflict do nothing;

-- Superadmin: todos los nuevos
insert into public.rol_permisos (rol_id, permiso_id)
select 'a0000000-0000-4000-8000-000000000001', p.id
from public.permisos p
where p.clave in ('ver_logs_administracion', 'ver_tickets_soporte', 'responder_tickets_soporte')
on conflict do nothing;

-- Migrar admin_permissions legacy support:read → nuevas claves en perfiles
update public.profiles p
set admin_permissions = (
  select coalesce(array_agg(distinct x), '{}')
  from unnest(
    p.admin_permissions
    || case when 'support:read' = any (p.admin_permissions)
         then array['ver_tickets_soporte', 'responder_tickets_soporte']
         else '{}'::text[]
       end
  ) x
)
where p.role = 'admin'
  and p.is_super_admin is not true
  and 'support:read' = any (coalesce(p.admin_permissions, '{}'));

-- Actualizar sync legacy para incluir nuevas claves admin
create or replace function public.sync_profile_legacy_permissions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys text[];
  v_has_admin boolean;
  v_sales text[];
  v_admin text[];
begin
  v_keys := public.resolve_user_permission_keys(p_user_id);

  v_has_admin := exists (
    select 1 from unnest(v_keys) k
    where k in (
      'dashboard:read','users:read','users:deactivate','users:activate','users:export',
      'users:role','users:permissions','goals:read','tools:analytics',
      'support:read','ver_tickets_soporte','responder_tickets_soporte',
      'ver_logs_administracion','admin:roles'
    )
  );

  select coalesce(array_agg(k), '{}') into v_sales
  from unnest(v_keys) k
  where k in ('sales:view_modal','sales:view_detail','sales:history');

  if cardinality(v_sales) = 3 then
    v_sales := '{}';
  end if;

  select coalesce(array_agg(k), '{}') into v_admin
  from unnest(v_keys) k
  where k in (
    'dashboard:read','users:read','users:deactivate','users:activate','users:export',
    'goals:read','tools:analytics','support:read',
    'ver_tickets_soporte','responder_tickets_soporte','ver_logs_administracion'
  );

  update public.profiles
  set
    role = case
      when is_super_admin then 'admin'::public.user_role
      when v_has_admin then 'admin'::public.user_role
      else 'vendedor'::public.user_role
    end,
    user_permissions = v_sales,
    admin_permissions = case
      when is_super_admin then '{}'::text[]
      when v_has_admin then v_admin
      else '{}'::text[]
    end
  where id = p_user_id;
end;
$$;

-- Bloquear slug soporte en creación de roles custom
create or replace function public.admin_create_role(p_nombre text, p_permission_keys text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  v_slug := lower(regexp_replace(trim(p_nombre), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' or v_slug in ('superadmin', 'admin', 'vendedor', 'soporte') then
    raise exception 'Nombre de rol inválido';
  end if;

  insert into public.roles (nombre, slug, es_sistema, creado_por)
  values (trim(p_nombre), v_slug, false, auth.uid())
  returning id into v_id;

  insert into public.rol_permisos (rol_id, permiso_id)
  select v_id, p.id
  from public.permisos p
  where p.clave = any (coalesce(p_permission_keys, '{}'));

  return v_id;
end;
$$;

-- RPC listado de logs (solo quien pueda ver)
create or replace function public.admin_list_logs(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_id uuid default null,
  p_accion text default null,
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can boolean;
  v_limit int;
  v_offset int;
  v_items jsonb;
  v_total int;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  v_can := public.is_super_admin()
    or exists (
      select 1 from unnest(public.resolve_user_permission_keys(auth.uid())) k
      where k = 'ver_logs_administracion'
    );
  if not v_can then
    raise exception 'No autorizado';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  select count(*)::int into v_total
  from public.logs_administracion l
  where (p_from is null or l.fecha >= p_from)
    and (p_to is null or l.fecha <= p_to)
    and (p_actor_id is null or l.usuario_id = p_actor_id)
    and (p_accion is null or p_accion = '' or l.accion = p_accion);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  into v_items
  from (
    select
      l.id,
      l.usuario_id,
      coalesce(pr.full_name, pr.email, 'Usuario') as actor_nombre,
      pr.email as actor_email,
      l.accion,
      l.entidad_afectada,
      l.entidad_id,
      l.detalle,
      l.fecha
    from public.logs_administracion l
    left join public.profiles pr on pr.id = l.usuario_id
    where (p_from is null or l.fecha >= p_from)
      and (p_to is null or l.fecha <= p_to)
      and (p_actor_id is null or l.usuario_id = p_actor_id)
      and (p_accion is null or p_accion = '' or l.accion = p_accion)
    order by l.fecha desc
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

grant execute on function public.admin_list_logs(timestamptz, timestamptz, uuid, text, int, int) to authenticated;

comment on table public.logs_administracion is 'Auditoría admin append-only; sin UPDATE/DELETE.';
comment on table public.support_request_replies is 'Respuestas de soporte a tickets; notifica al reportero.';
