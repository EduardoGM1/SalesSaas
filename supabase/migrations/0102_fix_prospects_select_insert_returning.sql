-- Hotfix Etapa 1: prospects SELECT tras INSERT … RETURNING.
-- 0101 dejó prospects_select_tenant_role = user_can_access_prospect(uid, id).
-- Esa función hace EXISTS sobre public.prospects; en el mismo INSERT … RETURNING
-- la fila nueva no es visible al re-SELECT → RLS “new row violates…”.
-- Atajo por columnas de la fila (dueño + membresía), igual que el predicado D1.

begin;

drop policy if exists "prospects_select_tenant_role" on public.prospects;
create policy "prospects_select_tenant_role" on public.prospects
  for select to authenticated using (
    (
      user_id = auth.uid()
      and public.user_in_workspace(auth.uid(), workspace_id)
    )
    or public.user_can_access_prospect(auth.uid(), id)
  );

comment on policy "prospects_select_tenant_role" on public.prospects is
  'Etapa 1 + hotfix 0102: dueño vía columnas de fila (INSERT RETURNING) ∨ user_can_access_prospect.';

commit;
