-- ============================================================
-- 0058 — Reasignación de Cerrador + Archivos del expediente
-- Extiende assign_prospect_closer para permitir reasignación
-- gerencial y añade adjuntos del expediente (tabla + bucket).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Reasignación de Cerrador (mismo RPC, más etapas)
-- ─────────────────────────────────────────────────────────────
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
  if not found then raise exception 'Workflow no encontrado'; end if;
  if v_workflow.estado in ('completado', 'cancelado') then
    raise exception 'El expediente ya está cerrado';
  end if;
  if not public.user_in_workspace(p_cerrador_id, v_workflow.workspace_id) then
    raise exception 'El cerrador no pertenece a esta sala';
  end if;

  -- Primera asignación: solo en etapa dedicada.
  -- Reasignación: gerente puede cambiar cerrador en etapas de cierre.
  if v_workflow.etapa_actual = 'asignacion_cerrador' then
    v_is_reassign := false;
  elsif v_workflow.etapa_actual in ('money_box', 'tipo_cambio', 'venta')
    and v_workflow.cerrador_id is not null then
    v_is_reassign := true;
  else
    raise exception 'El expediente no está listo para asignar cerrador';
  end if;

  if v_is_reassign and v_workflow.cerrador_id = p_cerrador_id then
    return v_workflow;
  end if;

  v_prev := v_workflow.cerrador_id;

  if v_is_reassign then
    update public.prospect_workflows
    set cerrador_id = p_cerrador_id,
        version = version + 1,
        updated_at = now()
    where prospect_id = p_prospect_id
    returning * into v_workflow;

    insert into public.prospect_workflow_events (
      prospect_id, workspace_id, actor_id, actor_role, event_type,
      etapa_origen, etapa_destino, metadata
    ) values (
      p_prospect_id, v_workflow.workspace_id, p_actor_id, p_actor_role,
      'cerrador_reasignado',
      v_workflow.etapa_actual, v_workflow.etapa_actual,
      jsonb_build_object(
        'cerrador_id', p_cerrador_id,
        'cerrador_anterior_id', v_prev
      )
    );
  else
    update public.prospect_workflows
    set cerrador_id = p_cerrador_id,
        etapa_actual = 'money_box',
        estado = 'en_progreso',
        version = version + 1,
        updated_at = now()
    where prospect_id = p_prospect_id
    returning * into v_workflow;

    insert into public.prospect_workflow_events (
      prospect_id, workspace_id, actor_id, actor_role, event_type,
      etapa_origen, etapa_destino, metadata
    ) values (
      p_prospect_id, v_workflow.workspace_id, p_actor_id, p_actor_role,
      'cerrador_asignado',
      'asignacion_cerrador', 'money_box',
      jsonb_build_object('cerrador_id', p_cerrador_id)
    );
  end if;

  return v_workflow;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) Tabla de archivos del expediente
-- ─────────────────────────────────────────────────────────────
create table if not exists public.prospect_archivos (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  nombre text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create index if not exists prospect_archivos_prospect_idx
  on public.prospect_archivos (prospect_id, created_at desc);

alter table public.prospect_archivos enable row level security;

drop policy if exists "prospect_archivos_select" on public.prospect_archivos;
create policy "prospect_archivos_select" on public.prospect_archivos
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      exists (
        select 1 from public.prospects p
        where p.id = prospect_archivos.prospect_id
          and (
            p.user_id = auth.uid()
            or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
            or exists (
              select 1 from public.prospect_workflows pw
              where pw.prospect_id = p.id and pw.cerrador_id = auth.uid()
            )
            or exists (
              select 1 from public.prospect_shares ps
              where ps.prospect_id = p.id and ps.shared_with_id = auth.uid()
            )
          )
      )
    )
  );

drop policy if exists "prospect_archivos_insert" on public.prospect_archivos;
create policy "prospect_archivos_insert" on public.prospect_archivos
  for insert to authenticated with check (
    uploaded_by = auth.uid()
    and public.user_in_workspace(auth.uid(), workspace_id)
    and exists (
      select 1 from public.prospects p
      where p.id = prospect_archivos.prospect_id
        and p.workspace_id = prospect_archivos.workspace_id
        and (
          p.user_id = auth.uid()
          or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
          or exists (
            select 1 from public.prospect_workflows pw
            where pw.prospect_id = p.id and pw.cerrador_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "prospect_archivos_delete" on public.prospect_archivos;
create policy "prospect_archivos_delete" on public.prospect_archivos
  for delete to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      uploaded_by = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3) Bucket privado de adjuntos
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prospect-files',
  'prospect-files',
  false,
  10485760,
  array[
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lectura/escritura solo vía service_role (API). Sin policies para authenticated.

-- ─────────────────────────────────────────────────────────────
-- 4) Transferencia Personal → Sala también mueve archivos
-- ─────────────────────────────────────────────────────────────
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
    prospect_id, workspace_id, representante_id, gerente_id, created_by
  ) values (
    p_prospect_id, v_dst.id, p_actor_id, v_gerente_id, p_actor_id
  )
  on conflict (prospect_id) do update
  set workspace_id = excluded.workspace_id,
      gerente_id = coalesce(public.prospect_workflows.gerente_id, excluded.gerente_id),
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
      'destino_empresa', v_empresa_nombre
    )
  );

  return v_prospect;
end;
$$;

comment on table public.prospect_archivos is
  'Adjuntos del expediente: mismo registro, sin copias; storage en bucket prospect-files.';
comment on function public.assign_prospect_closer(uuid, uuid, uuid, text) is
  'Asigna o reasigna Cerrador; reasignación no cambia la etapa actual.';
