-- Lectura de ventas y actividades en expedientes compartidos (mismo patrón que tool_calc_select_shared).

drop policy if exists "sales_select_shared" on public.sales;
create policy "sales_select_shared" on public.sales
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.prospect_shares ps
      where ps.prospect_id = sales.prospect_id
        and ps.shared_with_id = auth.uid()
    )
  );

drop policy if exists "activities_select_shared" on public.activities;
create policy "activities_select_shared" on public.activities
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.prospect_shares ps
      where ps.prospect_id = activities.prospect_id
        and ps.shared_with_id = auth.uid()
    )
  );

comment on policy "sales_select_shared" on public.sales is
  'Owner o colaborador con share pueden leer ventas del expediente.';
comment on policy "activities_select_shared" on public.activities is
  'Owner o colaborador con share pueden leer notas/actividad del expediente.';
