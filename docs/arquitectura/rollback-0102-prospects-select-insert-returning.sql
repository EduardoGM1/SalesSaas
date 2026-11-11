-- Rollback de 0102: vuelve a la policy SELECT de 0101 (solo user_can_access_prospect).
-- OJO: reintroduce el fallo de INSERT … RETURNING en creación de expedientes.

begin;

drop policy if exists "prospects_select_tenant_role" on public.prospects;
create policy "prospects_select_tenant_role" on public.prospects
  for select to authenticated using (
    public.user_can_access_prospect(auth.uid(), id)
  );

commit;
