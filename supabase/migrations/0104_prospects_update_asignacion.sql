-- ============================================================
-- 0104 — RLS UPDATE prospects (D7: asignado puede editar)
--
-- Alinea edición en BD con la visibilidad de 0101: quien está en
-- cualquier columna de persona de prospect_workflows puede actualizar
-- la ficha (user_assigned_on_prospect_workflow), además de dueño+editar,
-- share con permiso de edición, excepción gerente/asistente/admin y
-- workflow:revisar.
--
-- Elimina el atajo amplio expedientes:ver_equipo del UPDATE (0061/0054),
-- que permitía editar sin estar asignado ni ser dueño con editar.
-- ============================================================

begin;

drop policy if exists "prospects_update_tenant_role" on public.prospects;

create policy "prospects_update_tenant_role" on public.prospects
  for update to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      (
        user_id = auth.uid()
        and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar')
      )
      or public.user_assigned_on_prospect_workflow(auth.uid(), id)
      or exists (
        select 1
        from public.prospect_shares ps
        where ps.prospect_id = prospects.id
          and ps.shared_with_id = auth.uid()
          and public.share_can_edit(ps.permission)
      )
      or public.es_gerente_asistente_o_admin(auth.uid(), workspace_id)
      or public.workspace_has_permission(auth.uid(), workspace_id, 'workflow:revisar')
    )
  )
  with check (
    public.user_in_workspace(auth.uid(), workspace_id)
  );

commit;
