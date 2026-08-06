-- ============================================================
-- 0074 — Permiso sensible usuarios.gestionar_permisos + aislamiento admin↔admin
-- - Solo Superadmin puede otorgar usuarios.gestionar_permisos
-- - Admins no pueden modificar permisos/funciones/cuenta/plan/rol de otros admins
-- ============================================================

insert into public.permisos (clave, nombre_visible, modulo, capa)
values (
  'usuarios.gestionar_permisos',
  'Gestionar permisos y funciones',
  'admin',
  'admin'
)
on conflict (clave) do update
set nombre_visible = excluded.nombre_visible,
    modulo = excluded.modulo,
    capa = excluded.capa;

-- Solo Superadmin lo tiene por defecto
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where r.empresa_id is null
  and r.slug = 'superadmin'
  and p.clave = 'usuarios.gestionar_permisos'
on conflict do nothing;

-- ---------- admin_set_user_permissions: allowlist + solo Superadmin (sin cambio de auth) ----------
create or replace function public.admin_set_user_permissions(p_target_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'ver_resumen', 'gestionar_usuarios', 'gestionar_metas', 'ver_metricas', 'gestionar_soporte',
    'usuarios.export_csv', 'logs.export_csv', 'metas.export_csv',
    'metricas.export_csv', 'ventas.export_csv', 'soporte.export_csv',
    'usuarios.cambiar_plan', 'usuarios.desactivar_cuenta', 'usuarios.gestionar_permisos',
    'dashboard:read', 'users:read', 'users:deactivate', 'users:activate', 'users:export',
    'goals:read', 'tools:analytics'
  ];
  v_section text[] := array[
    'ver_resumen', 'gestionar_usuarios', 'gestionar_metas', 'ver_metricas', 'gestionar_soporte',
    'usuarios.export_csv', 'logs.export_csv', 'metas.export_csv',
    'metricas.export_csv', 'ventas.export_csv', 'soporte.export_csv',
    'usuarios.cambiar_plan', 'usuarios.desactivar_cuenta', 'usuarios.gestionar_permisos'
  ];
  v_clean text[];
  v_mapped text[];
  v_target_role public.user_role;
  v_target_super boolean;
  v_keep jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select role, is_super_admin into v_target_role, v_target_super
  from public.profiles where id = p_target_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_target_super then
    raise exception 'No puedes modificar permisos del administrador principal';
  end if;
  if v_target_role is distinct from 'admin'::public.user_role then
    raise exception 'Solo aplica a usuarios con rol admin';
  end if;

  select coalesce(array_agg(distinct p), '{}'::text[])
  into v_clean
  from unnest(coalesce(p_permissions, '{}'::text[])) as p
  where p = any(v_allowed);

  select coalesce(array_agg(distinct x), '{}'::text[])
  into v_mapped
  from (
    select case
      when p in ('dashboard:read') then 'ver_resumen'
      when p in ('users:read','users:export','users:role','users:permissions') then 'gestionar_usuarios'
      when p in ('users:deactivate','users:activate') then 'usuarios.desactivar_cuenta'
      when p in ('goals:read') then 'gestionar_metas'
      when p in ('tools:analytics','worksheets:read') then 'ver_metricas'
      else p
    end as x
    from unnest(coalesce(v_clean, '{}'::text[])) p
  ) s
  where x = any(v_section);

  update public.profiles
  set admin_permissions = coalesce(v_mapped, '{}'::text[])
  where id = p_target_id;

  select coalesce(jsonb_agg(jsonb_build_object('clave', p.clave, 'otorgado', true)), '[]'::jsonb)
  into v_keep
  from public.usuario_permisos_override o
  join public.permisos p on p.id = o.permiso_id
  where o.usuario_id = p_target_id
    and o.otorgado = true
    and p.clave <> all(v_section);

  select coalesce(
    v_keep || coalesce(
      (select jsonb_agg(jsonb_build_object('clave', x, 'otorgado', true))
       from unnest(coalesce(v_mapped, '{}'::text[])) x),
      '[]'::jsonb
    ),
    '[]'::jsonb
  ) into v_keep;

  perform public.admin_set_user_permission_overrides(p_target_id, v_keep);
  perform public.sync_profile_legacy_permissions(p_target_id);
end;
$$;

-- ---------- Desactivar/activar: no entre admins (salvo Superadmin) ----------
create or replace function public.admin_set_user_active(p_target_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target_super boolean;
  v_target_role public.user_role;
begin
  if v_caller is null then
    raise exception 'No autenticado';
  end if;

  select is_super_admin, role into v_target_super, v_target_role
  from public.profiles where id = p_target_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  if v_target_super and not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  -- Aislamiento: un Admin no puede desactivar/activar a otro Admin.
  if v_target_role = 'admin'::public.user_role and not public.is_super_admin() then
    raise exception 'Los administradores no pueden desactivar o activar a otros administradores';
  end if;

  if not (
    public.is_super_admin()
    or public.has_admin_permission('usuarios.desactivar_cuenta')
  ) then
    raise exception 'No autorizado';
  end if;

  if not p_active and p_target_id = v_caller then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;

  update public.profiles set is_active = p_active where id = p_target_id;
end;
$$;

-- ---------- Cambio de rol: no entre admins (salvo Superadmin) ----------
create or replace function public.admin_update_user_role(p_target_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target_super boolean;
  v_target_role public.user_role;
begin
  if v_caller is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.is_super_admin()
    or public.has_admin_permission('gestionar_usuarios')
  ) then
    raise exception 'No autorizado';
  end if;

  select is_super_admin, role into v_target_super, v_target_role
  from public.profiles where id = p_target_id;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  if v_target_super and p_role is distinct from 'admin'::public.user_role then
    raise exception 'No puedes quitar el rol al administrador principal';
  end if;

  if v_target_super and not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  if v_target_role = 'admin'::public.user_role and not public.is_super_admin() then
    raise exception 'Los administradores no pueden cambiar el rol de otros administradores';
  end if;

  if p_role = 'admin'::public.user_role and not public.is_super_admin() then
    raise exception 'Solo el Superadmin puede otorgar el rol Admin';
  end if;

  if p_target_id = v_caller and p_role is distinct from 'admin'::public.user_role then
    raise exception 'No puedes quitarte el rol de administrador';
  end if;

  update public.profiles
  set
    role = p_role,
    admin_permissions = case when p_role = 'admin'::public.user_role then admin_permissions else '{}'::text[] end,
    is_super_admin = case when p_role = 'admin'::public.user_role then is_super_admin else false end
  where id = p_target_id;
end;
$$;

-- ---------- Features: Superadmin o usuarios.gestionar_permisos; nunca admin↔admin ----------
create or replace function public.admin_set_user_features(p_target_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'sales:view_modal', 'sales:view_detail', 'sales:history'
  ];
  v_clean text[];
  v_target_role public.user_role;
  v_target_super boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.is_super_admin()
    or public.has_admin_permission('usuarios.gestionar_permisos')
  ) then
    raise exception 'No autorizado';
  end if;

  select role, is_super_admin into v_target_role, v_target_super
  from public.profiles where id = p_target_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  if v_target_super then
    raise exception 'No puedes modificar permisos del administrador principal';
  end if;

  if v_target_role = 'admin'::public.user_role then
    raise exception 'Los administradores no pueden modificar funciones de otros administradores';
  end if;

  select coalesce(array_agg(distinct p), '{}'::text[])
  into v_clean
  from unnest(coalesce(p_permissions, '{}'::text[])) as p
  where p = any(v_allowed);

  update public.profiles
  set user_permissions = coalesce(v_clean, '{}'::text[])
  where id = p_target_id;
end;
$$;

-- ---------- Overrides: Superadmin o usuarios.gestionar_permisos (nunca admin↔admin) ----------
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
  v_target_role public.user_role;
  rec jsonb;
  v_clave text;
  v_otorgado boolean;
  v_permiso_id uuid;
  v_feature_only text[] := array[
    'sales:view_modal', 'sales:view_detail', 'sales:history',
    'herramientas:survey', 'herramientas:survey_configurar_preguntas',
    'herramientas:vacaciones', 'herramientas:worksheet', 'herramientas:analysis'
  ];
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    public.is_super_admin()
    or public.has_admin_permission('usuarios.gestionar_permisos')
  ) then
    raise exception 'No autorizado';
  end if;

  select is_super_admin, role into v_target_super, v_target_role
  from public.profiles where id = p_target_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_target_super then raise exception 'No puedes modificar overrides del Superadmin'; end if;

  -- Admins no pueden tocar overrides de otros admins; Superadmin sí.
  if v_target_role = 'admin'::public.user_role and not public.is_super_admin() then
    raise exception 'Los administradores no pueden modificar permisos o funciones de otros administradores';
  end if;

  if public.is_super_admin() then
    delete from public.usuario_permisos_override where usuario_id = p_target_id;
  else
    -- Delegado: solo reemplaza features de app; conserva el resto.
    delete from public.usuario_permisos_override o
    using public.permisos p
    where o.usuario_id = p_target_id
      and o.permiso_id = p.id
      and p.clave = any(v_feature_only);
  end if;

  for rec in select * from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb))
  loop
    v_clave := rec->>'clave';
    v_otorgado := coalesce((rec->>'otorgado')::boolean, false);

    -- Delegados solo pueden escribir features de app (no permisos de panel).
    if not public.is_super_admin() and not (v_clave = any(v_feature_only)) then
      continue;
    end if;

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

comment on function public.admin_set_user_active(uuid, boolean) is
  'Activa/desactiva cuentas. Admins no pueden actuar sobre otros admins; Superadmin sí.';
comment on function public.admin_update_user_role(uuid, public.user_role) is
  'Cambia rol. Admins no pueden modificar a otros admins; solo Superadmin otorga Admin.';
comment on function public.admin_set_user_features(uuid, text[]) is
  'Funciones de app. Requiere usuarios.gestionar_permisos o Superadmin; no aplica entre admins.';
comment on function public.admin_set_user_permission_overrides(uuid, jsonb) is
  'Overrides por usuario. Superadmin completo; con usuarios.gestionar_permisos solo features de app y no sobre admins.';