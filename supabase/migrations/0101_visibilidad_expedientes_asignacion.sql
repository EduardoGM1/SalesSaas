-- Etapa 1: visibilidad de expedientes por asignación (D1–D5).
-- Excepción = gerente / asistente_sala / asistente_empresa / es_admin / superadmin
-- (NUNCA por expedientes:ver_equipo). Lectura = excepción ∨ dueño ∨ persona en
-- prospect_workflows (gerente/rep/cerrador + collab 0093) ∨ share activo.
-- Alinea user_can_access_prospect (cierra hallazgo realtime/guests).

begin;

-- ---------- Excepción de rol (no usa ver_equipo) ----------
create or replace function public.es_gerente_asistente_o_admin(uid uuid, p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    uid is not null
    and p_workspace_id is not null
    and (
      exists (
        select 1 from public.profiles pr
        where pr.id = uid and pr.is_super_admin is true
      )
      or exists (
        select 1
        from public.workspace_miembros wm
        left join public.roles r on r.id = wm.role_id
        where wm.workspace_id = p_workspace_id
          and wm.usuario_id = uid
          and (
            wm.rol_en_workspace = 'gerente'
            or r.slug in ('asistente_sala', 'asistente_empresa', 'gerente')
          )
      )
      or exists (
        select 1
        from public.workspaces w
        join public.empresa_miembros em
          on em.empresa_id = w.empresa_id
         and em.usuario_id = uid
         and em.es_admin is true
        where w.id = p_workspace_id
          and w.empresa_id is not null
      )
    );
$$;

revoke all on function public.es_gerente_asistente_o_admin(uuid, uuid) from public;
grant execute on function public.es_gerente_asistente_o_admin(uuid, uuid) to authenticated, service_role;

comment on function public.es_gerente_asistente_o_admin(uuid, uuid) is
  'Excepción de visibilidad de sala: gerente / asistente_sala / asistente_empresa / es_admin / superadmin. No usa ver_equipo.';

-- Asignado en cualquier columna de persona del workflow (D1).
create or replace function public.user_assigned_on_prospect_workflow(uid uuid, p_prospect_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.prospect_workflows pw
    where pw.prospect_id = p_prospect_id
      and uid is not null
      and uid in (
        pw.gerente_id,
        pw.representante_id,
        pw.cerrador_id,
        pw.hostes_id,
        pw.filtro_id,
        pw.opc_id,
        pw.liner_id,
        pw.ftb_id,
        pw.inhouse_closer1_id,
        pw.inhouse_closer2_id,
        pw.imagen_id,
        pw.self_gen_id,
        pw.members_closer1_id,
        pw.members_closer2_id
      )
  );
$$;

revoke all on function public.user_assigned_on_prospect_workflow(uuid, uuid) from public;
grant execute on function public.user_assigned_on_prospect_workflow(uuid, uuid) to authenticated, service_role;

-- Predicado único de lectura (sustituye membership-only de 0052).
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
    and exists (
      select 1 from public.prospects p
      where p.id = prospect_id
        and (
          public.es_gerente_asistente_o_admin(uid, p.workspace_id)
          or p.user_id = uid
          or public.user_assigned_on_prospect_workflow(uid, p.id)
          or exists (
            select 1 from public.prospect_shares ps
            where ps.prospect_id = p.id
              and ps.shared_with_id = uid
          )
        )
        and (
          -- Debe pertenecer al WS del expediente, salvo share (guest con share).
          public.user_in_workspace(uid, p.workspace_id)
          or exists (
            select 1 from public.prospect_shares ps2
            where ps2.prospect_id = p.id and ps2.shared_with_id = uid
          )
        )
    );
$$;

revoke all on function public.user_can_access_prospect(uuid, uuid) from public;
grant execute on function public.user_can_access_prospect(uuid, uuid) to authenticated, service_role;

comment on function public.user_can_access_prospect(uuid, uuid) is
  'Lectura de expediente: excepción rol ∨ dueño ∨ asignación workflow ∨ share. Alineado a Etapa 1 visibilidad.';

-- ---------- RLS SELECT: prospects ----------
drop policy if exists "prospects_select_tenant_role" on public.prospects;
create policy "prospects_select_tenant_role" on public.prospects
  for select to authenticated using (
    public.user_can_access_prospect(auth.uid(), id)
  );

-- ---------- tool_calculations ----------
drop policy if exists "tools_select_tenant_role" on public.tool_calculations;
create policy "tools_select_tenant_role" on public.tool_calculations
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      public.es_gerente_asistente_o_admin(auth.uid(), workspace_id)
      or user_id = auth.uid()
      or (
        prospect_id is not null
        and public.user_can_access_prospect(auth.uid(), prospect_id)
      )
    )
  );

-- ---------- prospect_workflows ----------
drop policy if exists "workflow_select_scoped" on public.prospect_workflows;
create policy "workflow_select_scoped" on public.prospect_workflows
  for select to authenticated using (
    public.user_can_access_prospect(auth.uid(), prospect_id)
  );

drop policy if exists "workflow_events_select_scoped" on public.prospect_workflow_events;
create policy "workflow_events_select_scoped" on public.prospect_workflow_events
  for select to authenticated using (
    public.user_can_access_prospect(auth.uid(), prospect_id)
  );

-- ---------- activities ----------
drop policy if exists "activities_select_tenant_role" on public.activities;
create policy "activities_select_tenant_role" on public.activities
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      public.es_gerente_asistente_o_admin(auth.uid(), workspace_id)
      or user_id = auth.uid()
      or (
        prospect_id is not null
        and public.user_can_access_prospect(auth.uid(), prospect_id)
      )
    )
  );

-- ---------- sales ----------
drop policy if exists "sales_select_tenant_role" on public.sales;
create policy "sales_select_tenant_role" on public.sales
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      public.es_gerente_asistente_o_admin(auth.uid(), workspace_id)
      or user_id = auth.uid()
      or (
        prospect_id is not null
        and public.user_can_access_prospect(auth.uid(), prospect_id)
      )
    )
  );

-- ---------- calendar_entries (ligadas a prospecto; propias siempre) ----------
drop policy if exists "calendar_select_tenant_role" on public.calendar_entries;
create policy "calendar_select_tenant_role" on public.calendar_entries
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      public.es_gerente_asistente_o_admin(auth.uid(), workspace_id)
      or user_id = auth.uid()
      or (
        prospect_id is not null
        and public.user_can_access_prospect(auth.uid(), prospect_id)
      )
    )
  );

-- Índices de apoyo para filtros de asignación
create index if not exists idx_pw_representante_id on public.prospect_workflows (representante_id);
create index if not exists idx_pw_cerrador_id on public.prospect_workflows (cerrador_id);
create index if not exists idx_pw_gerente_id on public.prospect_workflows (gerente_id);
create index if not exists idx_pw_hostes_id on public.prospect_workflows (hostes_id);
create index if not exists idx_pw_filtro_id on public.prospect_workflows (filtro_id);
create index if not exists idx_pw_opc_id on public.prospect_workflows (opc_id);
create index if not exists idx_pw_liner_id on public.prospect_workflows (liner_id);
create index if not exists idx_pw_ftb_id on public.prospect_workflows (ftb_id);
create index if not exists idx_pw_inhouse_closer1_id on public.prospect_workflows (inhouse_closer1_id);
create index if not exists idx_pw_inhouse_closer2_id on public.prospect_workflows (inhouse_closer2_id);
create index if not exists idx_pw_imagen_id on public.prospect_workflows (imagen_id);
create index if not exists idx_pw_self_gen_id on public.prospect_workflows (self_gen_id);
create index if not exists idx_pw_members_closer1_id on public.prospect_workflows (members_closer1_id);
create index if not exists idx_pw_members_closer2_id on public.prospect_workflows (members_closer2_id);

commit;
