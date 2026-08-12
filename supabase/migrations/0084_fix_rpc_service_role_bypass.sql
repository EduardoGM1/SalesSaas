-- ============================================================
-- 0084 — Permitir service_role en RPC con assert auth
-- La API usa service key; auth.uid() es null en ese contexto.
-- ============================================================

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
  if coalesce(auth.role(), '') = 'service_role' then
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

-- list_permisos_delegados_keys: service_role delega autorización a la API
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
  if coalesce(auth.role(), '') = 'service_role' then
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
  end if;

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
