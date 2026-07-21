-- =============================================================================
-- 0047 — Consolidar permisos admin (1 por sección) + renombrar Herramientas→Métricas
-- =============================================================================
--
-- AUDITORÍA (pre-migración)
-- -------------------------
-- Claves admin previas → sección:
--   Resumen:     dashboard:read
--   Usuarios:    users:read, users:deactivate, users:activate, users:export,
--                users:role, users:permissions
--                (+ ver_metricas_financieras_usuarios: dato sensible, NO es pestaña)
--   Logs:        ver_logs_administracion
--   Metas:       goals:read
--   Métricas:    tools:analytics  (antes "Herramientas")
--   Soporte:     ver_tickets_soporte, responder_tickets_soporte, support:read
--   Roles:       admin:roles
--
-- Fusión tickets: en seeds (0042) y expansiones runtime, ver_* y responder_*
-- SIEMPRE se asignan juntos. No hay rol sistema con uno sin el otro.
-- Excepción: si un rol custom tuviera solo uno, se documenta con RAISE NOTICE
-- y se otorga gestionar_soporte (unión) para no quitar acceso.
--
-- Catálogo consolidado (8 claves admin):
--   ver_resumen, gestionar_usuarios, ver_logs, gestionar_metas, ver_metricas,
--   gestionar_soporte, gestionar_roles_permisos,
--   ver_metricas_financieras_usuarios (excepción Superadmin / dato sensible)
--
-- Roles sistema tras migración:
--   Admin:    ver_resumen, gestionar_usuarios, gestionar_metas, ver_metricas, gestionar_soporte
--   Soporte:  gestionar_soporte (+ app)
--   Superadmin: todo el catálogo (sin cambio de comportamiento)
-- =============================================================================

-- 1) Insertar nuevas claves
insert into public.permisos (clave, nombre_visible, modulo, capa)
values
  ('ver_resumen', 'Ver Resumen', 'admin', 'admin'),
  ('gestionar_usuarios', 'Gestionar Usuarios', 'admin', 'admin'),
  ('ver_logs', 'Ver Logs', 'admin', 'admin'),
  ('gestionar_metas', 'Gestionar Metas', 'admin', 'admin'),
  ('ver_metricas', 'Ver Métricas', 'admin', 'admin'),
  ('gestionar_soporte', 'Gestionar Soporte', 'admin', 'admin'),
  ('gestionar_roles_permisos', 'Gestionar Roles y permisos', 'admin', 'admin')
on conflict (clave) do update
set
  nombre_visible = excluded.nombre_visible,
  modulo = excluded.modulo,
  capa = excluded.capa;

-- Actualizar nombre visible de métricas financieras
update public.permisos
set nombre_visible = 'Ver métricas financieras por usuario'
where clave = 'ver_metricas_financieras_usuarios';

-- 2) Detectar asimetría tickets (excepción documentada)
do $$
declare
  r record;
  has_ver boolean;
  has_resp boolean;
begin
  for r in select id, nombre, slug from public.roles loop
    select
      exists (
        select 1 from public.rol_permisos rp
        join public.permisos p on p.id = rp.permiso_id
        where rp.rol_id = r.id and p.clave = 'ver_tickets_soporte'
      ),
      exists (
        select 1 from public.rol_permisos rp
        join public.permisos p on p.id = rp.permiso_id
        where rp.rol_id = r.id and p.clave = 'responder_tickets_soporte'
      )
    into has_ver, has_resp;

    if has_ver is distinct from has_resp and (has_ver or has_resp) then
      raise notice
        'EXCEPCIÓN tickets asimétricos en rol % (slug=%): ver=% responder=% → se otorga gestionar_soporte (unión). Revisar manualmente si hace falta restringir respuesta.',
        r.nombre, r.slug, has_ver, has_resp;
    end if;
  end loop;
end $$;

-- 3) Mapear rol_permisos: otorgar claves nuevas según legacy
-- ver_resumen
insert into public.rol_permisos (rol_id, permiso_id)
select distinct rp.rol_id, np.id
from public.rol_permisos rp
join public.permisos op on op.id = rp.permiso_id
join public.permisos np on np.clave = 'ver_resumen'
where op.clave = 'dashboard:read'
on conflict do nothing;

-- gestionar_usuarios (cualquier acción de usuarios)
insert into public.rol_permisos (rol_id, permiso_id)
select distinct rp.rol_id, np.id
from public.rol_permisos rp
join public.permisos op on op.id = rp.permiso_id
join public.permisos np on np.clave = 'gestionar_usuarios'
where op.clave in (
  'users:read','users:deactivate','users:activate','users:export',
  'users:role','users:permissions'
)
on conflict do nothing;

-- ver_logs
insert into public.rol_permisos (rol_id, permiso_id)
select distinct rp.rol_id, np.id
from public.rol_permisos rp
join public.permisos op on op.id = rp.permiso_id
join public.permisos np on np.clave = 'ver_logs'
where op.clave = 'ver_logs_administracion'
on conflict do nothing;

-- gestionar_metas
insert into public.rol_permisos (rol_id, permiso_id)
select distinct rp.rol_id, np.id
from public.rol_permisos rp
join public.permisos op on op.id = rp.permiso_id
join public.permisos np on np.clave = 'gestionar_metas'
where op.clave = 'goals:read'
on conflict do nothing;

-- ver_metricas (antes tools:analytics / Herramientas)
insert into public.rol_permisos (rol_id, permiso_id)
select distinct rp.rol_id, np.id
from public.rol_permisos rp
join public.permisos op on op.id = rp.permiso_id
join public.permisos np on np.clave = 'ver_metricas'
where op.clave in ('tools:analytics', 'worksheets:read')
on conflict do nothing;

-- gestionar_soporte (unión ver/responder/legacy)
insert into public.rol_permisos (rol_id, permiso_id)
select distinct rp.rol_id, np.id
from public.rol_permisos rp
join public.permisos op on op.id = rp.permiso_id
join public.permisos np on np.clave = 'gestionar_soporte'
where op.clave in ('ver_tickets_soporte', 'responder_tickets_soporte', 'support:read')
on conflict do nothing;

-- gestionar_roles_permisos
insert into public.rol_permisos (rol_id, permiso_id)
select distinct rp.rol_id, np.id
from public.rol_permisos rp
join public.permisos op on op.id = rp.permiso_id
join public.permisos np on np.clave = 'gestionar_roles_permisos'
where op.clave = 'admin:roles'
on conflict do nothing;

-- 4) Remap overrides de usuario (usuario_permisos_override)
-- Otorgados → nueva clave; denegados → nueva clave (si aplica)
with map(old_clave, new_clave) as (
  values
    ('dashboard:read', 'ver_resumen'),
    ('users:read', 'gestionar_usuarios'),
    ('users:deactivate', 'gestionar_usuarios'),
    ('users:activate', 'gestionar_usuarios'),
    ('users:export', 'gestionar_usuarios'),
    ('users:role', 'gestionar_usuarios'),
    ('users:permissions', 'gestionar_usuarios'),
    ('ver_logs_administracion', 'ver_logs'),
    ('goals:read', 'gestionar_metas'),
    ('tools:analytics', 'ver_metricas'),
    ('worksheets:read', 'ver_metricas'),
    ('ver_tickets_soporte', 'gestionar_soporte'),
    ('responder_tickets_soporte', 'gestionar_soporte'),
    ('support:read', 'gestionar_soporte'),
    ('admin:roles', 'gestionar_roles_permisos')
)
insert into public.usuario_permisos_override (usuario_id, permiso_id, otorgado)
select o.usuario_id, np.id, bool_or(o.otorgado)
from public.usuario_permisos_override o
join public.permisos op on op.id = o.permiso_id
join map m on m.old_clave = op.clave
join public.permisos np on np.clave = m.new_clave
group by o.usuario_id, np.id
on conflict (usuario_id, permiso_id) do update
set otorgado = (excluded.otorgado or public.usuario_permisos_override.otorgado);

-- Borrar overrides que apuntan a claves admin legacy (ya remapeados)
delete from public.usuario_permisos_override o
using public.permisos p
where o.permiso_id = p.id
  and p.clave in (
    'dashboard:read','users:read','users:deactivate','users:activate','users:export',
    'users:role','users:permissions','goals:read','tools:analytics','worksheets:read',
    'support:read','ver_tickets_soporte','responder_tickets_soporte',
    'ver_logs_administracion','admin:roles'
  );

-- 5) Quitar claves admin legacy de rol_permisos (conservar app + nuevas + financieras)
delete from public.rol_permisos rp
using public.permisos p
where rp.permiso_id = p.id
  and p.clave in (
    'dashboard:read','users:read','users:deactivate','users:activate','users:export',
    'users:role','users:permissions','goals:read','tools:analytics','worksheets:read',
    'support:read','ver_tickets_soporte','responder_tickets_soporte',
    'ver_logs_administracion','admin:roles'
  );

-- 6) Asegurar defaults de roles sistema
-- Admin: sin logs ni roles ni métricas financieras
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where r.slug = 'admin' and r.es_sistema = true
  and p.clave in (
    'ver_resumen','gestionar_usuarios','gestionar_metas','ver_metricas','gestionar_soporte'
  )
on conflict do nothing;

delete from public.rol_permisos rp
using public.roles r, public.permisos p
where rp.rol_id = r.id and rp.permiso_id = p.id
  and r.slug = 'admin' and r.es_sistema = true
  and p.clave in ('ver_logs','gestionar_roles_permisos','ver_metricas_financieras_usuarios');

-- Soporte: solo gestionar_soporte (admin)
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where r.slug = 'soporte' and r.es_sistema = true
  and p.clave = 'gestionar_soporte'
on conflict do nothing;

delete from public.rol_permisos rp
using public.roles r, public.permisos p
where rp.rol_id = r.id and rp.permiso_id = p.id
  and r.slug = 'soporte' and r.es_sistema = true
  and p.capa = 'admin'
  and p.clave <> 'gestionar_soporte';

-- Superadmin: todas las claves admin nuevas
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where r.slug = 'superadmin' and r.es_sistema = true
  and p.capa = 'admin'
on conflict do nothing;

-- 7) has_admin_permission con equivalencias (RLS legacy)
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

  -- Equivalencias consolidado ↔ legacy
  v_group := case
    when perm in ('ver_resumen','dashboard:read')
      then array['ver_resumen','dashboard:read']
    when perm in (
      'gestionar_usuarios','users:read','users:deactivate','users:activate',
      'users:export','users:role','users:permissions'
    )
      then array[
        'gestionar_usuarios','users:read','users:deactivate','users:activate',
        'users:export','users:role','users:permissions'
      ]
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

-- 8) sync_profile_legacy_permissions con claves nuevas
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
      'ver_resumen','gestionar_usuarios','ver_logs','gestionar_metas','ver_metricas',
      'gestionar_soporte','gestionar_roles_permisos','ver_metricas_financieras_usuarios',
      -- legacy por si quedó en overrides temporales
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
    'ver_resumen','gestionar_usuarios','gestionar_metas','ver_metricas','gestionar_soporte',
    'ver_logs','gestionar_roles_permisos'
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

-- 9) Re-sync todos los perfiles con role_id
do $$
declare
  u record;
begin
  for u in select id from public.profiles where role_id is not null loop
    perform public.sync_profile_legacy_permissions(u.id);
  end loop;
end $$;

-- 10) Deprecar filas legacy del catálogo (ya no asignables vía UI JS; se dejan por historial
--     o se pueden borrar si no hay FKs). Borrar claves admin legacy del catálogo.
delete from public.permisos
where clave in (
  'dashboard:read','users:read','users:deactivate','users:activate','users:export',
  'users:role','users:permissions','goals:read','tools:analytics',
  'support:read','ver_tickets_soporte','responder_tickets_soporte',
  'ver_logs_administracion','admin:roles'
);
