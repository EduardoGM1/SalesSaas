-- ============================================================
-- 0070 — Fix persistencia admin_permissions + permisos de exportación
--
-- Causa raíz: admin_set_user_permissions llamaba a
-- sync_profile_legacy_permissions, que REESCRIBÍA admin_permissions
-- desde resolve_user_permission_keys (solo rol ∪ overrides),
-- descartando lo que el Superadmin acababa de guardar.
--
-- Solución:
-- 1) sync NO pisa admin_permissions (columna gobernada por el modal).
-- 2) admin_set_user_permissions persiste claves consolidadas Y
--    sincroniza usuario_permisos_override (RBAC aditivo) para que
--    resolve_user_permission_keys las incluya.
-- 3) Catálogo: permisos independientes de exportación.
-- ============================================================

-- 1) Permisos de exportación (acciones sensibles)
insert into public.permisos (clave, nombre_visible, modulo, capa) values
  ('usuarios.export_csv', 'Exportar usuarios (CSV)', 'admin', 'admin'),
  ('logs.export_csv', 'Exportar logs (CSV)', 'admin', 'admin'),
  ('metas.export_csv', 'Exportar metas (CSV)', 'admin', 'admin'),
  ('metricas.export_csv', 'Exportar métricas (CSV)', 'admin', 'admin'),
  ('ventas.export_csv', 'Exportar ventas (CSV)', 'admin', 'admin'),
  ('soporte.export_csv', 'Exportar soporte (CSV)', 'admin', 'admin')
on conflict (clave) do update set
  nombre_visible = excluded.nombre_visible,
  modulo = excluded.modulo,
  capa = excluded.capa;

-- Superadmin recibe todos los nuevos (si el rol existe)
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where r.slug = 'superadmin'
  and r.empresa_id is null
  and p.clave in (
    'usuarios.export_csv','logs.export_csv','metas.export_csv',
    'metricas.export_csv','ventas.export_csv','soporte.export_csv'
  )
on conflict do nothing;

-- 2) sync_profile_legacy_permissions: NO sobrescribir admin_permissions
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
begin
  v_keys := public.resolve_user_permission_keys(p_user_id);

  v_has_admin := exists (
    select 1 from unnest(v_keys) k
    where k in (
      'ver_resumen','gestionar_usuarios','ver_logs','gestionar_metas','ver_metricas',
      'gestionar_soporte','gestionar_roles_permisos','ver_metricas_financieras_usuarios',
      'usuarios.export_csv','logs.export_csv','metas.export_csv',
      'metricas.export_csv','ventas.export_csv','soporte.export_csv',
      'dashboard:read','users:read','users:deactivate','users:activate','users:export',
      'users:role','users:permissions','goals:read','tools:analytics',
      'support:read','ver_tickets_soporte','responder_tickets_soporte',
      'ver_logs_administracion','admin:roles'
    )
  )
  or exists (
    select 1 from public.profiles pr
    where pr.id = p_user_id
      and coalesce(cardinality(pr.admin_permissions), 0) > 0
  );

  select coalesce(array_agg(k), '{}') into v_sales
  from unnest(v_keys) k
  where k in ('sales:view_modal','sales:view_detail','sales:history');

  if cardinality(v_sales) = 3 then
    v_sales := '{}';
  end if;

  -- Importante: admin_permissions se gestiona vía admin_set_user_permissions / modal.
  -- No se regenera aquí (evita perder checkboxes al guardar).
  update public.profiles
  set
    role = case
      when is_super_admin then 'admin'::public.user_role
      when v_has_admin then 'admin'::public.user_role
      else 'vendedor'::public.user_role
    end,
    user_permissions = v_sales
  where id = p_user_id;
end;
$$;

-- 3) admin_set_user_permissions: persistir + overrides aditivos
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
    'dashboard:read', 'users:read', 'users:deactivate', 'users:activate', 'users:export',
    'goals:read', 'tools:analytics'
  ];
  v_section text[] := array[
    'ver_resumen', 'gestionar_usuarios', 'gestionar_metas', 'ver_metricas', 'gestionar_soporte',
    'usuarios.export_csv', 'logs.export_csv', 'metas.export_csv',
    'metricas.export_csv', 'ventas.export_csv', 'soporte.export_csv'
  ];
  v_clean text[];
  v_mapped text[];
  v_target_role public.user_role;
  v_target_super boolean;
  v_perm record;
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
      when p in ('users:read','users:deactivate','users:activate','users:export','users:role','users:permissions') then 'gestionar_usuarios'
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

  -- Overrides: conservar grants que NO son de sección/export admin; reemplazar los de sección.
  select coalesce(jsonb_agg(jsonb_build_object('clave', p.clave, 'otorgado', true)), '[]'::jsonb)
  into v_keep
  from public.usuario_permisos_override o
  join public.permisos p on p.id = o.permiso_id
  where o.usuario_id = p_target_id
    and o.otorgado = true
    and p.clave <> all(v_section);

  -- Añadir los seleccionados
  select coalesce(
    v_keep || coalesce(
      (select jsonb_agg(jsonb_build_object('clave', x, 'otorgado', true))
       from unnest(coalesce(v_mapped, '{}'::text[])) x),
      '[]'::jsonb
    ),
    '[]'::jsonb
  ) into v_keep;

  perform public.admin_set_user_permission_overrides(p_target_id, v_keep);

  -- Sync ligero: role/user_permissions sin pisar admin_permissions
  perform public.sync_profile_legacy_permissions(p_target_id);
end;
$$;

grant execute on function public.sync_profile_legacy_permissions(uuid) to authenticated;
grant execute on function public.admin_set_user_permissions(uuid, text[]) to authenticated;

comment on function public.admin_set_user_permissions(uuid, text[]) is
  'Persiste permisos admin delegados (secciones + export) en profiles.admin_permissions y usuario_permisos_override. No pisa la selección vía sync.';
