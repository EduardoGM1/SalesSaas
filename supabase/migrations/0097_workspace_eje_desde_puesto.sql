-- ============================================================
-- 0097 — Commit B: eje (rol_en_workspace) derivado del puesto (role_id)
-- Respaldos en migracion_commit_b_eje_puesto_backup.
-- Al promover gerente, demueve otros gerentes de la misma sala (índice único).
-- Cuentas @saletse-test.com con puesto gerente conservan eje vendedor (QA).
-- ============================================================

create table if not exists public.migracion_commit_b_eje_puesto_backup (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  usuario_id uuid not null,
  email text,
  role_id uuid,
  rol_slug text,
  rol_en_workspace_anterior public.workspace_rol,
  rol_en_workspace_nuevo public.workspace_rol,
  roles_paquete_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.migracion_commit_b_eje_puesto_backup is
  'Snapshot Commit B: alinear rol_en_workspace con slug del puesto workspace.';

create or replace function public.workspace_es_cuenta_qa_gerente(p_usuario_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_usuario_id
      and lower(p.email) like '%@saletse-test.com'
  );
$$;

create or replace function public.workspace_rol_en_workspace_desde_slug(p_slug text)
returns public.workspace_rol
language sql
immutable
as $$
  select case when p_slug = 'gerente' then 'gerente'::public.workspace_rol else 'vendedor'::public.workspace_rol end;
$$;

create or replace function public.workspace_sync_rol_en_workspace_desde_puesto()
returns trigger
language plpgsql
as $$
declare
  v_slug text;
  v_axis public.workspace_rol;
  v_qa_gerente boolean;
begin
  if new.role_id is null then
    return new;
  end if;

  select r.slug into v_slug from public.roles r where r.id = new.role_id;
  if v_slug is null then
    return new;
  end if;

  v_qa_gerente := v_slug = 'gerente' and public.workspace_es_cuenta_qa_gerente(new.usuario_id);
  if v_qa_gerente then
    new.rol_en_workspace := 'vendedor'::public.workspace_rol;
    return new;
  end if;

  v_axis := public.workspace_rol_en_workspace_desde_slug(v_slug);

  if v_axis = 'gerente'
     and (tg_op = 'INSERT' or coalesce(old.rol_en_workspace, 'vendedor'::public.workspace_rol) <> 'gerente') then
    update public.workspace_miembros wm
    set rol_en_workspace = 'vendedor'::public.workspace_rol
    where wm.workspace_id = new.workspace_id
      and wm.usuario_id <> new.usuario_id
      and wm.rol_en_workspace = 'gerente';
  end if;

  new.rol_en_workspace := v_axis;
  return new;
end;
$$;

drop trigger if exists workspace_miembros_sync_rol_en_workspace on public.workspace_miembros;

create trigger workspace_miembros_sync_rol_en_workspace
before insert or update of role_id
on public.workspace_miembros
for each row
execute function public.workspace_sync_rol_en_workspace_desde_puesto();

comment on function public.workspace_sync_rol_en_workspace_desde_puesto() is
  'Mantiene rol_en_workspace alineado al slug del puesto; excepción QA @saletse-test.com con puesto gerente.';
