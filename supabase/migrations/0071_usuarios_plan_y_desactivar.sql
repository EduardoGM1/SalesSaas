-- ============================================================
-- 0071 — Permisos sensibles: cambiar plan y desactivar cuenta
--
-- Independientes de gestionar_usuarios. Solo Superadmin puede
-- asignarlos (admin_set_user_permissions ya exige is_super_admin).
-- ============================================================

insert into public.permisos (clave, nombre_visible, modulo, capa) values
  ('usuarios.cambiar_plan', 'Cambiar plan de usuario', 'admin', 'admin'),
  ('usuarios.desactivar_cuenta', 'Desactivar / activar cuentas', 'admin', 'admin')
on conflict (clave) do update set
  nombre_visible = excluded.nombre_visible,
  modulo = excluded.modulo,
  capa = excluded.capa;

-- Superadmin recibe ambos
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where r.slug = 'superadmin'
  and r.empresa_id is null
  and p.clave in ('usuarios.cambiar_plan', 'usuarios.desactivar_cuenta')
on conflict do nothing;

-- sync: reconocer las nuevas claves como admin
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
      'usuarios.cambiar_plan','usuarios.desactivar_cuenta',
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

-- admin_set_user_permissions: incluir nuevas claves en allowlist + sección
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
    'usuarios.cambiar_plan', 'usuarios.desactivar_cuenta',
    'dashboard:read', 'users:read', 'users:deactivate', 'users:activate', 'users:export',
    'goals:read', 'tools:analytics'
  ];
  v_section text[] := array[
    'ver_resumen', 'gestionar_usuarios', 'gestionar_metas', 'ver_metricas', 'gestionar_soporte',
    'usuarios.export_csv', 'logs.export_csv', 'metas.export_csv',
    'metricas.export_csv', 'ventas.export_csv', 'soporte.export_csv',
    'usuarios.cambiar_plan', 'usuarios.desactivar_cuenta'
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

grant execute on function public.sync_profile_legacy_permissions(uuid) to authenticated;
grant execute on function public.admin_set_user_permissions(uuid, text[]) to authenticated;

comment on function public.admin_set_user_permissions(uuid, text[]) is
  'Persiste permisos admin delegados (secciones + export + plan/desactivar) en profiles.admin_permissions y overrides. Solo Superadmin.';

-- has_admin_permission: desactivar ya no va con gestionar_usuarios
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

  select admin_permissions into v_perms
  from public.profiles
  where id = auth.uid();

  if v_perms is null then
    return false;
  end if;

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
      'gestionar_soporte','ver_tickets_soporte','responder_tickets_soporte','support:read'
    )
      then array[
        'gestionar_soporte','ver_tickets_soporte','responder_tickets_soporte','support:read'
      ]
    when perm in ('gestionar_roles_permisos','admin:roles')
      then array['gestionar_roles_permisos','admin:roles']
    else array[perm]
  end;

  return exists (
    select 1 from unnest(v_group) g where g = any(v_perms)
  );
end;
$$;

grant execute on function public.has_admin_permission(text) to anon, authenticated, service_role;

-- RPC desactivar/activar: exige el permiso sensible (equiv. legacy incluida)
create or replace function public.admin_set_user_active(p_target_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target_super boolean;
begin
  if v_caller is null then
    raise exception 'No autenticado';
  end if;

  select is_super_admin into v_target_super
  from public.profiles where id = p_target_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  if v_target_super and not public.is_super_admin() then
    raise exception 'No autorizado';
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

grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;