-- ============================================================
-- 0051 — Motor genérico de feature flags
-- Precedencia: usuario > rol > default_global
-- Jerarquía: si flag_padre está off, el hijo está off.
-- ============================================================

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre_visible text not null,
  flag_padre uuid references public.flags(id) on delete cascade,
  default_global boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists flags_padre_idx on public.flags (flag_padre);

create table if not exists public.flag_reglas (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.flags(id) on delete cascade,
  alcance text not null check (alcance in ('rol', 'usuario')),
  alcance_id uuid not null,
  activo boolean not null,
  created_at timestamptz not null default now(),
  unique (flag_id, alcance, alcance_id)
);

create index if not exists flag_reglas_alcance_idx
  on public.flag_reglas (alcance, alcance_id);
create index if not exists flag_reglas_flag_idx
  on public.flag_reglas (flag_id);

alter table public.flags enable row level security;
alter table public.flag_reglas enable row level security;

-- Lectura: cualquier autenticado (el resolver es la fuente de verdad efectiva)
drop policy if exists "flags_select_authenticated" on public.flags;
create policy "flags_select_authenticated" on public.flags
  for select to authenticated
  using (true);

drop policy if exists "flag_reglas_select_authenticated" on public.flag_reglas;
create policy "flag_reglas_select_authenticated" on public.flag_reglas
  for select to authenticated
  using (true);

-- Escritura solo service_role / vía RPC admin (sin INSERT policy para authenticated)
drop policy if exists "flags_all_service" on public.flags;
-- service_role bypasses RLS

-- ---------- Seed catálogo ----------
insert into public.flags (clave, nombre_visible, flag_padre, default_global)
values
  ('survey', 'Survey', null, true),
  ('proyeccion_vacaciones', 'Proyección de Vacaciones', null, true),
  ('worksheet', 'Worksheet', null, true),
  ('analysis', 'Analysis', null, true)
on conflict (clave) do nothing;

insert into public.flags (clave, nombre_visible, flag_padre, default_global)
select 'worksheet.money_box', 'Money Box', f.id, false
from public.flags f where f.clave = 'worksheet'
on conflict (clave) do nothing;

insert into public.flags (clave, nombre_visible, flag_padre, default_global)
select v.clave, v.nombre, p.id, true
from public.flags p
cross join (values
  ('survey.tab.motivaciones', 'Motivaciones'),
  ('survey.tab.timeshare_information', 'Timeshare Information'),
  ('survey.tab.gastos_viaje', 'Gastos de viaje'),
  ('survey.tab.resumen', 'Resumen')
) as v(clave, nombre)
where p.clave = 'survey'
on conflict (clave) do nothing;

-- ---------- Resolver ----------
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

  -- Jerarquía: padre primero
  if v_flag.flag_padre is not null then
    select clave into v_parent_clave from public.flags where id = v_flag.flag_padre;
    if v_parent_clave is not null and not public.resolver_flag(v_parent_clave, p_usuario_id) then
      return false;
    end if;
  end if;

  -- 1) Regla usuario
  select fr.activo into v_user_rule
  from public.flag_reglas fr
  where fr.flag_id = v_flag.id
    and fr.alcance = 'usuario'
    and fr.alcance_id = p_usuario_id
  limit 1;
  if found then
    return v_user_rule;
  end if;

  -- 2) Regla rol
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

  -- 3) Default global
  return v_flag.default_global;
end;
$$;

revoke all on function public.resolver_flag(text, uuid) from public;
grant execute on function public.resolver_flag(text, uuid) to authenticated, service_role;

create or replace function public.resolver_all_flags(p_usuario_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  result jsonb := '{}'::jsonb;
begin
  if p_usuario_id is null then
    return result;
  end if;
  for r in select clave from public.flags order by clave loop
    result := result || jsonb_build_object(r.clave, public.resolver_flag(r.clave, p_usuario_id));
  end loop;
  return result;
end;
$$;

revoke all on function public.resolver_all_flags(uuid) from public;
grant execute on function public.resolver_all_flags(uuid) to authenticated, service_role;

-- ---------- Backfill desde RBAC herramientas:* ----------
-- Mapa permiso → flag
-- Roles SIN el permiso → regla rol activa=false (default global es true)
-- Roles CON el permiso → no hace falta regla (default true), pero insertamos activo=true por claridad
do $$
declare
  map record;
  flag_uuid uuid;
  role_rec record;
  has_perm boolean;
begin
  for map in
    select * from (values
      ('herramientas:survey', 'survey'),
      ('herramientas:vacaciones', 'proyeccion_vacaciones'),
      ('herramientas:worksheet', 'worksheet'),
      ('herramientas:analysis', 'analysis')
    ) as m(perm_clave, flag_clave)
  loop
    select id into flag_uuid from public.flags where clave = map.flag_clave;
    if flag_uuid is null then continue; end if;

    for role_rec in select id from public.roles loop
      select exists (
        select 1
        from public.rol_permisos rp
        join public.permisos p on p.id = rp.permiso_id
        where rp.rol_id = role_rec.id and p.clave = map.perm_clave
      ) into has_perm;

      insert into public.flag_reglas (flag_id, alcance, alcance_id, activo)
      values (flag_uuid, 'rol', role_rec.id, has_perm)
      on conflict (flag_id, alcance, alcance_id) do update set activo = excluded.activo;
    end loop;
  end loop;
end $$;

-- Overrides de usuario
insert into public.flag_reglas (flag_id, alcance, alcance_id, activo)
select f.id, 'usuario', o.usuario_id, o.otorgado
from public.usuario_permisos_override o
join public.permisos p on p.id = o.permiso_id
join public.flags f on f.clave = case p.clave
  when 'herramientas:survey' then 'survey'
  when 'herramientas:vacaciones' then 'proyeccion_vacaciones'
  when 'herramientas:worksheet' then 'worksheet'
  when 'herramientas:analysis' then 'analysis'
  else null
end
where f.id is not null
on conflict (flag_id, alcance, alcance_id) do update set activo = excluded.activo;

-- Money Box: usuarios con membresía PRO vigente
insert into public.flag_reglas (flag_id, alcance, alcance_id, activo)
select f.id, 'usuario', m.usuario_id, true
from public.membresias m
join public.planes pl on pl.id = m.plan_id
join public.flags f on f.clave = 'worksheet.money_box'
where m.estado in ('activa', 'en_prueba')
  and lower(pl.nombre) = 'pro'
on conflict (flag_id, alcance, alcance_id) do update set activo = true;

-- Tabs survey: hereda default true; sin reglas extra salvo que survey padre esté off

comment on table public.flags is 'Catálogo genérico de feature flags (módulos y sub-características).';
comment on table public.flag_reglas is 'Reglas de activación por rol o usuario. Precedencia: usuario > rol > default_global.';
comment on function public.resolver_flag(text, uuid) is 'Resuelve un flag con jerarquía padre y precedencia usuario>rol>default.';
