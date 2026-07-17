-- ============================================================
-- Fase 2: catálogo de roles / permisos / overrides por usuario
-- ============================================================

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  es_sistema boolean not null default false,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.permisos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre_visible text not null,
  modulo text not null,
  capa text not null check (capa in ('app', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.rol_permisos (
  rol_id uuid not null references public.roles(id) on delete cascade,
  permiso_id uuid not null references public.permisos(id) on delete cascade,
  primary key (rol_id, permiso_id)
);

create table if not exists public.usuario_permisos_override (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  permiso_id uuid not null references public.permisos(id) on delete cascade,
  otorgado boolean not null,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, permiso_id)
);

alter table public.profiles
  add column if not exists role_id uuid references public.roles(id) on delete set null;

create index if not exists profiles_role_id_idx on public.profiles (role_id);
create index if not exists rol_permisos_permiso_idx on public.rol_permisos (permiso_id);
create index if not exists usuario_permisos_override_permiso_idx on public.usuario_permisos_override (permiso_id);

-- ---------- Seed roles sistema ----------
insert into public.roles (id, nombre, slug, es_sistema)
values
  ('a0000000-0000-4000-8000-000000000001', 'Superadmin', 'superadmin', true),
  ('a0000000-0000-4000-8000-000000000002', 'Admin', 'admin', true),
  ('a0000000-0000-4000-8000-000000000003', 'Vendedor', 'vendedor', true)
on conflict (slug) do nothing;

-- ---------- Seed permisos ----------
insert into public.permisos (clave, nombre_visible, modulo, capa) values
  ('expedientes:ver_propios', 'Ver expedientes propios', 'expedientes', 'app'),
  ('expedientes:crear', 'Crear expedientes', 'expedientes', 'app'),
  ('expedientes:editar', 'Editar expedientes', 'expedientes', 'app'),
  ('expedientes:eliminar', 'Eliminar expedientes', 'expedientes', 'app'),
  ('expedientes:compartir', 'Compartir expedientes', 'expedientes', 'app'),
  ('expedientes:ver_equipo', 'Ver expedientes del equipo', 'expedientes', 'app'),
  ('herramientas:survey', 'Usar Survey', 'herramientas', 'app'),
  ('herramientas:vacaciones', 'Usar Proyección de Vacaciones', 'herramientas', 'app'),
  ('herramientas:worksheet', 'Usar Worksheet', 'herramientas', 'app'),
  ('herramientas:analysis', 'Usar Analysis', 'herramientas', 'app'),
  ('ventas:registrar', 'Registrar ventas', 'ventas', 'app'),
  ('ventas:editar', 'Editar ventas', 'ventas', 'app'),
  ('ventas:cancelar', 'Cancelar ventas', 'ventas', 'app'),
  ('sales:view_modal', 'Ver modal de venta', 'ventas', 'app'),
  ('sales:view_detail', 'Ver detalle ampliado de venta', 'ventas', 'app'),
  ('sales:history', 'Acceso a historial de ventas', 'ventas', 'app'),
  ('ventas:ver_equipo', 'Ver ventas de otros vendedores', 'ventas', 'app'),
  ('dashboard:ver_propio', 'Ver dashboard propio', 'dashboard', 'app'),
  ('dashboard:ver_equipo', 'Ver dashboard del equipo', 'dashboard', 'app'),
  ('agenda:usar', 'Usar agenda', 'dashboard', 'app'),
  ('metas:ver_editar_propias', 'Ver y editar metas propias', 'dashboard', 'app'),
  ('metas:ver_equipo', 'Ver metas del equipo', 'dashboard', 'app'),
  ('red:usar', 'Usar red de contactos', 'red', 'app'),
  ('mensajes:usar', 'Usar mensajería', 'red', 'app'),
  ('notificaciones:configurar_propias', 'Configurar notificaciones propias', 'config', 'app'),
  ('config:propia', 'Configuración propia', 'config', 'app'),
  ('dashboard:read', 'Admin: ver resumen', 'admin', 'admin'),
  ('users:read', 'Admin: ver usuarios', 'admin', 'admin'),
  ('users:deactivate', 'Admin: desactivar cuentas', 'admin', 'admin'),
  ('users:activate', 'Admin: activar cuentas', 'admin', 'admin'),
  ('users:export', 'Admin: exportar usuarios', 'admin', 'admin'),
  ('users:role', 'Admin: cambiar rol / plan', 'admin', 'admin'),
  ('users:permissions', 'Admin: editar permisos', 'admin', 'admin'),
  ('goals:read', 'Admin: ver metas globales', 'admin', 'admin'),
  ('tools:analytics', 'Admin: analytics de herramientas', 'admin', 'admin'),
  ('support:read', 'Admin: ver soporte', 'admin', 'admin'),
  ('admin:roles', 'Admin: gestionar roles', 'admin', 'admin')
on conflict (clave) do nothing;

-- Vendedor: app sin ver_equipo
insert into public.rol_permisos (rol_id, permiso_id)
select 'a0000000-0000-4000-8000-000000000003', p.id
from public.permisos p
where p.capa = 'app'
  and p.clave not like '%:ver_equipo'
on conflict do nothing;

-- Admin: app vendedor + admin delegables
insert into public.rol_permisos (rol_id, permiso_id)
select 'a0000000-0000-4000-8000-000000000002', p.id
from public.permisos p
where (
  (p.capa = 'app' and p.clave not like '%:ver_equipo')
  or p.clave in (
    'dashboard:read', 'users:read', 'users:deactivate', 'users:activate',
    'users:export', 'goals:read', 'tools:analytics', 'support:read'
  )
)
on conflict do nothing;

-- Superadmin role rows: all permissions (resolver also short-circuits)
insert into public.rol_permisos (rol_id, permiso_id)
select 'a0000000-0000-4000-8000-000000000001', p.id
from public.permisos p
on conflict do nothing;

-- ---------- Backfill profiles.role_id ----------
update public.profiles
set role_id = 'a0000000-0000-4000-8000-000000000002'
where role = 'admin'::public.user_role
  and role_id is null;

update public.profiles
set role_id = 'a0000000-0000-4000-8000-000000000003'
where role is distinct from 'admin'::public.user_role
  and role_id is null;

-- Migrar user_permissions allowlist → overrides deny para sales faltantes
insert into public.usuario_permisos_override (usuario_id, permiso_id, otorgado)
select
  pr.id,
  pe.id,
  false
from public.profiles pr
cross join public.permisos pe
where coalesce(cardinality(pr.user_permissions), 0) > 0
  and pe.clave in ('sales:view_modal', 'sales:view_detail', 'sales:history')
  and not (pe.clave = any (pr.user_permissions))
on conflict do nothing;

-- ---------- RLS ----------
alter table public.roles enable row level security;
alter table public.permisos enable row level security;
alter table public.rol_permisos enable row level security;
alter table public.usuario_permisos_override enable row level security;

drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_authenticated" on public.roles
  for select to authenticated using (true);

drop policy if exists "permisos_select_authenticated" on public.permisos;
create policy "permisos_select_authenticated" on public.permisos
  for select to authenticated using (true);

drop policy if exists "rol_permisos_select_authenticated" on public.rol_permisos;
create policy "rol_permisos_select_authenticated" on public.rol_permisos
  for select to authenticated using (true);

drop policy if exists "overrides_select_own_or_admin" on public.usuario_permisos_override;
create policy "overrides_select_own_or_admin" on public.usuario_permisos_override
  for select to authenticated using (
    usuario_id = auth.uid()
    or public.is_super_admin()
  );

-- ---------- Helper: resolve keys ----------
create or replace function public.resolve_user_permission_keys(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_super boolean;
  v_role_id uuid;
  v_keys text[];
begin
  select is_super_admin, role_id into v_super, v_role_id
  from public.profiles where id = p_user_id;

  if not found then
    return '{}';
  end if;

  if v_super then
    select coalesce(array_agg(clave order by clave), '{}') into v_keys from public.permisos;
    return v_keys;
  end if;

  select coalesce(array_agg(distinct p.clave), '{}')
  into v_keys
  from public.rol_permisos rp
  join public.permisos p on p.id = rp.permiso_id
  where rp.rol_id = v_role_id;

  -- apply overrides
  v_keys := coalesce(v_keys, '{}');

  -- grants
  select coalesce(array_agg(distinct x), v_keys)
  into v_keys
  from (
    select unnest(v_keys) as x
    union
    select p.clave
    from public.usuario_permisos_override o
    join public.permisos p on p.id = o.permiso_id
    where o.usuario_id = p_user_id and o.otorgado = true
  ) s;

  -- denies
  select coalesce(array_agg(x), '{}')
  into v_keys
  from (
    select unnest(v_keys) as x
    except
    select p.clave
    from public.usuario_permisos_override o
    join public.permisos p on p.id = o.permiso_id
    where o.usuario_id = p_user_id and o.otorgado = false
  ) d;

  return coalesce(v_keys, '{}');
end;
$$;

grant execute on function public.resolve_user_permission_keys(uuid) to authenticated;

-- Sync legacy arrays from resolved keys
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
      'users:role','users:permissions','goals:read','tools:analytics','support:read','admin:roles'
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
    'goals:read','tools:analytics','support:read'
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

grant execute on function public.sync_profile_legacy_permissions(uuid) to authenticated;

-- ---------- Admin RPCs ----------
create or replace function public.admin_list_roles()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'nombre', r.nombre,
      'slug', r.slug,
      'es_sistema', r.es_sistema,
      'created_at', r.created_at,
      'permission_keys', coalesce((
        select jsonb_agg(p.clave order by p.clave)
        from public.rol_permisos rp
        join public.permisos p on p.id = rp.permiso_id
        where rp.rol_id = r.id
      ), '[]'::jsonb)
    ) order by r.es_sistema desc, r.nombre)
    from public.roles r
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_roles() to authenticated;

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
  if v_slug = '' or v_slug in ('superadmin', 'admin', 'vendedor') then
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

grant execute on function public.admin_create_role(text, text[]) to authenticated;

create or replace function public.admin_update_role_permissions(p_rol_id uuid, p_nombre text, p_permission_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema boolean;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select es_sistema into v_sistema from public.roles where id = p_rol_id;
  if not found then raise exception 'Rol no encontrado'; end if;

  if p_nombre is not null and trim(p_nombre) <> '' and v_sistema = false then
    update public.roles set nombre = trim(p_nombre) where id = p_rol_id;
  end if;

  -- System roles: allow updating permission set except superadmin slug
  if exists (select 1 from public.roles where id = p_rol_id and slug = 'superadmin') then
    raise exception 'No se pueden editar permisos del rol Superadmin';
  end if;

  delete from public.rol_permisos where rol_id = p_rol_id;
  insert into public.rol_permisos (rol_id, permiso_id)
  select p_rol_id, p.id
  from public.permisos p
  where p.clave = any (coalesce(p_permission_keys, '{}'));

  -- Resync users with this role
  perform public.sync_profile_legacy_permissions(pr.id)
  from public.profiles pr
  where pr.role_id = p_rol_id;
end;
$$;

grant execute on function public.admin_update_role_permissions(uuid, text, text[]) to authenticated;

create or replace function public.admin_delete_role(p_rol_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema boolean;
  v_vendedor uuid := 'a0000000-0000-4000-8000-000000000003';
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select es_sistema into v_sistema from public.roles where id = p_rol_id;
  if not found then raise exception 'Rol no encontrado'; end if;
  if v_sistema then raise exception 'No se pueden eliminar roles de sistema'; end if;

  update public.profiles set role_id = v_vendedor where role_id = p_rol_id;
  perform public.sync_profile_legacy_permissions(pr.id)
  from public.profiles pr where pr.role_id = v_vendedor;

  delete from public.roles where id = p_rol_id;
end;
$$;

grant execute on function public.admin_delete_role(uuid) to authenticated;

create or replace function public.admin_set_user_role_id(p_target_id uuid, p_rol_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_target_super boolean;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select is_super_admin into v_target_super from public.profiles where id = p_target_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_target_super then raise exception 'No puedes cambiar el rol del Superadmin'; end if;

  select slug into v_slug from public.roles where id = p_rol_id;
  if not found then raise exception 'Rol no encontrado'; end if;
  if v_slug = 'superadmin' then raise exception 'Asigna Superadmin solo vía flag de sistema'; end if;

  update public.profiles set role_id = p_rol_id where id = p_target_id;
  perform public.sync_profile_legacy_permissions(p_target_id);
end;
$$;

grant execute on function public.admin_set_user_role_id(uuid, uuid) to authenticated;

create or replace function public.admin_set_user_permission_overrides(
  p_target_id uuid,
  p_overrides jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_super boolean;
  rec jsonb;
  v_clave text;
  v_otorgado boolean;
  v_permiso_id uuid;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select is_super_admin into v_target_super from public.profiles where id = p_target_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_target_super then raise exception 'No puedes modificar overrides del Superadmin'; end if;

  delete from public.usuario_permisos_override where usuario_id = p_target_id;

  for rec in select * from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb))
  loop
    v_clave := rec->>'clave';
    v_otorgado := coalesce((rec->>'otorgado')::boolean, false);
    select id into v_permiso_id from public.permisos where clave = v_clave;
    if v_permiso_id is not null then
      insert into public.usuario_permisos_override (usuario_id, permiso_id, otorgado)
      values (p_target_id, v_permiso_id, v_otorgado)
      on conflict (usuario_id, permiso_id) do update set otorgado = excluded.otorgado, updated_at = now();
    end if;
  end loop;

  perform public.sync_profile_legacy_permissions(p_target_id);
end;
$$;

grant execute on function public.admin_set_user_permission_overrides(uuid, jsonb) to authenticated;

comment on table public.roles is 'Roles de sistema y personalizados (Fase 2 RBAC).';
comment on table public.permisos is 'Catálogo unificado de permisos de app y admin.';
comment on table public.usuario_permisos_override is 'Overrides por usuario; otorgado=false deniega aunque el rol lo tenga.';
