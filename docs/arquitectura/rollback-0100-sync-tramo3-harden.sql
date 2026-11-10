-- Rollback exacto de 0100_sync_tramo3_harden_ownership.sql
-- Quita triggers/índice y restaura transfer/assign a la versión 0064/0062
-- (sin GUC). No toca datos.

drop trigger if exists trg_prospects_immutable_ownership on public.prospects;
drop trigger if exists trg_sales_immutable_ownership on public.sales;
drop trigger if exists trg_calendar_immutable_ownership on public.calendar_entries;
drop trigger if exists trg_activities_immutable_ownership on public.activities;
drop trigger if exists trg_tools_immutable_ownership on public.tool_calculations;
drop trigger if exists trg_prospect_archivos_immutable_ownership on public.prospect_archivos;

drop function if exists public.enforce_immutable_ownership();

drop index if exists public.prospects_user_ws_code_uniq;

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

create or replace function public.assign_prospect_representante(
  p_prospect_id uuid,
  p_actor_id uuid,
  p_representante_id uuid,
  p_actor_role text default 'gerente'
)
returns public.prospect_workflows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow public.prospect_workflows;
  v_prev uuid;
  v_is_reassign boolean := false;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'No autorizado';
  end if;

  select * into v_workflow
  from public.prospect_workflows
  where prospect_id = p_prospect_id
  for update;
  if not found then raise exception 'Participantes del expediente no encontrados'; end if;
  if v_workflow.estado = 'cancelado' then
    raise exception 'El expediente está cancelado';
  end if;
  if not public.user_in_workspace(p_representante_id, v_workflow.workspace_id) then
    raise exception 'El vendedor no pertenece a esta sala';
  end if;

  v_prev := v_workflow.representante_id;
  v_is_reassign := v_prev is not null and v_prev is distinct from p_representante_id;

  if v_prev is not distinct from p_representante_id then
    return v_workflow;
  end if;

  update public.prospect_workflows
  set representante_id = p_representante_id,
      estado = case when estado = 'completado' then estado else 'en_progreso' end,
      version = version + 1,
      updated_at = now()
  where prospect_id = p_prospect_id
  returning * into v_workflow;

  update public.prospects
  set user_id = p_representante_id, updated_at = now()
  where id = p_prospect_id;

  insert into public.prospect_workflow_events (
    prospect_id, workspace_id, actor_id, actor_role, event_type,
    etapa_origen, etapa_destino, metadata
  ) values (
    p_prospect_id, v_workflow.workspace_id, p_actor_id, p_actor_role,
    case when v_is_reassign then 'vendedor_reasignado' else 'vendedor_asignado' end,
    null, null,
    jsonb_build_object(
      'representante_id', p_representante_id,
      'representante_anterior_id', v_prev
    )
  );

  return v_workflow;
end;
$$;

revoke all on function public.assign_prospect_representante(uuid, uuid, uuid, text) from public;
grant execute on function public.assign_prospect_representante(uuid, uuid, uuid, text) to service_role;
