-- ============================================================
-- 0054 — Workspaces, recurso único (expediente) y auditoría
-- Tipos workspace v1: personal | sala_de_ventas
-- Vinculación: varias salas de la misma org; una sola org a la vez.
-- ============================================================

-- ---------- 1) Organizaciones ----------
create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists organizaciones_nombre_idx on public.organizaciones (nombre);

alter table public.organizaciones enable row level security;

-- ---------- 2) Workspaces ----------
do $$ begin
  create type public.workspace_tipo as enum ('personal', 'sala_de_ventas');
exception when duplicate_object then null;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  tipo public.workspace_tipo not null,
  organizacion_id uuid references public.organizaciones(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  constraint workspaces_org_tipo_chk check (
    (tipo = 'personal' and organizacion_id is null)
    or (tipo = 'sala_de_ventas' and organizacion_id is not null)
  )
);

create unique index if not exists workspaces_personal_owner_uidx
  on public.workspaces (owner_id)
  where tipo = 'personal';

create index if not exists workspaces_org_idx on public.workspaces (organizacion_id);
create index if not exists workspaces_owner_idx on public.workspaces (owner_id);

alter table public.workspaces enable row level security;

-- ---------- 3) Miembros ----------
create table if not exists public.workspace_miembros (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  rol_en_workspace text not null default 'vendedor',
  created_at timestamptz not null default now(),
  primary key (workspace_id, usuario_id)
);

create index if not exists workspace_miembros_usuario_idx
  on public.workspace_miembros (usuario_id);

alter table public.workspace_miembros enable row level security;

-- Helpers (SECURITY DEFINER) — antes de policies que los usan
create or replace function public.user_in_workspace(p_uid uuid, p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_uid is not null
    and p_workspace_id is not null
    and (
      exists (
        select 1 from public.workspaces w
        where w.id = p_workspace_id
          and w.owner_id = p_uid
      )
      or exists (
        select 1 from public.workspace_miembros wm
        where wm.workspace_id = p_workspace_id
          and wm.usuario_id = p_uid
      )
    );
$$;

revoke all on function public.user_in_workspace(uuid, uuid) from public;
grant execute on function public.user_in_workspace(uuid, uuid) to authenticated, service_role;

create or replace function public.user_org_id(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select w.organizacion_id
  from public.workspace_miembros wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.usuario_id = p_uid
    and w.tipo = 'sala_de_ventas'
    and w.organizacion_id is not null
  limit 1;
$$;

revoke all on function public.user_org_id(uuid) from public;
grant execute on function public.user_org_id(uuid) to authenticated, service_role;

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
  for select to authenticated
  using (
    public.user_in_workspace(auth.uid(), id)
    or public.is_admin()
  );

drop policy if exists "workspaces_insert_owner" on public.workspaces;
create policy "workspaces_insert_owner" on public.workspaces
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "workspaces_update_owner_or_admin_sala" on public.workspaces;
create policy "workspaces_update_owner_or_admin_sala" on public.workspaces
  for update to authenticated
  using (
    owner_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.workspace_miembros wm
      where wm.workspace_id = workspaces.id
        and wm.usuario_id = auth.uid()
        and wm.rol_en_workspace = 'admin_sala'
    )
  );

drop policy if exists "wm_select_member" on public.workspace_miembros;
create policy "wm_select_member" on public.workspace_miembros
  for select to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    or public.is_admin()
  );

-- Inserts de miembros solo vía RPC (evita bypass de regla anti multi-org)
drop policy if exists "wm_insert_blocked" on public.workspace_miembros;
-- sin policy INSERT para authenticated

drop policy if exists "wm_delete_admin_sala" on public.workspace_miembros;
create policy "wm_delete_admin_sala" on public.workspace_miembros
  for delete to authenticated
  using (
    usuario_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_miembros.workspace_id
        and w.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.workspace_miembros wm
      where wm.workspace_id = workspace_miembros.workspace_id
        and wm.usuario_id = auth.uid()
        and wm.rol_en_workspace = 'admin_sala'
    )
  );

-- Políticas org (después de workspaces/miembros)
drop policy if exists "org_select_member_or_creator" on public.organizaciones;
create policy "org_select_member_or_creator" on public.organizaciones
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.workspaces w
      join public.workspace_miembros wm on wm.workspace_id = w.id
      where w.organizacion_id = organizaciones.id
        and wm.usuario_id = auth.uid()
    )
  );

drop policy if exists "org_insert_authenticated" on public.organizaciones;
create policy "org_insert_authenticated" on public.organizaciones
  for insert to authenticated
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "org_update_creator_or_admin" on public.organizaciones;
create policy "org_update_creator_or_admin" on public.organizaciones
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- ---------- 4) Prospects = recurso expediente ----------
alter table public.prospects
  add column if not exists workspace_propietario_id uuid references public.workspaces(id) on delete set null;

create index if not exists prospects_workspace_propietario_idx
  on public.prospects (workspace_propietario_id);

-- ---------- 5) Backfill workspaces personales + owner ----------
insert into public.workspaces (tipo, organizacion_id, owner_id, nombre)
select 'personal', null, p.id, coalesce(nullif(trim(p.full_name), ''), split_part(coalesce(p.email, ''), '@', 1), 'Espacio personal')
from public.profiles p
where not exists (
  select 1 from public.workspaces w
  where w.tipo = 'personal' and w.owner_id = p.id
);

insert into public.workspace_miembros (workspace_id, usuario_id, rol_en_workspace)
select w.id, w.owner_id, 'admin_sala'
from public.workspaces w
where w.tipo = 'personal'
  and not exists (
    select 1 from public.workspace_miembros wm
    where wm.workspace_id = w.id and wm.usuario_id = w.owner_id
  );

update public.prospects pr
set workspace_propietario_id = w.id
from public.workspaces w
where w.tipo = 'personal'
  and w.owner_id = pr.user_id
  and pr.workspace_propietario_id is null;

-- ---------- 6) Referencias (pin a espacio) ----------
create table if not exists public.recurso_workspace_referencias (
  recurso_id uuid not null references public.prospects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (recurso_id, workspace_id)
);

create index if not exists recurso_ws_ref_workspace_idx
  on public.recurso_workspace_referencias (workspace_id);

alter table public.recurso_workspace_referencias enable row level security;

drop policy if exists "ref_select_member" on public.recurso_workspace_referencias;
create policy "ref_select_member" on public.recurso_workspace_referencias
  for select to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    or public.is_admin()
  );

drop policy if exists "ref_insert_member" on public.recurso_workspace_referencias;
create policy "ref_insert_member" on public.recurso_workspace_referencias
  for insert to authenticated
  with check (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = recurso_id
          and ps.shared_with_id = auth.uid()
          and public.share_can_edit(ps.permission)
      )
      or exists (
        select 1 from public.prospects p
        where p.id = recurso_id and p.user_id = auth.uid()
      )
    )
  );

drop policy if exists "ref_delete_member" on public.recurso_workspace_referencias;
create policy "ref_delete_member" on public.recurso_workspace_referencias
  for delete to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    or public.is_admin()
  );

-- Migrar pins existentes → referencia al workspace personal del receptor
insert into public.recurso_workspace_referencias (recurso_id, workspace_id, created_at, created_by)
select ps.prospect_id, w.id, coalesce(ps.added_to_workspace_at, now()), ps.shared_with_id
from public.prospect_shares ps
join public.workspaces w
  on w.tipo = 'personal' and w.owner_id = ps.shared_with_id
where ps.added_to_workspace_at is not null
on conflict (recurso_id, workspace_id) do nothing;

-- ---------- 7) Extender shares ----------
alter table public.prospect_shares
  add column if not exists puede_volver_a_compartir boolean not null default false;

comment on column public.prospect_shares.puede_volver_a_compartir is
  'Si true, el receptor puede re-compartir el mismo recurso (referencia).';

comment on type public.share_permission is
  'view|edit|comment|workspace(legacy→edit+referencia). Preferir view|edit + recurso_workspace_referencias.';

-- ---------- 8) Historial auditoría de recursos ----------
create table if not exists public.historial_auditoria (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  ambito text not null default 'recurso' check (ambito in ('admin', 'recurso')),
  accion text not null,
  entidad_afectada text not null,
  entidad_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists historial_auditoria_created_idx
  on public.historial_auditoria (created_at desc);
create index if not exists historial_auditoria_entidad_idx
  on public.historial_auditoria (entidad_afectada, entidad_id);
create index if not exists historial_auditoria_actor_idx
  on public.historial_auditoria (actor_id);

alter table public.historial_auditoria enable row level security;

drop policy if exists "hist_select_actor_or_admin" on public.historial_auditoria;
create policy "hist_select_actor_or_admin" on public.historial_auditoria
  for select to authenticated
  using (
    actor_id = auth.uid()
    or public.is_admin()
    or (
      entidad_afectada = 'prospect'
      and exists (
        select 1 from public.prospects p
        where p.id = historial_auditoria.entidad_id
          and p.user_id = auth.uid()
      )
    )
  );

create or replace function public.insert_resource_audit(
  p_actor_id uuid,
  p_accion text,
  p_entidad_afectada text,
  p_entidad_id uuid,
  p_detalle jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_actor_id is null or coalesce(trim(p_accion), '') = '' then
    raise exception 'Auditoría inválida';
  end if;
  if auth.uid() is not null
     and auth.uid() <> p_actor_id
     and not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  insert into public.historial_auditoria (actor_id, ambito, accion, entidad_afectada, entidad_id, detalle)
  values (
    p_actor_id,
    'recurso',
    trim(p_accion),
    coalesce(nullif(trim(p_entidad_afectada), ''), 'desconocido'),
    p_entidad_id,
    coalesce(p_detalle, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_resource_audit(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.insert_resource_audit(uuid, text, text, uuid, jsonb) to authenticated, service_role;

-- ---------- 9) Acceso unificado a prospect ----------
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
      or exists (
        select 1 from public.prospects p
        where p.id = prospect_id
          and p.workspace_propietario_id is not null
          and public.user_in_workspace(uid, p.workspace_propietario_id)
      )
      or exists (
        select 1
        from public.recurso_workspace_referencias r
        where r.recurso_id = prospect_id
          and public.user_in_workspace(uid, r.workspace_id)
      )
    );
$$;

-- Lectura por membresía de workspace propietario o referencia
drop policy if exists "prospects_select_workspace_member" on public.prospects;
create policy "prospects_select_workspace_member" on public.prospects
  for select to authenticated
  using (
    (
      workspace_propietario_id is not null
      and public.user_in_workspace(auth.uid(), workspace_propietario_id)
    )
    or exists (
      select 1 from public.recurso_workspace_referencias r
      where r.recurso_id = prospects.id
        and public.user_in_workspace(auth.uid(), r.workspace_id)
    )
  );

-- ---------- 10) Auto workspace personal en signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_nombre text;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  )
  on conflict (id) do nothing;

  v_nombre := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Espacio personal'
  );

  select id into v_ws
  from public.workspaces
  where tipo = 'personal' and owner_id = new.id
  limit 1;

  if v_ws is null then
    insert into public.workspaces (tipo, organizacion_id, owner_id, nombre)
    values ('personal', null, new.id, v_nombre)
    returning id into v_ws;
  end if;

  if v_ws is not null then
    insert into public.workspace_miembros (workspace_id, usuario_id, rol_en_workspace)
    values (v_ws, new.id, 'admin_sala')
    on conflict (workspace_id, usuario_id) do nothing;
  end if;

  return new;
end;
$$;

-- Garantizar workspace personal (API / trigger auxiliar)
create or replace function public.ensure_personal_workspace(p_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text;
begin
  if p_uid is null then
    raise exception 'uid requerido';
  end if;
  if auth.uid() is not null and auth.uid() <> p_uid and not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  select id into v_id
  from public.workspaces
  where tipo = 'personal' and owner_id = p_uid
  limit 1;

  if v_id is not null then
    insert into public.workspace_miembros (workspace_id, usuario_id, rol_en_workspace)
    values (v_id, p_uid, 'admin_sala')
    on conflict (workspace_id, usuario_id) do nothing;
    return v_id;
  end if;

  select coalesce(nullif(trim(full_name), ''), split_part(coalesce(email, ''), '@', 1), 'Espacio personal')
    into v_nombre
  from public.profiles
  where id = p_uid;

  insert into public.workspaces (tipo, organizacion_id, owner_id, nombre)
  values ('personal', null, p_uid, coalesce(v_nombre, 'Espacio personal'))
  returning id into v_id;

  insert into public.workspace_miembros (workspace_id, usuario_id, rol_en_workspace)
  values (v_id, p_uid, 'admin_sala')
  on conflict (workspace_id, usuario_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.ensure_personal_workspace(uuid) from public;
grant execute on function public.ensure_personal_workspace(uuid) to authenticated, service_role;

-- ---------- 11) RPC vinculación (anti multi-org) ----------
create or replace function public.workspace_add_member(
  p_workspace_id uuid,
  p_usuario_id uuid,
  p_rol text default 'vendedor'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws public.workspaces%rowtype;
  v_existing_org uuid;
  v_actor uuid := auth.uid();
  v_rol text := coalesce(nullif(trim(p_rol), ''), 'vendedor');
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace no encontrado' using errcode = 'P0002';
  end if;

  if v_ws.tipo = 'personal' then
    raise exception 'No se puede vincular a un workspace personal' using errcode = '22023';
  end if;

  if not (
    v_ws.owner_id = v_actor
    or public.is_admin()
    or exists (
      select 1 from public.workspace_miembros wm
      where wm.workspace_id = p_workspace_id
        and wm.usuario_id = v_actor
        and wm.rol_en_workspace = 'admin_sala'
    )
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_existing_org := public.user_org_id(p_usuario_id);
  if v_existing_org is not null and v_existing_org is distinct from v_ws.organizacion_id then
    raise exception 'El usuario ya pertenece a otra organización' using errcode = '42501';
  end if;

  insert into public.workspace_miembros (workspace_id, usuario_id, rol_en_workspace)
  values (p_workspace_id, p_usuario_id, v_rol)
  on conflict (workspace_id, usuario_id) do update
    set rol_en_workspace = excluded.rol_en_workspace;
end;
$$;

revoke all on function public.workspace_add_member(uuid, uuid, text) from public;
grant execute on function public.workspace_add_member(uuid, uuid, text) to authenticated, service_role;

create or replace function public.workspace_remove_member(
  p_workspace_id uuid,
  p_usuario_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws public.workspaces%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then
    raise exception 'Workspace no encontrado' using errcode = 'P0002';
  end if;

  if not (
    p_usuario_id = v_actor
    or v_ws.owner_id = v_actor
    or public.is_admin()
    or exists (
      select 1 from public.workspace_miembros wm
      where wm.workspace_id = p_workspace_id
        and wm.usuario_id = v_actor
        and wm.rol_en_workspace = 'admin_sala'
    )
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if v_ws.tipo = 'personal' and p_usuario_id = v_ws.owner_id then
    raise exception 'No se puede quitar al dueño del workspace personal' using errcode = '22023';
  end if;

  delete from public.workspace_miembros
  where workspace_id = p_workspace_id and usuario_id = p_usuario_id;
end;
$$;

revoke all on function public.workspace_remove_member(uuid, uuid) from public;
grant execute on function public.workspace_remove_member(uuid, uuid) to authenticated, service_role;

-- Trigger: al crear prospect, asignar workspace personal si falta
create or replace function public.prospects_set_workspace_propietario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_propietario_id is null then
    new.workspace_propietario_id := public.ensure_personal_workspace(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prospects_workspace_propietario on public.prospects;
create trigger trg_prospects_workspace_propietario
  before insert on public.prospects
  for each row execute function public.prospects_set_workspace_propietario();

comment on table public.workspaces is 'Espacios: personal (1 por usuario) o sala_de_ventas bajo una organización.';
comment on table public.recurso_workspace_referencias is 'Pin/referencia del mismo expediente en un workspace (no copia).';
comment on table public.historial_auditoria is 'Auditoría append-only de acciones sobre recursos (share, pin, duplicar, transferir…).';
