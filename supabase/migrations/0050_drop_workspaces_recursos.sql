-- ============================================================
-- 0050 — Limpiar entidades/columnas de Workspaces (0054)
-- El código volvió a 907dd1f; la BD remota aún tenía 0054.
-- Módulos/grupos/chats ROL ya no existen (confirmado).
-- ============================================================

-- Políticas extra sobre prospects
drop policy if exists "prospects_select_workspace_member" on public.prospects;

-- Trigger / funciones 0054
drop trigger if exists trg_prospects_workspace_propietario on public.prospects;

drop function if exists public.prospects_set_workspace_propietario() cascade;
drop function if exists public.workspace_add_member(uuid, uuid, text) cascade;
drop function if exists public.workspace_remove_member(uuid, uuid) cascade;
drop function if exists public.ensure_personal_workspace(uuid) cascade;
drop function if exists public.insert_resource_audit(uuid, text, text, uuid, jsonb) cascade;
drop function if exists public.user_org_id(uuid) cascade;
drop function if exists public.user_in_workspace(uuid, uuid) cascade;

-- Tablas (hijos primero)
drop table if exists public.recurso_workspace_referencias cascade;
drop table if exists public.workspace_miembros cascade;
drop table if exists public.historial_auditoria cascade;
drop table if exists public.workspaces cascade;
drop table if exists public.organizaciones cascade;

-- Columnas en tablas core
alter table public.prospects
  drop column if exists workspace_propietario_id;

alter table public.prospect_shares
  drop column if exists puede_volver_a_compartir;

-- Enum
drop type if exists public.workspace_tipo;

-- Restaurar helpers al contrato pre-0054
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

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
        where p.id = prospect_id and p.user_id = uid
      )
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = prospect_id and ps.shared_with_id = uid
      )
    );
$$;

revoke all on function public.user_can_access_prospect(uuid, uuid) from public;
grant execute on function public.user_can_access_prospect(uuid, uuid) to authenticated, service_role;
