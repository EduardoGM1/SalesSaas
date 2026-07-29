-- ============================================================
-- 0061 — Edición por participantes + limpieza índices pipeline
-- Representante y cerrador pueden actualizar prospects en sala.
-- ============================================================

drop policy if exists "prospects_update_tenant_role" on public.prospects;
create policy "prospects_update_tenant_role" on public.prospects
  for update to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      (user_id = auth.uid() and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'))
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_workflows pw
        where pw.prospect_id = prospects.id
          and (
            pw.representante_id = auth.uid()
            or pw.cerrador_id = auth.uid()
          )
      )
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = prospects.id
          and ps.shared_with_id = auth.uid()
          and public.share_can_edit(ps.permission)
      )
    )
  )
  with check (public.user_in_workspace(auth.uid(), workspace_id));

-- Índices legacy orientados a etapas de pipeline (ya no usadas).
drop index if exists public.prospect_workflows_workspace_idx;
drop index if exists public.prospect_workflows_closer_idx;

create index if not exists prospect_workflows_workspace_estado_idx
  on public.prospect_workflows (workspace_id, estado);
create index if not exists prospect_workflows_closer_estado_idx
  on public.prospect_workflows (cerrador_id, estado)
  where cerrador_id is not null;

comment on column public.prospect_workflow_events.etapa_origen is
  'DEPRECATED: sin pipeline; conservado solo para auditoría histórica.';
comment on column public.prospect_workflow_events.etapa_destino is
  'DEPRECATED: sin pipeline; conservado solo para auditoría histórica.';
