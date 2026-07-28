-- ============================================================
-- 0055 — Workflow comercial auditable por expediente
-- Estado mutable mínimo + historial append-only.
-- ============================================================

insert into public.permisos (clave, nombre_visible, modulo, capa) values
  ('workflow:ver', 'Ver workflow del expediente', 'workflow', 'app'),
  ('workflow:avanzar', 'Completar etapas operativas', 'workflow', 'app'),
  ('workflow:revisar', 'Revisar expedientes como gerente', 'workflow', 'app'),
  ('workflow:asignar_cerrador', 'Asignar cerradores', 'workflow', 'app'),
  ('workflow:cerrar', 'Trabajar etapas de cierre', 'workflow', 'app')
on conflict (clave) do nothing;

create table if not exists public.prospect_workflows (
  prospect_id uuid primary key references public.prospects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  etapa_actual text not null default 'representante',
  estado text not null default 'en_progreso' check (estado in ('en_progreso', 'en_revision', 'devuelto', 'completado', 'cancelado')),
  representante_id uuid references public.profiles(id) on delete set null,
  gerente_id uuid references public.profiles(id) on delete set null,
  cerrador_id uuid references public.profiles(id) on delete set null,
  exchange_rate_snapshot jsonb,
  sale_snapshot jsonb,
  version integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint prospect_workflow_stage_check check (
    etapa_actual in (
      'representante',
      'survey',
      'worksheet',
      'proyeccion',
      'revision_gerente',
      'asignacion_cerrador',
      'money_box',
      'tipo_cambio',
      'venta',
      'completado'
    )
  )
);

create table if not exists public.prospect_workflow_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  event_type text not null,
  etapa_origen text,
  etapa_destino text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prospect_workflows_workspace_idx
  on public.prospect_workflows (workspace_id, etapa_actual);
create index if not exists prospect_workflows_closer_idx
  on public.prospect_workflows (cerrador_id, etapa_actual);
create index if not exists prospect_workflow_events_timeline_idx
  on public.prospect_workflow_events (prospect_id, created_at, id);

create or replace function public.initialize_prospect_workflow_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.prospect_workflow_events (
    prospect_id,
    workspace_id,
    actor_id,
    actor_role,
    event_type,
    etapa_origen,
    etapa_destino,
    metadata
  ) values (
    new.prospect_id,
    new.workspace_id,
    new.created_by,
    'representante',
    'workflow_iniciado',
    null,
    new.etapa_actual,
    '{}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists prospect_workflow_initial_event on public.prospect_workflows;
create trigger prospect_workflow_initial_event
after insert on public.prospect_workflows
for each row execute function public.initialize_prospect_workflow_event();

create or replace function public.prevent_workflow_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'El historial del workflow es inmutable';
end;
$$;

drop trigger if exists workflow_events_append_only on public.prospect_workflow_events;
create trigger workflow_events_append_only
before update or delete on public.prospect_workflow_events
for each row execute function public.prevent_workflow_event_mutation();

create or replace function public.transition_prospect_workflow(
  p_prospect_id uuid,
  p_actor_id uuid,
  p_expected_stage text,
  p_next_stage text,
  p_event_type text,
  p_actor_role text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.prospect_workflows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow public.prospect_workflows;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'No autorizado';
  end if;

  select * into v_workflow
  from public.prospect_workflows
  where prospect_id = p_prospect_id
  for update;
  if not found then raise exception 'Workflow no encontrado'; end if;
  if v_workflow.etapa_actual <> p_expected_stage then
    raise exception 'La etapa cambió; actualiza el expediente e intenta de nuevo';
  end if;

  update public.prospect_workflows
  set etapa_actual = p_next_stage,
      estado = case
        when p_next_stage = 'revision_gerente' then 'en_revision'
        when p_event_type = 'devuelto' then 'devuelto'
        when p_next_stage = 'completado' then 'completado'
        else 'en_progreso'
      end,
      exchange_rate_snapshot = case
        when p_next_stage = 'venta' and p_metadata ? 'exchange_rate'
          then p_metadata -> 'exchange_rate'
        else exchange_rate_snapshot
      end,
      sale_snapshot = case
        when p_next_stage = 'completado' and p_metadata ? 'sale'
          then p_metadata -> 'sale'
        else sale_snapshot
      end,
      version = version + 1,
      updated_at = now(),
      completed_at = case when p_next_stage = 'completado' then now() else completed_at end
  where prospect_id = p_prospect_id
  returning * into v_workflow;

  insert into public.prospect_workflow_events (
    prospect_id,
    workspace_id,
    actor_id,
    actor_role,
    event_type,
    etapa_origen,
    etapa_destino,
    metadata
  ) values (
    p_prospect_id,
    v_workflow.workspace_id,
    p_actor_id,
    p_actor_role,
    p_event_type,
    p_expected_stage,
    p_next_stage,
    coalesce(p_metadata, '{}'::jsonb)
  );
  return v_workflow;
end;
$$;

create or replace function public.assign_prospect_closer(
  p_prospect_id uuid,
  p_actor_id uuid,
  p_cerrador_id uuid,
  p_actor_role text default 'gerente'
)
returns public.prospect_workflows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow public.prospect_workflows;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'No autorizado';
  end if;

  select * into v_workflow
  from public.prospect_workflows
  where prospect_id = p_prospect_id
  for update;
  if not found then raise exception 'Workflow no encontrado'; end if;
  if v_workflow.etapa_actual <> 'asignacion_cerrador' then
    raise exception 'El expediente no está listo para asignar cerrador';
  end if;
  if not public.user_in_workspace(p_cerrador_id, v_workflow.workspace_id) then
    raise exception 'El cerrador no pertenece a esta sala';
  end if;

  update public.prospect_workflows
  set cerrador_id = p_cerrador_id,
      etapa_actual = 'money_box',
      estado = 'en_progreso',
      version = version + 1,
      updated_at = now()
  where prospect_id = p_prospect_id
  returning * into v_workflow;

  insert into public.prospect_workflow_events (
    prospect_id,
    workspace_id,
    actor_id,
    actor_role,
    event_type,
    etapa_origen,
    etapa_destino,
    metadata
  ) values (
    p_prospect_id,
    v_workflow.workspace_id,
    p_actor_id,
    p_actor_role,
    'cerrador_asignado',
    'asignacion_cerrador',
    'money_box',
    jsonb_build_object('cerrador_id', p_cerrador_id)
  );
  return v_workflow;
end;
$$;

revoke all on function public.transition_prospect_workflow(uuid, uuid, text, text, text, text, jsonb) from public;
revoke all on function public.assign_prospect_closer(uuid, uuid, uuid, text) from public;
grant execute on function public.transition_prospect_workflow(uuid, uuid, text, text, text, text, jsonb)
  to service_role;
grant execute on function public.assign_prospect_closer(uuid, uuid, uuid, text)
  to service_role;

alter table public.prospect_workflows enable row level security;
alter table public.prospect_workflow_events enable row level security;

drop policy if exists "workflow_select_scoped" on public.prospect_workflows;
create policy "workflow_select_scoped" on public.prospect_workflows
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      representante_id = auth.uid()
      or cerrador_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'workflow:ver')
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
    )
  );

drop policy if exists "workflow_events_select_scoped" on public.prospect_workflow_events;
create policy "workflow_events_select_scoped" on public.prospect_workflow_events
  for select to authenticated using (
    exists (
      select 1 from public.prospect_workflows pw
      where pw.prospect_id = prospect_workflow_events.prospect_id
        and public.user_in_workspace(auth.uid(), pw.workspace_id)
        and (
          pw.representante_id = auth.uid()
          or pw.cerrador_id = auth.uid()
          or public.workspace_has_permission(auth.uid(), pw.workspace_id, 'workflow:ver')
          or public.workspace_has_permission(auth.uid(), pw.workspace_id, 'expedientes:ver_equipo')
        )
    )
  );

comment on table public.prospect_workflows is 'Estado y asignaciones actuales del flujo comercial.';
comment on table public.prospect_workflow_events is 'Historial append-only de cada transición del expediente.';
