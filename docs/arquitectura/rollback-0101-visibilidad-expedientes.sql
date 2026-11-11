-- Rollback Etapa 1 visibilidad (0101). Restaura user_can_access_prospect (0052)
-- y policies SELECT previas (0056/0055/0054/0083). NO borra índices nuevos
-- (son inocuos). Probar en transacción local antes de apply en prod.

begin;

create or replace function public.user_can_access_prospect(uid uuid, prospect_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    uid is not null
    and prospect_id is not null
    and (
      exists (
        select 1 from public.prospects p
        where p.id = prospect_id
          and public.user_in_workspace(uid, p.workspace_id)
      )
      or exists (
        select 1
        from public.prospect_shares ps
        join public.prospects p on p.id = ps.prospect_id
        where ps.prospect_id = prospect_id
          and ps.shared_with_id = uid
          and public.user_in_workspace(uid, p.workspace_id)
      )
    );
$$;

revoke all on function public.user_can_access_prospect(uuid, uuid) from public;
grant execute on function public.user_can_access_prospect(uuid, uuid) to authenticated, service_role;

drop policy if exists "prospects_select_tenant_role" on public.prospects;
create policy "prospects_select_tenant_role" on public.prospects
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_workflows pw
        where pw.prospect_id = prospects.id and pw.cerrador_id = auth.uid()
      )
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = prospects.id and ps.shared_with_id = auth.uid()
      )
    )
  );

drop policy if exists "tools_select_tenant_role" on public.tool_calculations;
create policy "tools_select_tenant_role" on public.tool_calculations
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_workflows pw
        where pw.prospect_id = tool_calculations.prospect_id and pw.cerrador_id = auth.uid()
      )
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = tool_calculations.prospect_id and ps.shared_with_id = auth.uid()
      )
    )
  );

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

drop policy if exists "activities_select_tenant_role" on public.activities;
create policy "activities_select_tenant_role" on public.activities
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_shares ps
        join public.prospects p on p.id = ps.prospect_id
        where ps.prospect_id = activities.prospect_id
          and ps.shared_with_id = auth.uid()
          and p.workspace_id = activities.workspace_id
      )
    )
  );

drop policy if exists "sales_select_tenant_role" on public.sales;
create policy "sales_select_tenant_role" on public.sales
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'ventas:ver_equipo')
      or exists (
        select 1 from public.prospect_shares ps
        join public.prospects p on p.id = ps.prospect_id
        where ps.prospect_id = sales.prospect_id
          and ps.shared_with_id = auth.uid()
          and p.workspace_id = sales.workspace_id
      )
    )
  );

drop policy if exists "calendar_select_tenant_role" on public.calendar_entries;
create policy "calendar_select_tenant_role" on public.calendar_entries
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
    )
  );

drop function if exists public.user_assigned_on_prospect_workflow(uuid, uuid);
drop function if exists public.es_gerente_asistente_o_admin(uuid, uuid);

commit;
