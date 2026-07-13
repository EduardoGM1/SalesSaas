-- Nivel workspace + pin a espacio del receptor (mismo expediente, no copia)

alter type public.share_permission add value if not exists 'workspace';

alter table public.prospect_shares
  add column if not exists added_to_workspace_at timestamptz;

comment on column public.prospect_shares.added_to_workspace_at is
  'Cuando el receptor pinnea el expediente en su lista /clients (mismo registro).';

create or replace function public.share_can_edit(p_permission public.share_permission)
returns boolean
language sql
immutable
as $$
  select p_permission::text in ('edit', 'workspace');
$$;

-- Prospects update shared
drop policy if exists "prospects_update_shared_edit" on public.prospects;
create policy "prospects_update_shared_edit" on public.prospects
  for update using (
    exists (
      select 1 from public.prospect_shares ps
      where ps.prospect_id = prospects.id
        and ps.shared_with_id = auth.uid()
        and public.share_can_edit(ps.permission)
    )
  );

-- Tools: recrear políticas de 0014 con edit|workspace
drop policy if exists "tool_calc_insert_shared_edit" on public.tool_calculations;
drop policy if exists "tool_calc_update_shared_edit" on public.tool_calculations;

create policy "tool_calc_insert_shared_edit" on public.tool_calculations
  for insert with check (
    auth.uid() = user_id
    or (
      user_id = (select p.user_id from public.prospects p where p.id = prospect_id)
      and exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = tool_calculations.prospect_id
          and ps.shared_with_id = auth.uid()
          and public.share_can_edit(ps.permission)
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
        and public.share_can_edit(ps.permission)
    )
  ) with check (
    user_id = (select p.user_id from public.prospects p where p.id = prospect_id)
  );

-- Receptor puede pinnear (update share row)
drop policy if exists "shares_update_recipient_pin" on public.prospect_shares;
create policy "shares_update_recipient_pin" on public.prospect_shares
  for update using (
    auth.uid() = shared_with_id
    and public.share_can_edit(permission)
  )
  with check (
    auth.uid() = shared_with_id
    and public.share_can_edit(permission)
  );
