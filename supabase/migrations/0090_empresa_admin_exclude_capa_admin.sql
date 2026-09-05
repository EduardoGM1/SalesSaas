-- 0090: Admin de empresa — atajo de permisos solo capa:app.
-- Superadmin sigue recibiendo el catálogo completo (incluye capa:admin).
-- No implementa techo_plataforma/techo_empresa; solo deja de inflar el set tenant.

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
    from public.permisos
    where capa = 'app';
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

comment on function public.effective_workspace_permissions(uuid, uuid) is
  'Permisos efectivos en un workspace. Superadmin: catálogo completo. Admin de empresa: capa=app (sin panel de plataforma). Resto: rol ∪ overrides ∪ delegación.';
