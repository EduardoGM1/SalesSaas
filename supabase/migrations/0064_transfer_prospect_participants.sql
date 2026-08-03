-- ============================================================
-- Transfer personal→sala: al upsert de workflow, forzar
-- representante = actor, cerrador = null (reasignación limpia).
-- ============================================================

create or replace function public.transfer_prospect_to_sala(
  p_prospect_id uuid,
  p_actor_id uuid,
  p_target_workspace_id uuid
)
returns public.prospects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prospect public.prospects;
  v_src public.workspaces;
  v_dst public.workspaces;
  v_empresa_nombre text;
  v_gerente_id uuid;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'No autorizado';
  end if;

  select * into v_prospect from public.prospects where id = p_prospect_id for update;
  if not found then raise exception 'Expediente no encontrado'; end if;
  if v_prospect.user_id is distinct from p_actor_id then
    raise exception 'Solo el dueño puede transferir el expediente';
  end if;

  select * into v_src from public.workspaces where id = v_prospect.workspace_id;
  if v_src.tipo is distinct from 'personal' then
    raise exception 'Solo se puede transferir desde el workspace personal';
  end if;

  select * into v_dst from public.workspaces
  where id = p_target_workspace_id and tipo = 'sala_de_venta' and estado = 'activo';
  if not found then raise exception 'Sala destino no encontrada o inactiva'; end if;
  if not public.user_in_workspace(p_actor_id, v_dst.id) then
    raise exception 'Debes ser miembro de la sala destino';
  end if;

  select nombre into v_empresa_nombre from public.empresas where id = v_dst.empresa_id;
  select wm.usuario_id into v_gerente_id
  from public.workspace_miembros wm
  where wm.workspace_id = v_dst.id and wm.rol_en_workspace = 'gerente'
  order by wm.fecha_union
  limit 1;

  update public.prospects
  set workspace_id = v_dst.id, updated_at = now()
  where id = p_prospect_id
  returning * into v_prospect;

  update public.tool_calculations set workspace_id = v_dst.id where prospect_id = p_prospect_id;
  update public.sales set workspace_id = v_dst.id where prospect_id = p_prospect_id;
  update public.activities set workspace_id = v_dst.id where prospect_id = p_prospect_id;
  update public.calendar_entries set workspace_id = v_dst.id where prospect_id = p_prospect_id;
  update public.prospect_archivos set workspace_id = v_dst.id where prospect_id = p_prospect_id;

  insert into public.prospect_workflows (
    prospect_id, workspace_id, representante_id, cerrador_id, gerente_id, created_by, estado
  ) values (
    p_prospect_id, v_dst.id, p_actor_id, null, v_gerente_id, p_actor_id, 'en_progreso'
  )
  on conflict (prospect_id) do update
  set workspace_id = excluded.workspace_id,
      representante_id = excluded.representante_id,
      cerrador_id = null,
      gerente_id = coalesce(excluded.gerente_id, public.prospect_workflows.gerente_id),
      updated_at = now();

  insert into public.prospect_workflow_events (
    prospect_id, workspace_id, actor_id, actor_role, event_type,
    etapa_origen, etapa_destino, metadata
  ) values (
    p_prospect_id, v_dst.id, p_actor_id, 'representante', 'transferido',
    null, null,
    jsonb_build_object(
      'origen', 'personal',
      'destino_sala', v_dst.nombre,
      'destino_empresa', v_empresa_nombre,
      'vendedor_id', p_actor_id,
      'cerrador_id', null
    )
  );

  return v_prospect;
end;
$$;

comment on function public.transfer_prospect_to_sala(uuid, uuid, uuid) is
  'Transferencia definitiva personal→sala: representante=actor, cerrador=null, evento transferido.';
