-- ============================================================
-- 0100 — Sync Tramo 3 BD: ownership inmutable + unique prospect_code
-- 1) Trigger BEFORE UPDATE: rechaza cambio de user_id / workspace_id
--    salvo service_role o GUC salesapp.allow_ownership_change=on
--    (RPCs legítimos de transferencia / reasignación).
-- 2) Índice único (user_id, workspace_id, prospect_code) si no hay
--    duplicados (gate DO). Se conserva el unique (user_id, prospect_code).
-- 3) No hay DEFAULT ni trigger de workspace_id en INSERT.
-- 4) Confirmación documentada (solo lectura): goals unique
--    (user_id, year, month); tool_calculations (user_id, prospect_id, tool).
-- ============================================================

-- ---------- Gate: sin duplicados para el índice nuevo ----------
do $$
declare
  v_dups int;
begin
  select count(*) into v_dups
  from (
    select user_id, workspace_id, prospect_code
    from public.prospects
    where prospect_code is not null
    group by user_id, workspace_id, prospect_code
    having count(*) > 1
  ) d;
  if v_dups > 0 then
    raise exception
      '0100 abortado: hay % grupos duplicados (user_id, workspace_id, prospect_code). Resolver antes del índice.',
      v_dups;
  end if;
end
$$;

create unique index if not exists prospects_user_ws_code_uniq
  on public.prospects (user_id, workspace_id, prospect_code)
  where prospect_code is not null and workspace_id is not null;

-- ---------- Trigger de inmutabilidad ----------
create or replace function public.enforce_immutable_ownership()
returns trigger
language plpgsql
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_changed boolean := false;
begin
  if (v_old ? 'user_id') and (v_new ? 'user_id')
     and v_new->'user_id' is distinct from v_old->'user_id' then
    v_changed := true;
  end if;
  if (v_old ? 'workspace_id') and (v_new ? 'workspace_id')
     and v_new->'workspace_id' is distinct from v_old->'workspace_id' then
    v_changed := true;
  end if;

  if not v_changed then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if lower(coalesce(current_setting('salesapp.allow_ownership_change', true), '')) in ('on', 'true', '1') then
    return new;
  end if;

  raise exception
    'No se puede cambiar user_id ni workspace_id en %. Usa el RPC de transferencia o service_role.',
    tg_table_name
    using errcode = '42501';
end;
$$;

comment on function public.enforce_immutable_ownership() is
  'Tramo 3: bloquea UPDATE de user_id/workspace_id salvo service_role o GUC salesapp.allow_ownership_change.';

drop trigger if exists trg_prospects_immutable_ownership on public.prospects;
create trigger trg_prospects_immutable_ownership
  before update of user_id, workspace_id on public.prospects
  for each row execute function public.enforce_immutable_ownership();

drop trigger if exists trg_sales_immutable_ownership on public.sales;
create trigger trg_sales_immutable_ownership
  before update of user_id, workspace_id on public.sales
  for each row execute function public.enforce_immutable_ownership();

drop trigger if exists trg_calendar_immutable_ownership on public.calendar_entries;
create trigger trg_calendar_immutable_ownership
  before update of user_id, workspace_id on public.calendar_entries
  for each row execute function public.enforce_immutable_ownership();

drop trigger if exists trg_activities_immutable_ownership on public.activities;
create trigger trg_activities_immutable_ownership
  before update of user_id, workspace_id on public.activities
  for each row execute function public.enforce_immutable_ownership();

drop trigger if exists trg_tools_immutable_ownership on public.tool_calculations;
create trigger trg_tools_immutable_ownership
  before update of user_id, workspace_id on public.tool_calculations
  for each row execute function public.enforce_immutable_ownership();

drop trigger if exists trg_prospect_archivos_immutable_ownership on public.prospect_archivos;
create trigger trg_prospect_archivos_immutable_ownership
  before update of workspace_id on public.prospect_archivos
  for each row execute function public.enforce_immutable_ownership();

-- ---------- RPCs: permitir mutación controlada vía GUC ----------
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

  perform set_config('salesapp.allow_ownership_change', 'on', true);

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
  'Transferencia definitiva personal→sala: representante=actor, cerrador=null; GUC ownership para triggers Tramo 3.';

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

  perform set_config('salesapp.allow_ownership_change', 'on', true);

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
  'Asigna o reasigna Vendedor (representante) y actualiza user_id del expediente (GUC ownership Tramo 3).';
