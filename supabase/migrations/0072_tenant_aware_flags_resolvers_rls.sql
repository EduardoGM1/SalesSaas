-- ============================================================
-- 0072 — Flags tenant-aware: resolvers, sesión, RLS
-- - Lookup por (clave + empresa_id), nunca solo clave ambigua
-- - Sesión: solo estándar + custom de la empresa del workspace
-- - RLS flags: oculta custom de otras empresas
-- - RLS modulo_custom_datos: lectura para miembros de sala de la empresa
-- NO añade alcance empresa/sala a flag_reglas (paquetes ya lo cubren)
-- ============================================================

-- ---------- 1) Resolver de fila: custom de empresa > estándar global ----------
create or replace function public.flag_row_for_empresa(p_clave text, p_empresa_id uuid)
returns public.flags
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_flag public.flags%rowtype;
begin
  if p_clave is null then
    return null;
  end if;

  if p_empresa_id is not null then
    select * into v_flag
    from public.flags f
    where f.clave = p_clave
      and f.empresa_id = p_empresa_id
    limit 1;
    if found then
      return v_flag;
    end if;
  end if;

  select * into v_flag
  from public.flags f
  where f.clave = p_clave
    and f.empresa_id is null
  limit 1;

  return v_flag;
end;
$$;

comment on function public.flag_row_for_empresa(text, uuid) is
  'Resuelve la fila de flags: prefer custom de empresa_id; si no, estándar global (empresa_id null).';

revoke all on function public.flag_row_for_empresa(text, uuid) from public;
grant execute on function public.flag_row_for_empresa(text, uuid) to authenticated, service_role;

-- ---------- 2) resolver_flag: solo catálogo estándar (sin custom) ----------
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

  -- Sin contexto de empresa: únicamente flags estándar globales.
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

comment on function public.resolver_flag(text, uuid) is
  'Resuelve flag estándar (empresa_id null). Custom requiere resolver_workspace_flag / resolver_session_flags.';

-- ---------- 3) resolver_workspace_flag: clave + empresa del workspace ----------
create or replace function public.resolver_workspace_flag(
  p_clave text,
  p_usuario_id uuid,
  p_workspace_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_flag public.flags%rowtype;
  v_parent_clave text;
  v_empresa_id uuid;
  v_paquete_id uuid;
  v_paquete_activo boolean;
  v_rule boolean;
  v_is_super boolean;
begin
  if p_clave is null or p_usuario_id is null or p_workspace_id is null then
    return false;
  end if;

  select coalesce(is_super_admin, false) into v_is_super
  from public.profiles where id = p_usuario_id;
  if v_is_super then
    return true;
  end if;

  select w.empresa_id into v_empresa_id
  from public.workspaces w
  where w.id = p_workspace_id;

  v_flag := public.flag_row_for_empresa(p_clave, v_empresa_id);
  if v_flag.id is null then
    return false;
  end if;

  -- Custom de otra empresa nunca debe resolverse aquí (flag_row_for_empresa ya lo evita).
  if v_flag.empresa_id is not null and (v_empresa_id is null or v_flag.empresa_id <> v_empresa_id) then
    return false;
  end if;

  if v_flag.flag_padre is not null then
    select clave into v_parent_clave from public.flags where id = v_flag.flag_padre;
    if v_parent_clave is not null
       and not public.resolver_workspace_flag(v_parent_clave, p_usuario_id, p_workspace_id) then
      return false;
    end if;
  end if;

  select fr.activo into v_rule
  from public.flag_reglas fr
  where fr.flag_id = v_flag.id
    and fr.alcance = 'usuario'
    and fr.alcance_id = p_usuario_id
  limit 1;
  if found then
    return v_rule;
  end if;

  select r.paquete_id, pa.activo into v_paquete_id, v_paquete_activo
  from public.workspace_miembros wm
  join public.roles r on r.id = wm.role_id
  left join public.paquetes_acceso pa on pa.id = r.paquete_id
  where wm.usuario_id = p_usuario_id
    and wm.workspace_id = p_workspace_id;

  if v_paquete_id is not null then
    if v_paquete_activo is not true then
      return false;
    end if;
    select pf.activo into v_rule
    from public.paquete_flags pf
    where pf.paquete_id = v_paquete_id
      and pf.flag_id = v_flag.id;
    return coalesce(v_rule, false);
  end if;

  -- Sin paquete: custom queda off; estándar cae a reglas globales.
  if v_flag.empresa_id is not null then
    return false;
  end if;

  return public.resolver_flag(p_clave, p_usuario_id);
end;
$$;

comment on function public.resolver_workspace_flag(text, uuid, uuid) is
  'Resuelve flag en contexto de sala: fila por (clave, empresa_id del workspace) + paquete del rol.';

-- ---------- 4) resolver_all_flags: solo estándar (compat) ----------
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

comment on function public.resolver_all_flags(uuid) is
  'Mapa de flags estándar globales. Para sesión con workspace usar resolver_session_flags.';

-- ---------- 5) resolver_session_flags: estándar + custom de empresa activa ----------
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
  if p_usuario_id is null then
    return result;
  end if;

  if p_workspace_id is not null then
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

  -- Personal / sin sala: solo estándar
  return public.resolver_all_flags(p_usuario_id);
end;
$$;

comment on function public.resolver_session_flags(uuid, uuid) is
  'Flags de sesión: globales + custom de la empresa del workspace activo. Sin mezclar otros tenants.';

revoke all on function public.resolver_session_flags(uuid, uuid) from public;
grant execute on function public.resolver_session_flags(uuid, uuid) to authenticated, service_role;

-- ---------- 6) RLS flags: sin leak de custom ajenos ----------
drop policy if exists "flags_select_authenticated" on public.flags;
create policy "flags_select_authenticated" on public.flags
  for select to authenticated
  using (
    public.is_super_admin()
    or empresa_id is null
    or exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = flags.empresa_id
        and em.usuario_id = auth.uid()
        and em.estado = 'activo'
    )
    or exists (
      select 1
      from public.workspace_miembros wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.empresa_id = flags.empresa_id
        and wm.usuario_id = auth.uid()
    )
  );

-- ---------- 7) RLS modulo_custom_datos: miembros de sala de la empresa (opción B) ----------
drop policy if exists "modulo_custom_datos_select_authenticated" on public.modulo_custom_datos;
create policy "modulo_custom_datos_select_authenticated"
  on public.modulo_custom_datos for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = modulo_custom_datos.empresa_id
        and em.usuario_id = auth.uid()
        and em.estado = 'activo'
    )
    or exists (
      select 1
      from public.workspace_miembros wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.empresa_id = modulo_custom_datos.empresa_id
        and wm.usuario_id = auth.uid()
    )
  );

drop policy if exists "modulo_custom_datos_write_empresa_admin" on public.modulo_custom_datos;
create policy "modulo_custom_datos_write_empresa_admin"
  on public.modulo_custom_datos for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = modulo_custom_datos.empresa_id
        and em.usuario_id = auth.uid()
        and em.es_admin = true
        and em.estado = 'activo'
    )
    or exists (
      select 1
      from public.workspace_miembros wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.empresa_id = modulo_custom_datos.empresa_id
        and wm.usuario_id = auth.uid()
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = modulo_custom_datos.empresa_id
        and em.usuario_id = auth.uid()
        and em.es_admin = true
        and em.estado = 'activo'
    )
    or exists (
      select 1
      from public.workspace_miembros wm
      join public.workspaces w on w.id = wm.workspace_id
      where w.empresa_id = modulo_custom_datos.empresa_id
        and wm.usuario_id = auth.uid()
    )
  );
