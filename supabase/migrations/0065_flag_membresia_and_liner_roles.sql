-- ============================================================
-- 0065 — Alcance membresía en flags + roles Liner/Cerrador
-- Precedencia: usuario > rol > membresía > default_global
-- ============================================================

-- 1) Ampliar flag_reglas.alcance
alter table public.flag_reglas drop constraint if exists flag_reglas_alcance_check;
alter table public.flag_reglas
  add constraint flag_reglas_alcance_check
  check (alcance in ('rol', 'usuario', 'membresia'));

comment on column public.flag_reglas.alcance is
  'rol | usuario | membresia (alcance_id = planes.id). Precedencia: usuario > rol > membresia > default_global.';

-- 2) resolver_flag con membresía
create or replace function public.resolver_flag(p_clave text, p_usuario_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_flag public.flags%rowtype;
  v_parent_clave text;
  v_role_id uuid;
  v_is_super boolean;
  v_user_rule boolean;
  v_rol_rule boolean;
  v_mem_rule boolean;
  v_plan_id uuid;
begin
  if p_clave is null or p_usuario_id is null then
    return false;
  end if;

  select coalesce(is_super_admin, false) into v_is_super
  from public.profiles where id = p_usuario_id;
  if v_is_super then
    return true;
  end if;

  select * into v_flag from public.flags where clave = p_clave;
  if not found then
    return false;
  end if;

  if v_flag.flag_padre is not null then
    select clave into v_parent_clave from public.flags where id = v_flag.flag_padre;
    if v_parent_clave is not null and not public.resolver_flag(v_parent_clave, p_usuario_id) then
      return false;
    end if;
  end if;

  -- 1) usuario
  select fr.activo into v_user_rule
  from public.flag_reglas fr
  where fr.flag_id = v_flag.id
    and fr.alcance = 'usuario'
    and fr.alcance_id = p_usuario_id
  limit 1;
  if found then
    return v_user_rule;
  end if;

  -- 2) rol (profiles.role_id)
  select role_id into v_role_id from public.profiles where id = p_usuario_id;
  if v_role_id is not null then
    select fr.activo into v_rol_rule
    from public.flag_reglas fr
    where fr.flag_id = v_flag.id
      and fr.alcance = 'rol'
      and fr.alcance_id = v_role_id
    limit 1;
    if found then
      return v_rol_rule;
    end if;
  end if;

  -- 3) membresía (plan activo / en_prueba)
  select m.plan_id into v_plan_id
  from public.membresias m
  where m.usuario_id = p_usuario_id
    and m.estado in ('activa', 'en_prueba')
  order by m.fecha_inicio desc
  limit 1;

  if v_plan_id is not null then
    select fr.activo into v_mem_rule
    from public.flag_reglas fr
    where fr.flag_id = v_flag.id
      and fr.alcance = 'membresia'
      and fr.alcance_id = v_plan_id
    limit 1;
    if found then
      return v_mem_rule;
    end if;
  end if;

  -- 4) default global
  return v_flag.default_global;
end;
$$;

comment on function public.resolver_flag(text, uuid) is
  'Resuelve un flag con jerarquía padre y precedencia usuario>rol>membresia>default.';

-- 3) Money Box: regla por plan Pro (además del sync legado por usuario)
insert into public.flag_reglas (flag_id, alcance, alcance_id, activo)
select f.id, 'membresia', p.id, true
from public.flags f
cross join public.planes p
where f.clave = 'worksheet.money_box'
  and p.nombre = 'pro'
on conflict (flag_id, alcance, alcance_id) do update set activo = excluded.activo;

-- 4) Paquete + rol Liner por empresa (Cerrador ya existe en 0056)
insert into public.paquetes_acceso (empresa_id, nombre, slug, descripcion, es_sistema, activo)
select
  e.id,
  'Liner',
  'liner',
  'Survey completo + Proyección de Vacaciones (sin Worksheet ni Money Box).',
  true,
  true
from public.empresas e
on conflict (empresa_id, slug) do nothing;

-- Flags del paquete liner: survey (+ tabs) + proyección
insert into public.paquete_flags (paquete_id, flag_id, activo)
select pa.id, f.id, true
from public.paquetes_acceso pa
cross join public.flags f
where pa.slug = 'liner'
  and (
    f.clave = 'survey'
    or f.clave like 'survey.tab.%'
    or f.clave = 'proyeccion_vacaciones'
  )
on conflict (paquete_id, flag_id) do update set activo = true;

insert into public.roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
select e.id, 'Liner', 'liner', 'workspace', pa.id, true
from public.empresas e
join public.paquetes_acceso pa on pa.empresa_id = e.id and pa.slug = 'liner'
where not exists (
  select 1 from public.roles r where r.empresa_id = e.id and r.slug = 'liner'
);

-- Permisos app base (mismo catálogo vendedor) + workflow liner
insert into public.rol_permisos (rol_id, permiso_id)
select tenant_role.id, rp.permiso_id
from public.roles tenant_role
join public.rol_permisos rp on rp.rol_id = 'a0000000-0000-4000-8000-000000000003'
where tenant_role.slug = 'liner'
  and tenant_role.empresa_id is not null
on conflict do nothing;

insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on p.clave in ('workflow:ver', 'workflow:avanzar')
where r.slug = 'liner'
  and r.empresa_id is not null
on conflict do nothing;

-- Asegurar Cerrador en empresas nuevas post-0056 sin backfill
insert into public.paquetes_acceso (empresa_id, nombre, slug, descripcion, es_sistema, activo)
select e.id, 'Cierre', 'cierre', 'Operación base más Money Box y capacidades de cierre.', true, true
from public.empresas e
on conflict (empresa_id, slug) do nothing;

insert into public.paquete_flags (paquete_id, flag_id, activo)
select pa.id, f.id, true
from public.paquetes_acceso pa
cross join public.flags f
where pa.slug = 'cierre'
on conflict (paquete_id, flag_id) do nothing;

update public.paquete_flags pf
set activo = true
from public.paquetes_acceso pa
join public.flags f on f.clave = 'worksheet.money_box'
where pf.paquete_id = pa.id
  and pf.flag_id = f.id
  and pa.slug = 'cierre';

insert into public.roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
select e.id, 'Cerrador', 'cerrador', 'workspace', pa.id, true
from public.empresas e
join public.paquetes_acceso pa on pa.empresa_id = e.id and pa.slug = 'cierre'
where not exists (
  select 1 from public.roles r where r.empresa_id = e.id and r.slug = 'cerrador'
);
