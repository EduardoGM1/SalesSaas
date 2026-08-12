-- ============================================================
-- 0083 — Endurecimiento de seguridad (RPC auth, RLS, invites)
-- ============================================================

-- ---------- Helper: caller = target user o superadmin ----------
create or replace function public.assert_rpc_self_or_super(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_target is null then
    return;
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if auth.uid() = p_target then
    return;
  end if;
  if public.is_super_admin() then
    return;
  end if;
  raise exception 'not authorized' using errcode = '42501';
end;
$$;

revoke all on function public.assert_rpc_self_or_super(uuid) from public;
grant execute on function public.assert_rpc_self_or_super(uuid) to authenticated, service_role;

-- ---------- Helper: membresía tenant (empresa o workspace) ----------
create or replace function public.user_can_read_tenant_role(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_empresa_id is null
    or public.is_super_admin()
    or exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = p_empresa_id
        and em.usuario_id = auth.uid()
        and em.estado = 'activo'
    )
    or exists (
      select 1
      from public.workspace_miembros wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.empresa_id = p_empresa_id
        and wm.usuario_id = auth.uid()
    );
$$;

-- ---------- resolve_user_permission_keys: anti-IDOR ----------
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
  perform public.assert_rpc_self_or_super(p_user_id);

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

-- ---------- effective_workspace_permissions: anti-IDOR ----------
create or replace function public.effective_workspace_permissions(
  p_usuario_id uuid,
  p_workspace_id uuid
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_keys text[];
  v_role_id uuid;
  v_empresa_id uuid;
  v_super boolean;
  v_cross boolean;
  v_asistente_sala boolean;
  v_asistente_emp boolean;
begin
  perform public.assert_rpc_self_or_super(p_usuario_id);

  select is_super_admin into v_super from public.profiles where id = p_usuario_id;
  if coalesce(v_super, false) then
    select coalesce(array_agg(clave order by clave), '{}') into v_keys from public.permisos;
    return v_keys;
  end if;

  select w.empresa_id into v_empresa_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if v_empresa_id is not null
     and public.user_is_empresa_admin(p_usuario_id, v_empresa_id) then
    select coalesce(array_agg(clave order by clave), '{}') into v_keys
    from public.permisos;
    return v_keys;
  end if;

  v_cross := exists (
    select 1 from public.gerente_acceso_cruzado g
    where g.gerente_id = p_usuario_id
      and g.sala_adicional_id = p_workspace_id
      and g.estado = 'activo'
  );

  select wm.role_id into v_role_id
  from public.workspace_miembros wm
  where wm.usuario_id = p_usuario_id and wm.workspace_id = p_workspace_id;

  if v_role_id is null and v_cross and v_empresa_id is not null then
    select r.id into v_role_id
    from public.roles r
    where r.empresa_id = v_empresa_id
      and r.slug = 'gerente'
      and r.scope = 'workspace'
    limit 1;
  end if;

  if v_role_id is not null then
    select coalesce(array_agg(distinct p.clave), '{}') into v_keys
    from public.rol_permisos rp
    join public.permisos p on p.id = rp.permiso_id
    where rp.rol_id = v_role_id;
  else
    v_keys := public.resolve_user_permission_keys(p_usuario_id);
  end if;

  if exists (
    select 1 from public.workspace_miembros wm
    where wm.usuario_id = p_usuario_id
      and wm.workspace_id = p_workspace_id
      and wm.rol_en_workspace = 'gerente'
  ) or v_cross then
    v_keys := v_keys || array[
      'expedientes:ver_equipo',
      'ventas:ver_equipo',
      'dashboard:ver_equipo',
      'metas:ver_equipo'
    ];
  end if;

  select exists (
    select 1
    from public.workspace_miembros wm
    join public.roles r on r.id = wm.role_id
    where wm.usuario_id = p_usuario_id
      and wm.workspace_id = p_workspace_id
      and r.slug = 'asistente_sala'
  ) into v_asistente_sala;

  select exists (
    select 1
    from public.empresa_miembros em
    join public.roles r on r.id = em.role_id
    where em.usuario_id = p_usuario_id
      and em.empresa_id = v_empresa_id
      and em.estado = 'activo'
      and r.slug = 'asistente_empresa'
  ) into v_asistente_emp;

  if v_asistente_sala or v_asistente_emp then
    v_keys := '{}';
  end if;

  select coalesce(array_agg(distinct clave), '{}') into v_keys
  from (
    select unnest(coalesce(v_keys, '{}')) as clave
    union
    select p.clave
    from public.workspace_usuario_permisos_override o
    join public.permisos p on p.id = o.permiso_id
    where o.workspace_id = p_workspace_id
      and o.usuario_id = p_usuario_id
      and o.otorgado = true
      and not (v_asistente_sala or v_asistente_emp)
    union
    select p.clave
    from public.permisos_delegados d
    join public.permisos p on p.id = d.permiso_id
    where d.usuario_asistente_id = p_usuario_id
      and d.sala_id = p_workspace_id
    union
    select p.clave
    from public.permisos_delegados d
    join public.permisos p on p.id = d.permiso_id
    where d.usuario_asistente_id = p_usuario_id
      and d.empresa_id is not null
      and d.empresa_id = v_empresa_id
  ) granted;

  return coalesce(v_keys, '{}');
end;
$$;

-- ---------- resolver_flag: anti-IDOR (paridad 0072 + assert) ----------
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

  perform public.assert_rpc_self_or_super(p_usuario_id);

  select coalesce(is_super_admin, false) into v_is_super
  from public.profiles where id = p_usuario_id;
  if v_is_super then
    return true;
  end if;

  select * into v_flag
  from public.flags
  where clave = p_clave
    and empresa_id is null;
  if not found then
    return false;
  end if;

  if v_flag.flag_padre is not null then
    select clave into v_parent_clave from public.flags where id = v_flag.flag_padre;
    if v_parent_clave is not null and not public.resolver_flag(v_parent_clave, p_usuario_id) then
      return false;
    end if;
  end if;

  select fr.activo into v_user_rule
  from public.flag_reglas fr
  where fr.flag_id = v_flag.id
    and fr.alcance = 'usuario'
    and fr.alcance_id = p_usuario_id
  limit 1;
  if found then
    return v_user_rule;
  end if;

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

  return v_flag.default_global;
end;
$$;

-- ---------- resolver_all_flags: anti-IDOR ----------
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
  perform public.assert_rpc_self_or_super(p_usuario_id);

  if p_usuario_id is null then
    return result;
  end if;
  for r in
    select clave from public.flags
    where empresa_id is null
    order by clave
  loop
    result := result || jsonb_build_object(r.clave, public.resolver_flag(r.clave, p_usuario_id));
  end loop;
  return result;
end;
$$;

-- ---------- resolver_session_flags: anti-IDOR + membresía workspace ----------
create or replace function public.resolver_session_flags(
  p_usuario_id uuid,
  p_workspace_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  result jsonb := '{}'::jsonb;
  v_empresa_id uuid;
  v_tipo text;
begin
  perform public.assert_rpc_self_or_super(p_usuario_id);

  if p_usuario_id is null then
    return result;
  end if;

  if p_workspace_id is not null then
    if not public.user_in_workspace(p_usuario_id, p_workspace_id) then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    select w.empresa_id, w.tipo into v_empresa_id, v_tipo
    from public.workspaces w
    where w.id = p_workspace_id;
  end if;

  if p_workspace_id is not null and v_tipo = 'sala_de_venta' then
    for r in
      select distinct on (f.clave) f.clave
      from public.flags f
      where f.empresa_id is null
         or f.empresa_id = v_empresa_id
      order by f.clave, (f.empresa_id is not null) desc
    loop
      result := result || jsonb_build_object(
        r.clave,
        public.resolver_workspace_flag(r.clave, p_usuario_id, p_workspace_id)
      );
    end loop;
    return result;
  end if;

  return public.resolver_all_flags(p_usuario_id);
end;
$$;

-- ---------- current_membership: anti-IDOR (paridad 0037 + assert) ----------
create or replace function public.current_membership(p_user_id uuid)
returns table (
  plan_nombre text,
  membresia_estado text,
  fecha_inicio timestamptz,
  fecha_proximo_cobro timestamptz,
  plan_id uuid,
  membresia_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_rpc_self_or_super(p_user_id);

  return query
  select
    pl.nombre,
    m.estado,
    m.fecha_inicio,
    m.fecha_proximo_cobro,
    pl.id,
    m.id
  from public.membresias m
  join public.planes pl on pl.id = m.plan_id
  where m.usuario_id = p_user_id
    and m.estado in ('activa', 'en_prueba')
  order by m.fecha_inicio desc
  limit 1;
end;
$$;

-- ---------- list_permisos_delegados_keys: solo actor autorizado ----------
create or replace function public.list_permisos_delegados_keys(
  p_asistente_id uuid,
  p_empresa_id uuid default null,
  p_sala_id uuid default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if auth.uid() = p_asistente_id then
    v_allowed := true;
  elsif public.is_super_admin() then
    v_allowed := true;
  elsif p_empresa_id is not null and public.user_is_empresa_admin(auth.uid(), p_empresa_id) then
    v_allowed := true;
  elsif p_sala_id is not null and exists (
    select 1 from public.workspace_miembros wm
    where wm.workspace_id = p_sala_id
      and wm.usuario_id = auth.uid()
      and wm.rol_en_workspace = 'gerente'
  ) then
    v_allowed := true;
  elsif p_sala_id is not null and exists (
    select 1
    from public.workspaces w
    where w.id = p_sala_id
      and public.user_is_empresa_admin(auth.uid(), w.empresa_id)
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return coalesce((
    select array_agg(distinct p.clave order by p.clave)
    from public.permisos_delegados d
    join public.permisos p on p.id = d.permiso_id
    where d.usuario_asistente_id = p_asistente_id
      and (
        (p_empresa_id is not null and d.empresa_id = p_empresa_id)
        or (p_sala_id is not null and d.sala_id = p_sala_id)
      )
  ), '{}');
end;
$$;

-- ---------- Tabla backup migración: RLS + solo service_role ----------
alter table public.migracion_vendedor_liner_backup enable row level security;

revoke all on table public.migracion_vendedor_liner_backup from anon, authenticated;

-- ---------- RLS roles / rol_permisos / flag_reglas (sin using true global) ----------
drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_scoped" on public.roles
  for select to authenticated
  using (
    public.is_super_admin()
    or empresa_id is null
    or public.user_can_read_tenant_role(empresa_id)
  );

drop policy if exists "rol_permisos_select_authenticated" on public.rol_permisos;
create policy "rol_permisos_select_scoped" on public.rol_permisos
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.roles r
      where r.id = rol_permisos.rol_id
        and (r.empresa_id is null or public.user_can_read_tenant_role(r.empresa_id))
    )
  );

drop policy if exists "flag_reglas_select_authenticated" on public.flag_reglas;
create policy "flag_reglas_select_scoped" on public.flag_reglas
  for select to authenticated
  using (
    public.is_super_admin()
    or alcance = 'membresia'
    or (alcance = 'usuario' and alcance_id = auth.uid())
    or (
      alcance = 'rol'
      and exists (
        select 1 from public.roles r
        where r.id = flag_reglas.alcance_id
          and (r.empresa_id is null or public.user_can_read_tenant_role(r.empresa_id))
      )
    )
  );

-- ---------- Share invites: quitar enumeración global de tokens activos ----------
drop policy if exists "share_invites_select_active_token" on public.prospect_share_invites;

-- ---------- calendar_entries: políticas tenant RBAC (paridad con sales) ----------
drop policy if exists "calendar_select_member" on public.calendar_entries;
drop policy if exists "calendar_insert_member" on public.calendar_entries;
drop policy if exists "calendar_update_member" on public.calendar_entries;
drop policy if exists "calendar_delete_member" on public.calendar_entries;

create policy "calendar_select_tenant_role" on public.calendar_entries
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
    )
  );

create policy "calendar_insert_tenant_role" on public.calendar_entries
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.user_in_workspace(auth.uid(), workspace_id)
    and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar')
  );

create policy "calendar_update_tenant_role" on public.calendar_entries
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar')
  )
  with check (user_id = auth.uid() and public.user_in_workspace(auth.uid(), workspace_id));

create policy "calendar_delete_tenant_role" on public.calendar_entries
  for delete to authenticated using (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar')
  );
