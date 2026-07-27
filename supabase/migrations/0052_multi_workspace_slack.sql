-- ============================================================
-- 0052 — Multi-workspace Slack (empresas + salas + personal)
-- Propiedad del dato = workspace_id. user_id = actor/creador.
-- Frontera: nunca personal ↔ sala_de_venta.
-- ============================================================

-- ---------- Catálogo ----------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  logo_url text,
  colores_marca jsonb not null default '{}'::jsonb,
  plan_paquete text,
  estado text not null default 'activa'
    check (estado in ('activa', 'inactiva', 'suspendida')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create type public.workspace_tipo as enum ('personal', 'sala_de_venta');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.workspace_rol as enum ('gerente', 'vendedor');
exception when duplicate_object then null;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  tipo public.workspace_tipo not null,
  empresa_id uuid references public.empresas(id) on delete cascade,
  nombre text not null,
  logo_url text,
  colores_marca jsonb not null default '{}'::jsonb,
  estado text not null default 'activo'
    check (estado in ('activo', 'archivado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_empresa_coherent check (
    (tipo = 'personal' and empresa_id is null)
    or (tipo = 'sala_de_venta' and empresa_id is not null)
  )
);

create index if not exists workspaces_empresa_idx on public.workspaces (empresa_id);
create index if not exists workspaces_tipo_idx on public.workspaces (tipo);

create table if not exists public.workspace_miembros (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rol_en_workspace public.workspace_rol not null default 'vendedor',
  fecha_union timestamptz not null default now(),
  unique (usuario_id, workspace_id)
);

create index if not exists workspace_miembros_usuario_idx
  on public.workspace_miembros (usuario_id);
create index if not exists workspace_miembros_workspace_idx
  on public.workspace_miembros (workspace_id);

-- Exactamente 1 gerente por sala de venta
create unique index if not exists workspace_un_gerente_por_sala
  on public.workspace_miembros (workspace_id)
  where rol_en_workspace = 'gerente';

-- Workspace activo en perfil
alter table public.profiles
  add column if not exists workspace_activo_id uuid references public.workspaces(id) on delete set null;

-- ---------- Helpers ----------
create or replace function public.ensure_personal_workspace(p_usuario_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_name text;
begin
  if p_usuario_id is null then
    raise exception 'usuario requerido';
  end if;

  select w.id into v_ws
  from public.workspaces w
  join public.workspace_miembros m on m.workspace_id = w.id
  where m.usuario_id = p_usuario_id
    and w.tipo = 'personal'
  limit 1;

  if v_ws is not null then
    return v_ws;
  end if;

  select coalesce(nullif(trim(full_name), ''), split_part(coalesce(email, 'Personal'), '@', 1), 'Personal')
    into v_name
  from public.profiles where id = p_usuario_id;

  insert into public.workspaces (tipo, empresa_id, nombre, estado)
  values ('personal', null, coalesce(v_name, 'Personal'), 'activo')
  returning id into v_ws;

  insert into public.workspace_miembros (usuario_id, workspace_id, rol_en_workspace)
  values (p_usuario_id, v_ws, 'vendedor')
  on conflict (usuario_id, workspace_id) do nothing;

  update public.profiles
  set workspace_activo_id = coalesce(workspace_activo_id, v_ws)
  where id = p_usuario_id;

  return v_ws;
end;
$$;

create or replace function public.user_in_workspace(p_usuario_id uuid, p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_usuario_id is not null
    and p_workspace_id is not null
    and exists (
      select 1 from public.workspace_miembros m
      where m.usuario_id = p_usuario_id
        and m.workspace_id = p_workspace_id
    );
$$;

-- true si se permite mover/duplicar entre src y dst (nunca personal↔sala)
create or replace function public.workspace_boundary_ok(p_src uuid, p_dst uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s_tipo public.workspace_tipo;
  d_tipo public.workspace_tipo;
  s_emp uuid;
  d_emp uuid;
begin
  if p_src is null or p_dst is null then
    return false;
  end if;
  if p_src = p_dst then
    return true;
  end if;

  select tipo, empresa_id into s_tipo, s_emp from public.workspaces where id = p_src;
  select tipo, empresa_id into d_tipo, d_emp from public.workspaces where id = p_dst;
  if s_tipo is null or d_tipo is null then
    return false;
  end if;

  -- personal ↔ sala = prohibido
  if s_tipo <> d_tipo then
    return false;
  end if;

  -- dos personales distintos = no (solo el mismo workspace personal)
  if s_tipo = 'personal' then
    return false;
  end if;

  -- salas: misma empresa
  return s_emp is not null and s_emp = d_emp;
end;
$$;

revoke all on function public.ensure_personal_workspace(uuid) from public;
revoke all on function public.user_in_workspace(uuid, uuid) from public;
revoke all on function public.workspace_boundary_ok(uuid, uuid) from public;
grant execute on function public.ensure_personal_workspace(uuid) to authenticated, service_role;
grant execute on function public.user_in_workspace(uuid, uuid) to authenticated, service_role;
grant execute on function public.workspace_boundary_ok(uuid, uuid) to authenticated, service_role;

-- ---------- workspace_id en recursos ----------
alter table public.prospects add column if not exists workspace_id uuid references public.workspaces(id);
alter table public.sales add column if not exists workspace_id uuid references public.workspaces(id);
alter table public.calendar_entries add column if not exists workspace_id uuid references public.workspaces(id);
alter table public.goals add column if not exists workspace_id uuid references public.workspaces(id);
alter table public.activities add column if not exists workspace_id uuid references public.workspaces(id);
alter table public.tool_calculations add column if not exists workspace_id uuid references public.workspaces(id);

-- Backfill: personal por usuario + asignar recursos
do $$
declare
  r record;
  ws uuid;
begin
  for r in select id from public.profiles loop
    ws := public.ensure_personal_workspace(r.id);
  end loop;

  update public.prospects p
  set workspace_id = (
    select w.id
    from public.workspaces w
    join public.workspace_miembros m on m.workspace_id = w.id
    where m.usuario_id = p.user_id and w.tipo = 'personal'
    limit 1
  )
  where p.workspace_id is null;

  update public.sales s
  set workspace_id = (
    select w.id
    from public.workspaces w
    join public.workspace_miembros m on m.workspace_id = w.id
    where m.usuario_id = s.user_id and w.tipo = 'personal'
    limit 1
  )
  where s.workspace_id is null;

  update public.calendar_entries c
  set workspace_id = (
    select w.id
    from public.workspaces w
    join public.workspace_miembros m on m.workspace_id = w.id
    where m.usuario_id = c.user_id and w.tipo = 'personal'
    limit 1
  )
  where c.workspace_id is null;

  update public.goals g
  set workspace_id = (
    select w.id
    from public.workspaces w
    join public.workspace_miembros m on m.workspace_id = w.id
    where m.usuario_id = g.user_id and w.tipo = 'personal'
    limit 1
  )
  where g.workspace_id is null;

  update public.activities a
  set workspace_id = (
    select w.id
    from public.workspaces w
    join public.workspace_miembros m on m.workspace_id = w.id
    where m.usuario_id = a.user_id and w.tipo = 'personal'
    limit 1
  )
  where a.workspace_id is null;

  update public.tool_calculations t
  set workspace_id = (
    select w.id
    from public.workspaces w
    join public.workspace_miembros m on m.workspace_id = w.id
    where m.usuario_id = t.user_id and w.tipo = 'personal'
    limit 1
  )
  where t.workspace_id is null;
end $$;

-- NOT NULL tras backfill (solo si no quedan nulls)
do $$
begin
  if not exists (select 1 from public.prospects where workspace_id is null) then
    alter table public.prospects alter column workspace_id set not null;
  end if;
  if not exists (select 1 from public.sales where workspace_id is null) then
    alter table public.sales alter column workspace_id set not null;
  end if;
  if not exists (select 1 from public.calendar_entries where workspace_id is null) then
    alter table public.calendar_entries alter column workspace_id set not null;
  end if;
  if not exists (select 1 from public.goals where workspace_id is null) then
    alter table public.goals alter column workspace_id set not null;
  end if;
  if not exists (select 1 from public.activities where workspace_id is null) then
    alter table public.activities alter column workspace_id set not null;
  end if;
  if not exists (select 1 from public.tool_calculations where workspace_id is null) then
    alter table public.tool_calculations alter column workspace_id set not null;
  end if;
end $$;

create index if not exists prospects_workspace_idx on public.prospects (workspace_id);
create index if not exists sales_workspace_idx on public.sales (workspace_id);
create index if not exists calendar_workspace_idx on public.calendar_entries (workspace_id);
create index if not exists goals_workspace_idx on public.goals (workspace_id);
create index if not exists activities_workspace_idx on public.activities (workspace_id);
create index if not exists tools_workspace_idx on public.tool_calculations (workspace_id);

-- ---------- RLS tablas nuevas ----------
alter table public.empresas enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_miembros enable row level security;

drop policy if exists "empresas_select_member" on public.empresas;
create policy "empresas_select_member" on public.empresas
  for select to authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      join public.workspace_miembros m on m.workspace_id = w.id
      where w.empresa_id = empresas.id and m.usuario_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  );

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
  for select to authenticated
  using (
    public.user_in_workspace(auth.uid(), id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  );

drop policy if exists "workspace_miembros_select_self" on public.workspace_miembros;
create policy "workspace_miembros_select_self" on public.workspace_miembros
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.user_in_workspace(auth.uid(), workspace_id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  );

-- Acceso a prospect: dueño/miembro del workspace del prospect O share (mismo workspace)
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
        where p.id = prospect_id
          and public.user_in_workspace(uid, p.workspace_id)
      )
      or exists (
        select 1
        from public.prospect_shares ps
        join public.prospects p on p.id = ps.prospect_id
        where ps.prospect_id = prospect_id
          and ps.shared_with_id = uid
          and public.user_in_workspace(uid, p.workspace_id)
      )
    );
$$;

-- Políticas de dominio: miembro del workspace
drop policy if exists "prospects_all_own" on public.prospects;
drop policy if exists "prospects_select_workspace_member" on public.prospects;
drop policy if exists "prospects_select_member" on public.prospects;
drop policy if exists "prospects_insert_member" on public.prospects;
drop policy if exists "prospects_update_member" on public.prospects;
drop policy if exists "prospects_delete_member" on public.prospects;

create policy "prospects_select_member" on public.prospects
  for select to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    or exists (
      select 1 from public.prospect_shares ps
      where ps.prospect_id = prospects.id and ps.shared_with_id = auth.uid()
        and public.user_in_workspace(auth.uid(), prospects.workspace_id)
    )
  );

create policy "prospects_insert_member" on public.prospects
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.user_in_workspace(auth.uid(), workspace_id)
  );

create policy "prospects_update_member" on public.prospects
  for update to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id))
  with check (public.user_in_workspace(auth.uid(), workspace_id));

create policy "prospects_delete_member" on public.prospects
  for delete to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));

drop policy if exists "sales_all_own" on public.sales;
drop policy if exists "sales_select_member" on public.sales;
drop policy if exists "sales_insert_member" on public.sales;
drop policy if exists "sales_update_member" on public.sales;
drop policy if exists "sales_delete_member" on public.sales;
create policy "sales_select_member" on public.sales for select to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));
create policy "sales_insert_member" on public.sales for insert to authenticated
  with check (auth.uid() = user_id and public.user_in_workspace(auth.uid(), workspace_id));
create policy "sales_update_member" on public.sales for update to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id))
  with check (public.user_in_workspace(auth.uid(), workspace_id));
create policy "sales_delete_member" on public.sales for delete to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));

drop policy if exists "cal_all_own" on public.calendar_entries;
drop policy if exists "calendar_select_member" on public.calendar_entries;
drop policy if exists "calendar_insert_member" on public.calendar_entries;
drop policy if exists "calendar_update_member" on public.calendar_entries;
drop policy if exists "calendar_delete_member" on public.calendar_entries;
create policy "calendar_select_member" on public.calendar_entries for select to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));
create policy "calendar_insert_member" on public.calendar_entries for insert to authenticated
  with check (auth.uid() = user_id and public.user_in_workspace(auth.uid(), workspace_id));
create policy "calendar_update_member" on public.calendar_entries for update to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id))
  with check (public.user_in_workspace(auth.uid(), workspace_id));
create policy "calendar_delete_member" on public.calendar_entries for delete to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));

drop policy if exists "goals_all_own" on public.goals;
drop policy if exists "goals_select_member" on public.goals;
drop policy if exists "goals_insert_member" on public.goals;
drop policy if exists "goals_update_member" on public.goals;
drop policy if exists "goals_delete_member" on public.goals;
create policy "goals_select_member" on public.goals for select to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));
create policy "goals_insert_member" on public.goals for insert to authenticated
  with check (auth.uid() = user_id and public.user_in_workspace(auth.uid(), workspace_id));
create policy "goals_update_member" on public.goals for update to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id))
  with check (public.user_in_workspace(auth.uid(), workspace_id));
create policy "goals_delete_member" on public.goals for delete to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));

drop policy if exists "activities_all_own" on public.activities;
drop policy if exists "activities_select_member" on public.activities;
drop policy if exists "activities_insert_member" on public.activities;
drop policy if exists "activities_update_member" on public.activities;
drop policy if exists "activities_delete_member" on public.activities;
create policy "activities_select_member" on public.activities for select to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));
create policy "activities_insert_member" on public.activities for insert to authenticated
  with check (auth.uid() = user_id and public.user_in_workspace(auth.uid(), workspace_id));
create policy "activities_update_member" on public.activities for update to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id))
  with check (public.user_in_workspace(auth.uid(), workspace_id));
create policy "activities_delete_member" on public.activities for delete to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));

drop policy if exists "tool_calc_all_own" on public.tool_calculations;
drop policy if exists "tools_select_member" on public.tool_calculations;
drop policy if exists "tools_insert_member" on public.tool_calculations;
drop policy if exists "tools_update_member" on public.tool_calculations;
drop policy if exists "tools_delete_member" on public.tool_calculations;
create policy "tools_select_member" on public.tool_calculations for select to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));
create policy "tools_insert_member" on public.tool_calculations for insert to authenticated
  with check (auth.uid() = user_id and public.user_in_workspace(auth.uid(), workspace_id));
create policy "tools_update_member" on public.tool_calculations for update to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id))
  with check (public.user_in_workspace(auth.uid(), workspace_id));
create policy "tools_delete_member" on public.tool_calculations for delete to authenticated
  using (public.user_in_workspace(auth.uid(), workspace_id));

-- Bootstrap en registro
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  )
  on conflict (id) do nothing;

  ws := public.ensure_personal_workspace(new.id);
  update public.profiles set workspace_activo_id = ws where id = new.id;

  return new;
end;
$$;

comment on table public.empresas is 'Empresa/hotel: dueña de salas de venta y marca heredable.';
comment on table public.workspaces is 'Workspace Slack-like: personal o sala_de_venta.';
comment on table public.workspace_miembros is 'Membresía multi-workspace; rol gerente|vendedor.';
comment on function public.workspace_boundary_ok(uuid, uuid) is 'Permite mover datos solo mismo WS o salas de la misma empresa; nunca personal↔sala.';
