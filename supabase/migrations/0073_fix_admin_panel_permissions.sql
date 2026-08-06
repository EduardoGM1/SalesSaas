-- ============================================================
-- 0073 — Corregir permisos del panel Admin
-- 1) Rol plataforma Admin debe incluir secciones del panel
-- 2) resolve_user_permission_keys incluye profiles.admin_permissions
-- 3) has_admin_permission usa resolve aditivo (rol ∪ overrides ∪ columna)
-- ============================================================

-- ---------- 1) Seed secciones del panel en rol Admin ----------
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where r.empresa_id is null
  and r.slug = 'admin'
  and p.clave in (
    'ver_resumen',
    'gestionar_usuarios',
    'gestionar_metas',
    'ver_metricas',
    'gestionar_soporte'
  )
on conflict do nothing;

-- ---------- 2) resolve_user_permission_keys: + admin_permissions ----------
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
  v_admin_perms text[];
  v_keys text[];
begin
  select is_super_admin, role_id, coalesce(admin_permissions, '{}')
  into v_super, v_role_id, v_admin_perms
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

  v_keys := coalesce(v_keys, '{}');

  select coalesce(array_agg(distinct x), '{}')
  into v_keys
  from (
    select unnest(v_keys) as x
    union
    select p.clave
    from public.usuario_permisos_override o
    join public.permisos p on p.id = o.permiso_id
    where o.usuario_id = p_user_id and o.otorgado = true
    union
    select unnest(v_admin_perms) as x
  ) s
  where x is not null and btrim(x) <> '';

  return coalesce(v_keys, '{}');
end;
$$;

comment on function public.resolve_user_permission_keys(uuid) is
  'Permisos efectivos: rol ∪ overrides otorgados ∪ profiles.admin_permissions.';

-- ---------- 3) has_admin_permission alineado al resolve aditivo ----------
create or replace function public.has_admin_permission(perm text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_perms text[];
  v_group text[];
begin
  if public.is_super_admin() then
    return true;
  end if;

  if auth.uid() is null or perm is null then
    return false;
  end if;

  v_perms := public.resolve_user_permission_keys(auth.uid());

  if perm = any(v_perms) then
    return true;
  end if;

  v_group := case
    when perm in ('ver_resumen','dashboard:read')
      then array['ver_resumen','dashboard:read']
    when perm in (
      'gestionar_usuarios','users:read',
      'users:export','users:role','users:permissions'
    )
      then array[
        'gestionar_usuarios','users:read',
        'users:export','users:role','users:permissions'
      ]
    when perm in ('usuarios.desactivar_cuenta','users:deactivate','users:activate')
      then array['usuarios.desactivar_cuenta','users:deactivate','users:activate']
    when perm in ('usuarios.cambiar_plan')
      then array['usuarios.cambiar_plan']
    when perm in ('ver_logs','ver_logs_administracion')
      then array['ver_logs','ver_logs_administracion']
    when perm in ('gestionar_metas','goals:read')
      then array['gestionar_metas','goals:read']
    when perm in ('ver_metricas','tools:analytics','worksheets:read')
      then array['ver_metricas','tools:analytics','worksheets:read']
    when perm in (
      'gestionar_soporte','ver_tickets_soporte',
      'responder_tickets_soporte','support:read'
    )
      then array[
        'gestionar_soporte','ver_tickets_soporte',
        'responder_tickets_soporte','support:read'
      ]
    when perm in ('gestionar_roles_permisos','admin:roles')
      then array['gestionar_roles_permisos','admin:roles']
    when perm in (
      'usuarios.export_csv','logs.export_csv','metas.export_csv',
      'metricas.export_csv','ventas.export_csv','soporte.export_csv'
    )
      then array[perm]
    else array[perm]
  end;

  return exists (
    select 1 from unnest(v_group) g where g = any(v_perms)
  );
end;
$$;

comment on function public.has_admin_permission(text) is
  'True si el usuario efectivo (rol∪overrides∪admin_permissions) tiene el permiso o su grupo de equivalencia.';
