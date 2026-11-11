-- Rollback de emergencia 0104: restaura policy UPDATE de 0061
-- (incluye atajo expedientes:ver_equipo y solo rep/cerrador en workflow).
-- Revierte D7 en RLS; usar solo si 0104 rompe edición en prod.

begin;

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

commit;
