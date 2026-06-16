-- Herramientas (tool_calculations) visibles y editables en expedientes compartidos

create policy "tool_calc_select_shared" on public.tool_calculations
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.prospect_shares ps
      where ps.prospect_id = tool_calculations.prospect_id
        and ps.shared_with_id = auth.uid()
    )
  );

create policy "tool_calc_insert_shared_edit" on public.tool_calculations
  for insert with check (
    auth.uid() = user_id
    or (
      user_id = (select p.user_id from public.prospects p where p.id = prospect_id)
      and exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = tool_calculations.prospect_id
          and ps.shared_with_id = auth.uid()
          and ps.permission = 'edit'::public.share_permission
      )
    )
  );

create policy "tool_calc_update_shared_edit" on public.tool_calculations
  for update using (
    auth.uid() = user_id
    or exists (
      select 1 from public.prospect_shares ps
      where ps.prospect_id = tool_calculations.prospect_id
        and ps.shared_with_id = auth.uid()
        and ps.permission = 'edit'::public.share_permission
    )
  ) with check (
    user_id = (select p.user_id from public.prospects p where p.id = prospect_id)
  );
