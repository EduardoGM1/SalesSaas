-- 0050: Precedencia RBAC (permite_override) + módulos activables + org/grupos (MVP gerente)
-- Orden de producto: Tema 3 → Tema 1 → Tema 2 MVP (SELECT de equipo).

-- ═══════════════════════════════════════
-- TEMA 3 — permite_override + RPC overrides
-- ═══════════════════════════════════════

alter table public.permisos
  add column if not exists permite_override boolean not null default false;

comment on column public.permisos.permite_override is
  'Si false, no se puede overridear a nivel usuario (solo vía rol). Override usuario > grupo > rol.';

-- Features / herramientas overrideables + secciones admin delegables
update public.permisos
set permite_override = true
where clave in (
  'sales:view_modal',
  'sales:view_detail',
  'sales:history',
  'herramientas:survey',
  'herramientas:survey_configurar_preguntas',
  'herramientas:vacaciones',
  'herramientas:worksheet',
  'herramientas:analysis',
  'ver_resumen',
  'gestionar_usuarios',
  'gestionar_metas',
  'ver_metricas',
  'gestionar_soporte'
);

-- Overrides solo si el permiso lo permite
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
  v_permite boolean;
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
    select id, permite_override into v_permiso_id, v_permite
    from public.permisos where clave = v_clave;
    if v_permiso_id is not null and coalesce(v_permite, false) then
      insert into public.usuario_permisos_override (usuario_id, permiso_id, otorgado)
      values (p_target_id, v_permiso_id, v_otorgado)
      on conflict (usuario_id, permiso_id) do update
        set otorgado = excluded.otorgado, updated_at = now();
    end if;
  end loop;

  perform public.sync_profile_legacy_permissions(p_target_id);
end;
$$;

grant execute on function public.admin_set_user_permission_overrides(uuid, jsonb) to authenticated;

-- Reemplaza escritura legacy de admin_permissions por overrides relativos al rol
create or replace function public.admin_set_user_permissions(
  p_target_id uuid,
  p_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_super boolean;
  v_role_id uuid;
  v_desired text[];
  v_role_keys text[];
  v_clave text;
  v_permiso_id uuid;
  v_role_has boolean;
  v_want boolean;
  v_delegable text[] := array[
    'ver_resumen','gestionar_usuarios','gestionar_metas','ver_metricas','gestionar_soporte'
  ];
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select is_super_admin, role_id into v_target_super, v_role_id
  from public.profiles where id = p_target_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_target_super then raise exception 'No puedes modificar permisos del Superadmin'; end if;

  select coalesce(array_agg(distinct x), '{}')
  into v_desired
  from unnest(coalesce(p_permissions, '{}')) x
  where x = any(v_delegable);

  select coalesce(array_agg(distinct p.clave), '{}')
  into v_role_keys
  from public.rol_permisos rp
  join public.permisos p on p.id = rp.permiso_id
  where rp.rol_id = v_role_id
    and p.clave = any(v_delegable);

  -- Conservar overrides no-admin
  delete from public.usuario_permisos_override o
  using public.permisos p
  where o.permiso_id = p.id
    and o.usuario_id = p_target_id
    and p.clave = any(v_delegable);

  foreach v_clave in array v_delegable
  loop
    v_role_has := v_clave = any(v_role_keys);
    v_want := v_clave = any(v_desired);
    if v_want is distinct from v_role_has then
      select id into v_permiso_id from public.permisos where clave = v_clave and permite_override = true;
      if v_permiso_id is not null then
        insert into public.usuario_permisos_override (usuario_id, permiso_id, otorgado)
        values (p_target_id, v_permiso_id, v_want)
        on conflict (usuario_id, permiso_id) do update
          set otorgado = excluded.otorgado, updated_at = now();
      end if;
    end if;
  end loop;

  perform public.sync_profile_legacy_permissions(p_target_id);
end;
$$;

grant execute on function public.admin_set_user_permissions(uuid, text[]) to authenticated;

-- ═══════════════════════════════════════
-- TEMA 2 MVP — organizaciones / grupos (antes de módulos scope org/grupo)
-- ═══════════════════════════════════════

create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

insert into public.organizaciones (id, nombre)
values ('b0000000-0000-4000-8000-000000000001', 'Organización principal')
on conflict (id) do nothing;

alter table public.profiles
  add column if not exists organizacion_id uuid references public.organizaciones(id) on delete set null;

update public.profiles
set organizacion_id = 'b0000000-0000-4000-8000-000000000001'
where organizacion_id is null;

create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  nombre text not null,
  gerente_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organizacion_id, nombre)
);

create table if not exists public.grupo_miembros (
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (grupo_id, usuario_id)
);

create index if not exists idx_grupos_gerente on public.grupos (gerente_id);
create index if not exists idx_grupo_miembros_usuario on public.grupo_miembros (usuario_id);
create index if not exists idx_profiles_organizacion on public.profiles (organizacion_id);

alter table public.organizaciones enable row level security;
alter table public.grupos enable row level security;
alter table public.grupo_miembros enable row level security;

drop policy if exists org_select_member on public.organizaciones;
create policy org_select_member on public.organizaciones
  for select to authenticated
  using (
    id in (select organizacion_id from public.profiles where id = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists grupos_select_related on public.grupos;
create policy grupos_select_related on public.grupos
  for select to authenticated
  using (
    gerente_id = auth.uid()
    or id in (select grupo_id from public.grupo_miembros where usuario_id = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists grupo_miembros_select_related on public.grupo_miembros;
create policy grupo_miembros_select_related on public.grupo_miembros
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or grupo_id in (select id from public.grupos where gerente_id = auth.uid())
    or public.is_super_admin()
  );

-- Admin/superadmin gestionan grupos vía service role / RPCs; políticas write solo superadmin
drop policy if exists grupos_write_super on public.grupos;
create policy grupos_write_super on public.grupos
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists grupo_miembros_write_super on public.grupo_miembros;
create policy grupo_miembros_write_super on public.grupo_miembros
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists org_write_super on public.organizaciones;
create policy org_write_super on public.organizaciones
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

/** ¿auth.uid() es gerente de un grupo que contiene a p_owner_id? */
create or replace function public.is_gerente_of(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.grupos g
    join public.grupo_miembros m on m.grupo_id = g.id
    where g.gerente_id = auth.uid()
      and m.usuario_id = p_owner_id
  );
$$;

grant execute on function public.is_gerente_of(uuid) to authenticated;

/** Miembros del equipo del gerente actual (sin incluir al gerente). */
create or replace function public.team_member_ids(p_gerente_id uuid default auth.uid())
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m.usuario_id), '{}')
  from public.grupos g
  join public.grupo_miembros m on m.grupo_id = g.id
  where g.gerente_id = p_gerente_id;
$$;

grant execute on function public.team_member_ids(uuid) to authenticated;

-- RLS SELECT de equipo (escritura sigue siendo del owner)
drop policy if exists prospects_select_team on public.prospects;
create policy prospects_select_team on public.prospects
  for select to authenticated
  using (public.is_gerente_of(user_id));

drop policy if exists sales_select_team on public.sales;
create policy sales_select_team on public.sales
  for select to authenticated
  using (public.is_gerente_of(user_id));

drop policy if exists activities_select_team on public.activities;
create policy activities_select_team on public.activities
  for select to authenticated
  using (public.is_gerente_of(user_id));

drop policy if exists goals_select_team on public.goals;
create policy goals_select_team on public.goals
  for select to authenticated
  using (public.is_gerente_of(user_id));

drop policy if exists cal_select_team on public.calendar_entries;
create policy cal_select_team on public.calendar_entries
  for select to authenticated
  using (public.is_gerente_of(user_id));

drop policy if exists tool_calc_select_team on public.tool_calculations;
create policy tool_calc_select_team on public.tool_calculations
  for select to authenticated
  using (public.is_gerente_of(user_id));

-- Rol sistema Gerente (con ver_equipo)
insert into public.roles (id, nombre, slug, es_sistema)
values (
  'a0000000-0000-4000-8000-000000000005',
  'Gerente',
  'gerente',
  true
)
on conflict (slug) do nothing;

-- Permisos: defaults vendedor + ver_equipo
insert into public.rol_permisos (rol_id, permiso_id)
select 'a0000000-0000-4000-8000-000000000005', p.id
from public.permisos p
where p.clave in (
  'expedientes:ver_propios','expedientes:crear','expedientes:editar','expedientes:eliminar',
  'expedientes:compartir','expedientes:ver_equipo',
  'herramientas:survey','herramientas:survey_configurar_preguntas','herramientas:vacaciones',
  'herramientas:worksheet','herramientas:analysis',
  'ventas:registrar','ventas:editar','ventas:cancelar',
  'sales:view_modal','sales:view_detail','sales:history','ventas:ver_equipo',
  'dashboard:ver_propio','dashboard:ver_equipo','agenda:usar',
  'metas:ver_editar_propias','metas:ver_equipo',
  'red:usar','mensajes:usar','notificaciones:configurar_propias','config:propia'
)
on conflict do nothing;

-- ═══════════════════════════════════════
-- TEMA 1 — módulos activables
-- ═══════════════════════════════════════

create table if not exists public.modulos (
  clave text primary key,
  nombre_visible text not null,
  activo_por_default boolean not null default true,
  requiere_plan text null check (requiere_plan is null or requiere_plan in ('basico', 'pro')),
  descripcion text null,
  created_at timestamptz not null default now()
);

insert into public.modulos (clave, nombre_visible, activo_por_default, requiere_plan, descripcion) values
  ('survey', 'Survey', true, null, 'Cuestionario de calificación'),
  ('vacaciones', 'Proyección de Vacaciones', true, null, 'Simulador de vacaciones'),
  ('worksheet', 'Worksheet', true, null, 'Hoja de trabajo financiera'),
  ('money_box', 'Money Box', true, 'pro', 'Optimizador de enganche / mensualidad'),
  ('analysis', 'Analysis', true, null, 'Análisis de expediente')
on conflict (clave) do nothing;

create table if not exists public.modulo_activacion (
  id uuid primary key default gen_random_uuid(),
  modulo_clave text not null references public.modulos(clave) on delete cascade,
  scope_tipo text not null check (scope_tipo in ('organizacion', 'grupo', 'usuario')),
  organizacion_id uuid null references public.organizaciones(id) on delete cascade,
  grupo_id uuid null references public.grupos(id) on delete cascade,
  usuario_id uuid null references public.profiles(id) on delete cascade,
  activo boolean not null,
  created_at timestamptz not null default now(),
  constraint modulo_activacion_scope_chk check (
    (scope_tipo = 'organizacion' and organizacion_id is not null and grupo_id is null and usuario_id is null)
    or (scope_tipo = 'grupo' and grupo_id is not null and organizacion_id is null and usuario_id is null)
    or (scope_tipo = 'usuario' and usuario_id is not null and organizacion_id is null and grupo_id is null)
  )
);

create unique index if not exists uq_modulo_activacion_org
  on public.modulo_activacion (modulo_clave, organizacion_id)
  where scope_tipo = 'organizacion';

create unique index if not exists uq_modulo_activacion_grupo
  on public.modulo_activacion (modulo_clave, grupo_id)
  where scope_tipo = 'grupo';

create unique index if not exists uq_modulo_activacion_usuario
  on public.modulo_activacion (modulo_clave, usuario_id)
  where scope_tipo = 'usuario';

alter table public.modulos enable row level security;
alter table public.modulo_activacion enable row level security;

drop policy if exists modulos_select_all on public.modulos;
create policy modulos_select_all on public.modulos
  for select to authenticated using (true);

drop policy if exists modulos_write_super on public.modulos;
create policy modulos_write_super on public.modulos
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists modulo_act_select_related on public.modulo_activacion;
create policy modulo_act_select_related on public.modulo_activacion
  for select to authenticated
  using (
    public.is_super_admin()
    or (scope_tipo = 'usuario' and usuario_id = auth.uid())
    or (scope_tipo = 'organizacion' and organizacion_id in (
      select organizacion_id from public.profiles where id = auth.uid()
    ))
    or (scope_tipo = 'grupo' and grupo_id in (
      select id from public.grupos where gerente_id = auth.uid()
      union
      select grupo_id from public.grupo_miembros where usuario_id = auth.uid()
    ))
  );

drop policy if exists modulo_act_write_super on public.modulo_activacion;
create policy modulo_act_write_super on public.modulo_activacion
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

/**
 * Precedencia: override usuario > grupo (cualquier grupo del user) > organización > default.
 * Si hay varios grupos con conflicto, gana "activo=false" (más restrictivo).
 */
create or replace function public.resolve_modulo_activo(p_user_id uuid, p_clave text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_default boolean;
  v_org uuid;
  v_user_ov boolean;
  v_org_ov boolean;
  v_grupo_off boolean;
  v_grupo_on boolean;
begin
  select activo_por_default into v_default from public.modulos where clave = p_clave;
  if not found then
    return true; -- módulo desconocido: no bloquear
  end if;

  select organizacion_id into v_org from public.profiles where id = p_user_id;

  select activo into v_user_ov
  from public.modulo_activacion
  where modulo_clave = p_clave and scope_tipo = 'usuario' and usuario_id = p_user_id
  limit 1;
  if found then
    return v_user_ov;
  end if;

  select bool_or(not activo), bool_or(activo)
  into v_grupo_off, v_grupo_on
  from public.modulo_activacion ma
  where ma.modulo_clave = p_clave
    and ma.scope_tipo = 'grupo'
    and ma.grupo_id in (
      select grupo_id from public.grupo_miembros where usuario_id = p_user_id
      union
      select id from public.grupos where gerente_id = p_user_id
    );

  if v_grupo_off then
    return false;
  end if;
  if v_grupo_on then
    return true;
  end if;

  if v_org is not null then
    select activo into v_org_ov
    from public.modulo_activacion
    where modulo_clave = p_clave and scope_tipo = 'organizacion' and organizacion_id = v_org
    limit 1;
    if found then
      return v_org_ov;
    end if;
  end if;

  return coalesce(v_default, true);
end;
$$;

grant execute on function public.resolve_modulo_activo(uuid, text) to authenticated;

create or replace function public.resolve_user_modulos(p_user_id uuid)
returns table (clave text, activo boolean, requiere_plan text)
language sql
stable
security definer
set search_path = public
as $$
  select m.clave,
         public.resolve_modulo_activo(p_user_id, m.clave) as activo,
         m.requiere_plan
  from public.modulos m
  order by m.clave;
$$;

grant execute on function public.resolve_user_modulos(uuid) to authenticated;

-- RPC admin: upsert activación
create or replace function public.admin_set_modulo_activacion(
  p_modulo_clave text,
  p_scope_tipo text,
  p_activo boolean,
  p_organizacion_id uuid default null,
  p_grupo_id uuid default null,
  p_usuario_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;
  if p_scope_tipo not in ('organizacion', 'grupo', 'usuario') then
    raise exception 'scope_tipo inválido';
  end if;
  if not exists (select 1 from public.modulos where clave = p_modulo_clave) then
    raise exception 'Módulo desconocido';
  end if;

  if p_scope_tipo = 'organizacion' then
    delete from public.modulo_activacion
    where modulo_clave = p_modulo_clave and scope_tipo = 'organizacion' and organizacion_id = p_organizacion_id;
    insert into public.modulo_activacion (modulo_clave, scope_tipo, organizacion_id, activo)
    values (p_modulo_clave, 'organizacion', p_organizacion_id, p_activo)
    returning id into v_id;
  elsif p_scope_tipo = 'grupo' then
    delete from public.modulo_activacion
    where modulo_clave = p_modulo_clave and scope_tipo = 'grupo' and grupo_id = p_grupo_id;
    insert into public.modulo_activacion (modulo_clave, scope_tipo, grupo_id, activo)
    values (p_modulo_clave, 'grupo', p_grupo_id, p_activo)
    returning id into v_id;
  else
    delete from public.modulo_activacion
    where modulo_clave = p_modulo_clave and scope_tipo = 'usuario' and usuario_id = p_usuario_id;
    insert into public.modulo_activacion (modulo_clave, scope_tipo, usuario_id, activo)
    values (p_modulo_clave, 'usuario', p_usuario_id, p_activo)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_set_modulo_activacion(text, text, boolean, uuid, uuid, uuid) to authenticated;

-- CRUD grupos (admin)
create or replace function public.admin_upsert_grupo(
  p_id uuid,
  p_nombre text,
  p_gerente_id uuid,
  p_organizacion_id uuid default null,
  p_miembro_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org uuid;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  v_org := coalesce(
    p_organizacion_id,
    (select organizacion_id from public.profiles where id = p_gerente_id),
    'b0000000-0000-4000-8000-000000000001'::uuid
  );

  if p_id is null then
    insert into public.grupos (organizacion_id, nombre, gerente_id)
    values (v_org, trim(p_nombre), p_gerente_id)
    returning id into v_id;
  else
    update public.grupos
    set nombre = trim(p_nombre),
        gerente_id = p_gerente_id,
        organizacion_id = v_org
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Grupo no encontrado'; end if;
    delete from public.grupo_miembros where grupo_id = v_id;
  end if;

  insert into public.grupo_miembros (grupo_id, usuario_id)
  select v_id, unnest(coalesce(p_miembro_ids, '{}'))
  on conflict do nothing;

  return v_id;
end;
$$;

grant execute on function public.admin_upsert_grupo(uuid, text, uuid, uuid, uuid[]) to authenticated;

create or replace function public.admin_delete_grupo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;
  delete from public.grupos where id = p_id;
end;
$$;

grant execute on function public.admin_delete_grupo(uuid) to authenticated;

-- Sync legacy: respetar slug gerente (no forzar vendedor)
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
  v_slug text;
begin
  v_keys := public.resolve_user_permission_keys(p_user_id);

  select r.slug into v_slug
  from public.profiles pr
  left join public.roles r on r.id = pr.role_id
  where pr.id = p_user_id;

  v_has_admin := exists (
    select 1 from unnest(v_keys) k
    where k in (
      'ver_resumen','gestionar_usuarios','ver_logs','gestionar_metas','ver_metricas',
      'gestionar_soporte','gestionar_roles_permisos','ver_metricas_financieras_usuarios',
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
      when v_slug = 'gerente' then 'gerente'::public.user_role
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

comment on table public.modulos is 'Catálogo de herramientas/módulos activables (Tema 1).';
comment on table public.modulo_activacion is 'Activación por scope: usuario > grupo > organización > default.';
comment on table public.grupos is 'Grupos de vendedores bajo un gerente (Tema 2 MVP).';
comment on function public.is_gerente_of(uuid) is 'RLS helper: gerente ve SELECT de registros de miembros de su grupo.';
