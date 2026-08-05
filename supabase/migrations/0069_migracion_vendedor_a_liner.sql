-- ============================================================
-- 0069 — Migración Vendedor → Liner + eliminación de catálogo
-- Soporte NO se modifica.
--
-- Estrategia de permisos:
--   • Plataforma: renombrar rol sistema a000…003 Vendedor→Liner
--     (mismo UUID → mismos rol_permisos y flag_reglas; sin pérdida).
--   • Tenant: reasignar FKs al Liner de la MISMA empresa; borrar
--     roles slug=vendedor con empresa_id NOT NULL.
-- ============================================================

-- 1) Tabla de respaldo / auditoría
create table if not exists public.migracion_vendedor_liner_backup (
  id uuid primary key default gen_random_uuid(),
  fuente text not null,
  usuario_id uuid,
  email text,
  full_name text,
  role_id_anterior uuid,
  role_id_nuevo uuid,
  empresa_id uuid,
  workspace_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.migracion_vendedor_liner_backup is
  'Snapshot + log de migración automática Vendedor→Liner (2026-08).';

-- 2) Snapshot perfiles con role_id de cualquier rol slug=vendedor
insert into public.migracion_vendedor_liner_backup (
  fuente, usuario_id, email, full_name, role_id_anterior, empresa_id, detalle
)
select
  'profiles',
  p.id,
  p.email,
  p.full_name,
  p.role_id,
  r.empresa_id,
  jsonb_build_object(
    'profiles_role', p.role,
    'rol_slug_anterior', r.slug,
    'rol_nombre_anterior', r.nombre,
    'cambiado_por', 'sistema-migracion-vendedor-liner'
  )
from public.profiles p
join public.roles r on r.id = p.role_id
where r.slug = 'vendedor';

insert into public.migracion_vendedor_liner_backup (
  fuente, usuario_id, email, full_name, role_id_anterior, empresa_id, workspace_id, detalle
)
select
  'workspace_miembros',
  wm.usuario_id,
  pr.email,
  pr.full_name,
  wm.role_id,
  w.empresa_id,
  wm.workspace_id,
  jsonb_build_object(
    'rol_en_workspace', wm.rol_en_workspace,
    'rol_slug_anterior', r.slug,
    'cambiado_por', 'sistema-migracion-vendedor-liner'
  )
from public.workspace_miembros wm
join public.roles r on r.id = wm.role_id
join public.workspaces w on w.id = wm.workspace_id
left join public.profiles pr on pr.id = wm.usuario_id
where r.slug = 'vendedor';

insert into public.migracion_vendedor_liner_backup (
  fuente, usuario_id, email, full_name, role_id_anterior, empresa_id, detalle
)
select
  'empresa_miembros',
  em.usuario_id,
  pr.email,
  pr.full_name,
  em.role_id,
  em.empresa_id,
  jsonb_build_object(
    'es_admin', em.es_admin,
    'rol_slug_anterior', r.slug,
    'cambiado_por', 'sistema-migracion-vendedor-liner'
  )
from public.empresa_miembros em
join public.roles r on r.id = em.role_id
left join public.profiles pr on pr.id = em.usuario_id
where r.slug = 'vendedor';

-- 3) Reasignar membresías tenant → Liner de la misma empresa
update public.workspace_miembros wm
set role_id = liner.id
from public.roles vend,
     public.workspaces w,
     public.roles liner
where wm.role_id = vend.id
  and w.id = wm.workspace_id
  and vend.slug = 'vendedor'
  and vend.empresa_id is not null
  and liner.empresa_id = w.empresa_id
  and liner.slug = 'liner';

update public.empresa_miembros em
set role_id = liner.id
from public.roles vend,
     public.roles liner
where em.role_id = vend.id
  and vend.slug = 'vendedor'
  and vend.empresa_id is not null
  and liner.empresa_id = em.empresa_id
  and liner.slug = 'liner';

-- Perfiles cuyo role_id apunta a Vendedor-tenant → Liner de esa empresa
update public.profiles p
set role_id = liner.id
from public.roles vend,
     public.roles liner
where p.role_id = vend.id
  and vend.slug = 'vendedor'
  and vend.empresa_id is not null
  and liner.empresa_id = vend.empresa_id
  and liner.slug = 'liner';

-- 4) Plataforma: renombrar Vendedor → Liner (mismo UUID)
update public.roles
set nombre = 'Liner',
    slug = 'liner',
    scope = coalesce(nullif(scope, ''), 'plataforma')
where id = 'a0000000-0000-4000-8000-000000000003'
  and empresa_id is null
  and slug = 'vendedor';

-- 5) Actualizar role_id_nuevo en backup (plataforma)
update public.migracion_vendedor_liner_backup b
set role_id_nuevo = 'a0000000-0000-4000-8000-000000000003'
where b.role_id_anterior = 'a0000000-0000-4000-8000-000000000003'
  and b.fuente = 'profiles';

update public.migracion_vendedor_liner_backup b
set role_id_nuevo = liner.id
from public.roles vend
join public.roles liner
  on liner.empresa_id = vend.empresa_id
 and liner.slug = 'liner'
where b.role_id_anterior = vend.id
  and vend.slug = 'vendedor'
  and vend.empresa_id is not null
  and b.role_id_nuevo is null;

-- 6) Gate: ningún profile/miembro debe seguir apuntando a slug vendedor
do $$
declare
  v_left int;
begin
  select count(*) into v_left
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where r.slug = 'vendedor';
  if v_left > 0 then
    raise exception 'Abort: % profiles aún con role slug=vendedor', v_left;
  end if;

  select count(*) into v_left
  from public.workspace_miembros wm
  join public.roles r on r.id = wm.role_id
  where r.slug = 'vendedor';
  if v_left > 0 then
    raise exception 'Abort: % workspace_miembros aún con role slug=vendedor', v_left;
  end if;

  select count(*) into v_left
  from public.empresa_miembros em
  join public.roles r on r.id = em.role_id
  where r.slug = 'vendedor';
  if v_left > 0 then
    raise exception 'Abort: % empresa_miembros aún con role slug=vendedor', v_left;
  end if;
end $$;

-- 7) Mover flag_reglas de roles tenant vendedor → liner misma empresa (si hubiera)
update public.flag_reglas fr
set alcance_id = liner.id
from public.roles vend
join public.roles liner
  on liner.empresa_id = vend.empresa_id
 and liner.slug = 'liner'
where fr.alcance = 'rol'
  and fr.alcance_id = vend.id
  and vend.slug = 'vendedor'
  and vend.empresa_id is not null;

-- 8) Limpiar y eliminar roles tenant Vendedor
delete from public.rol_permisos rp
using public.roles r
where rp.rol_id = r.id
  and r.slug = 'vendedor'
  and r.empresa_id is not null;

delete from public.flag_reglas fr
using public.roles r
where fr.alcance = 'rol'
  and fr.alcance_id = r.id
  and r.slug = 'vendedor'
  and r.empresa_id is not null;

-- Quitar paquete_id antes de borrar por si hay FKs raras
update public.roles
set paquete_id = null
where slug = 'vendedor'
  and empresa_id is not null;

delete from public.roles
where slug = 'vendedor'
  and empresa_id is not null;

-- 9) Confirmar: cero roles slug=vendedor en catálogo
do $$
declare
  v_left int;
begin
  select count(*) into v_left from public.roles where slug = 'vendedor';
  if v_left > 0 then
    raise exception 'Abort: aún existen % roles slug=vendedor', v_left;
  end if;
end $$;

-- 10) Auditoría: un log por perfil migrado (actor = primer superadmin)
do $$
declare
  v_actor uuid;
  r record;
begin
  select id into v_actor
  from public.profiles
  where coalesce(is_super_admin, false) = true
  order by created_at nulls last
  limit 1;

  if v_actor is null then
    select id into v_actor from public.profiles order by created_at nulls last limit 1;
  end if;

  if v_actor is null then
    raise notice 'Sin actor para logs; se omite insert_admin_log';
    return;
  end if;

  for r in
    select *
    from public.migracion_vendedor_liner_backup
    where fuente = 'profiles'
  loop
    perform public.insert_admin_log(
      v_actor,
      'cambio_rol',
      'usuario',
      r.usuario_id,
      jsonb_build_object(
        'cambiado_por', 'sistema-migracion-vendedor-liner',
        'migracion', true,
        'de_slug', 'vendedor',
        'a_slug', 'liner',
        'role_id_de', r.role_id_anterior,
        'role_id_a', r.role_id_nuevo,
        'email', r.email,
        'nota', 'Migración automática Vendedor→Liner (menor privilegio vs Cerrador)'
      )
    );
  end loop;
end $$;

-- 11) RPCs: fallback delete-role y reserved slugs usan liner
create or replace function public.admin_delete_role(p_rol_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema boolean;
  v_liner uuid := 'a0000000-0000-4000-8000-000000000003';
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select es_sistema into v_sistema from public.roles where id = p_rol_id;
  if not found then raise exception 'Rol no encontrado'; end if;
  if v_sistema then raise exception 'No se pueden eliminar roles de sistema'; end if;

  update public.profiles set role_id = v_liner where role_id = p_rol_id;
  perform public.sync_profile_legacy_permissions(pr.id)
  from public.profiles pr where pr.role_id = v_liner;

  delete from public.roles where id = p_rol_id;
end;
$$;

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
  if v_slug = '' or v_slug in ('superadmin', 'admin', 'liner', 'soporte', 'vendedor') then
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

-- 12) Orden en listado plataforma (firma jsonb de 0066)
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
    select jsonb_agg(row_obj order by sort_rank, nombre)
    from (
      select
        jsonb_build_object(
          'id', r.id,
          'nombre', r.nombre,
          'slug', r.slug,
          'es_sistema', r.es_sistema,
          'scope', coalesce(r.scope, 'plataforma'),
          'empresa_id', r.empresa_id,
          'created_at', r.created_at,
          'permission_keys', coalesce((
            select jsonb_agg(p.clave order by p.clave)
            from public.rol_permisos rp
            join public.permisos p on p.id = rp.permiso_id
            where rp.rol_id = r.id
          ), '[]'::jsonb)
        ) as row_obj,
        r.nombre,
        case r.slug
          when 'superadmin' then 1
          when 'admin' then 2
          when 'soporte' then 3
          when 'liner' then 4
          else 100
        end as sort_rank
      from public.roles r
      where r.empresa_id is null
    ) q
  ), '[]'::jsonb);
end;
$$;

comment on function public.admin_list_roles() is
  'Lista roles de plataforma (empresa_id IS NULL). Puestos tenant se gestionan en Empresas → Acceso.';

grant execute on function public.admin_delete_role(uuid) to authenticated;
grant execute on function public.admin_create_role(text, text[]) to authenticated;
grant execute on function public.admin_list_roles() to authenticated;
