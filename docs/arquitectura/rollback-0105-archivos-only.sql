-- ROLLBACK parcial 0105 — SOLO políticas de prospect_archivos (0058).
-- NO toca tablas backup (evita re-exponer anon sin RLS).
-- Preferir este script si el incidente es solo adjuntos.

begin;

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

commit;
