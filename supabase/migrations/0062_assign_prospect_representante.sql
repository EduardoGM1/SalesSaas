-- ============================================================
-- 0062 — Asignar/reasignar Vendedor (representante) en expediente
-- ============================================================

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

comment on function public.assign_prospect_representante(uuid, uuid, uuid, text) is
  'Asigna o reasigna Vendedor (representante) y actualiza user_id del expediente.';
