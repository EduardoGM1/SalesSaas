-- 0063: RBAC aditivo — elimina semántica deny; limpia overrides restrictivos.
-- Modelo: efectivo = rol ∪ overrides(otorgado=true). Nunca resta.
-- Aplicar en Supabase SQL Editor antes/junto al deploy de API.

-- 1) Contar denies (documentar resultado en docs/RBAC-ADDITIVE.md tras correr en prod)
-- SELECT count(*) FILTER (WHERE otorgado) AS adds,
--        count(*) FILTER (WHERE NOT otorgado) AS denies
-- FROM public.usuario_permisos_override;

-- 2) Limpiar denies huérfanos (sin semántica de resta ya no aportan)
delete from public.workspace_usuario_permisos_override where otorgado = false;
delete from public.usuario_permisos_override where otorgado = false;

comment on table public.usuario_permisos_override is
  'Overrides por usuario (plataforma). Solo aditivos: otorgado=true suma sobre el rol. Deny (false) deprecado — se limpia en 0063.';

comment on table public.workspace_usuario_permisos_override is
  'Overrides por usuario en sala. Solo aditivos (otorgado=true). Deny deprecado — se limpia en 0063.';

-- 3) Resolver global: unión rol + grants (sin EXCEPT)
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
  v_keys text[];
begin
  select is_super_admin, role_id into v_super, v_role_id
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
  ) s;

  return coalesce(v_keys, '{}');
end;
$$;

-- 4) Resolver por workspace: unión rol_sala + grants sala (sin EXCEPT)
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
begin
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

  select wm.role_id into v_role_id
  from public.workspace_miembros wm
  where wm.usuario_id = p_usuario_id and wm.workspace_id = p_workspace_id;

  if v_role_id is not null then
    select coalesce(array_agg(distinct p.clave), '{}') into v_keys
    from public.rol_permisos rp
    join public.permisos p on p.id = rp.permiso_id
    where rp.rol_id = v_role_id;
  else
    v_keys := public.resolve_user_permission_keys(p_usuario_id);
  end if;

  -- Compatibilidad: el gerente legacy recibe permisos de equipo.
  if exists (
    select 1 from public.workspace_miembros wm
    where wm.usuario_id = p_usuario_id
      and wm.workspace_id = p_workspace_id
      and wm.rol_en_workspace = 'gerente'
  ) then
    v_keys := v_keys || array[
      'expedientes:ver_equipo',
      'ventas:ver_equipo',
      'dashboard:ver_equipo',
      'metas:ver_equipo'
    ];
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
  ) granted;

  return coalesce(v_keys, '{}');
end;
$$;
