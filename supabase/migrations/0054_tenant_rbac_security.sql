-- ============================================================
-- 0054 — RBAC tenant: empresa/sala, paquetes y frontera RLS
-- Extensión aditiva de 0041/0051/0052. No elimina compat legacy.
-- ============================================================

-- ---------- Paquetes de acceso por empresa ----------
create table if not exists public.paquetes_acceso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  slug text not null,
  descripcion text,
  es_sistema boolean not null default false,
  activo boolean not null default true,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, slug)
);

create table if not exists public.paquete_flags (
  paquete_id uuid not null references public.paquetes_acceso(id) on delete cascade,
  flag_id uuid not null references public.flags(id) on delete cascade,
  activo boolean not null default true,
  primary key (paquete_id, flag_id)
);

-- ---------- Scope tenant en roles ----------
alter table public.roles add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.roles add column if not exists scope text not null default 'plataforma';
alter table public.roles add column if not exists paquete_id uuid references public.paquetes_acceso(id) on delete set null;

alter table public.roles drop constraint if exists roles_scope_check;
alter table public.roles add constraint roles_scope_check
  check (
    (scope = 'plataforma' and empresa_id is null)
    or (scope in ('empresa', 'workspace') and empresa_id is not null)
  );

alter table public.roles drop constraint if exists roles_slug_key;
create unique index if not exists roles_slug_global_uniq
  on public.roles (slug) where empresa_id is null;
create unique index if not exists roles_slug_empresa_uniq
  on public.roles (empresa_id, slug) where empresa_id is not null;
create index if not exists roles_empresa_idx on public.roles (empresa_id);

-- ---------- Membresía administrativa de empresa ----------
create table if not exists public.empresa_miembros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid references public.roles(id) on delete restrict,
  es_admin boolean not null default false,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  fecha_union timestamptz not null default now(),
  unique (empresa_id, usuario_id)
);

alter table public.workspace_miembros
  add column if not exists role_id uuid references public.roles(id) on delete restrict;

create index if not exists empresa_miembros_usuario_idx on public.empresa_miembros (usuario_id);
create index if not exists empresa_miembros_empresa_idx on public.empresa_miembros (empresa_id);
create index if not exists workspace_miembros_role_idx on public.workspace_miembros (role_id);

-- Overrides contextuales; reutiliza el catálogo public.permisos.
create table if not exists public.workspace_usuario_permisos_override (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  permiso_id uuid not null references public.permisos(id) on delete cascade,
  otorgado boolean not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, usuario_id, permiso_id)
);

-- ---------- Helpers de alcance ----------
create or replace function public.user_in_empresa(p_usuario_id uuid, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_usuario_id is not null
    and p_empresa_id is not null
    and (
      exists (
        select 1 from public.profiles p
        where p.id = p_usuario_id and p.is_super_admin = true
      )
      or exists (
        select 1 from public.empresa_miembros em
        where em.usuario_id = p_usuario_id
          and em.empresa_id = p_empresa_id
          and em.estado = 'activo'
      )
      or exists (
        select 1
        from public.workspace_miembros wm
        join public.workspaces w on w.id = wm.workspace_id
        where wm.usuario_id = p_usuario_id
          and w.empresa_id = p_empresa_id
          and w.estado = 'activo'
      )
    );
$$;

create or replace function public.user_is_empresa_admin(p_usuario_id uuid, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = p_usuario_id and p.is_super_admin = true
    )
    or exists (
      select 1 from public.empresa_miembros em
      where em.usuario_id = p_usuario_id
        and em.empresa_id = p_empresa_id
        and em.es_admin = true
        and em.estado = 'activo'
    );
$$;

create or replace function public.effective_workspace_permissions(
  p_usuario_id uuid,
  p_workspace_id uuid
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_role_id uuid;
  v_keys text[] := '{}';
begin
  if p_usuario_id is null or p_workspace_id is null then return '{}'; end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_usuario_id and p.is_super_admin = true
  ) then
    select coalesce(array_agg(clave order by clave), '{}') into v_keys
    from public.permisos;
    return v_keys;
  end if;

  select w.empresa_id into v_empresa_id
  from public.workspaces w where w.id = p_workspace_id;

  if v_empresa_id is not null
     and public.user_is_empresa_admin(p_usuario_id, v_empresa_id) then
    select coalesce(array_agg(clave order by clave), '{}') into v_keys
    from public.permisos;
    return v_keys;
  end if;

  select wm.role_id into v_role_id
  from public.workspace_miembros wm
  where wm.usuario_id = p_usuario_id and wm.workspace_id = p_workspace_id;

  if v_role_id is not null then
    select coalesce(array_agg(distinct p.clave), '{}') into v_keys
    from public.rol_permisos rp
    join public.permisos p on p.id = rp.permiso_id
    where rp.rol_id = v_role_id;
  else
    v_keys := public.resolve_user_permission_keys(p_usuario_id);
  end if;

  -- Compatibilidad: el gerente legacy recibe permisos de equipo.
  if exists (
    select 1 from public.workspace_miembros wm
    where wm.usuario_id = p_usuario_id
      and wm.workspace_id = p_workspace_id
      and wm.rol_en_workspace = 'gerente'
  ) then
    v_keys := v_keys || array[
      'expedientes:ver_equipo',
      'ventas:ver_equipo',
      'dashboard:ver_equipo',
      'metas:ver_equipo'
    ];
  end if;

  select coalesce(array_agg(distinct clave), '{}') into v_keys
  from (
    select unnest(coalesce(v_keys, '{}')) as clave
    union
    select p.clave
    from public.workspace_usuario_permisos_override o
    join public.permisos p on p.id = o.permiso_id
    where o.workspace_id = p_workspace_id
      and o.usuario_id = p_usuario_id
      and o.otorgado = true
  ) granted;

  select coalesce(array_agg(clave), '{}') into v_keys
  from (
    select unnest(coalesce(v_keys, '{}')) as clave
    except
    select p.clave
    from public.workspace_usuario_permisos_override o
    join public.permisos p on p.id = o.permiso_id
    where o.workspace_id = p_workspace_id
      and o.usuario_id = p_usuario_id
      and o.otorgado = false
  ) effective;

  return coalesce(v_keys, '{}');
end;
$$;

create or replace function public.workspace_has_permission(
  p_usuario_id uuid,
  p_workspace_id uuid,
  p_clave text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.user_in_workspace(p_usuario_id, p_workspace_id)
    and p_clave = any(public.effective_workspace_permissions(p_usuario_id, p_workspace_id));
$$;

-- Resolver de módulos con contexto tenant.
create or replace function public.resolver_workspace_flag(
  p_clave text,
  p_usuario_id uuid,
  p_workspace_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_flag_id uuid;
  v_parent_id uuid;
  v_parent_clave text;
  v_paquete_id uuid;
  v_rule boolean;
begin
  select id, flag_padre into v_flag_id, v_parent_id
  from public.flags where clave = p_clave;
  if v_flag_id is null then return false; end if;

  if v_parent_id is not null then
    select clave into v_parent_clave from public.flags where id = v_parent_id;
    if not public.resolver_workspace_flag(v_parent_clave, p_usuario_id, p_workspace_id) then
      return false;
    end if;
  end if;

  select r.paquete_id into v_paquete_id
  from public.workspace_miembros wm
  join public.roles r on r.id = wm.role_id
  where wm.usuario_id = p_usuario_id and wm.workspace_id = p_workspace_id;

  if v_paquete_id is not null then
    select pf.activo into v_rule
    from public.paquete_flags pf
    where pf.paquete_id = v_paquete_id and pf.flag_id = v_flag_id;
    if found then return v_rule; end if;
  end if;

  return public.resolver_flag(p_clave, p_usuario_id);
end;
$$;

revoke all on function public.user_in_empresa(uuid, uuid) from public;
revoke all on function public.user_is_empresa_admin(uuid, uuid) from public;
revoke all on function public.effective_workspace_permissions(uuid, uuid) from public;
revoke all on function public.workspace_has_permission(uuid, uuid, text) from public;
revoke all on function public.resolver_workspace_flag(text, uuid, uuid) from public;
grant execute on function public.user_in_empresa(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_is_empresa_admin(uuid, uuid) to authenticated, service_role;
grant execute on function public.effective_workspace_permissions(uuid, uuid) to authenticated, service_role;
grant execute on function public.workspace_has_permission(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.resolver_workspace_flag(text, uuid, uuid) to authenticated, service_role;

-- ---------- RLS tablas tenant ----------
alter table public.paquetes_acceso enable row level security;
alter table public.paquete_flags enable row level security;
alter table public.empresa_miembros enable row level security;
alter table public.workspace_usuario_permisos_override enable row level security;

create policy "paquetes_select_empresa" on public.paquetes_acceso
  for select to authenticated using (public.user_in_empresa(auth.uid(), empresa_id));
create policy "paquete_flags_select_empresa" on public.paquete_flags
  for select to authenticated using (
    exists (
      select 1 from public.paquetes_acceso pa
      where pa.id = paquete_id and public.user_in_empresa(auth.uid(), pa.empresa_id)
    )
  );
create policy "empresa_miembros_select_empresa" on public.empresa_miembros
  for select to authenticated using (public.user_in_empresa(auth.uid(), empresa_id));
create policy "workspace_overrides_select_context" on public.workspace_usuario_permisos_override
  for select to authenticated using (
    usuario_id = auth.uid()
    or public.workspace_has_permission(auth.uid(), workspace_id, 'users:permissions')
  );

-- ---------- Reemplazo de policies amplias de dominio ----------
drop policy if exists "prospects_select_member" on public.prospects;
drop policy if exists "prospects_insert_member" on public.prospects;
drop policy if exists "prospects_update_member" on public.prospects;
drop policy if exists "prospects_delete_member" on public.prospects;
drop policy if exists "prospects_update_shared_edit" on public.prospects;

create policy "prospects_select_tenant_role" on public.prospects
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = prospects.id and ps.shared_with_id = auth.uid()
      )
    )
  );
create policy "prospects_insert_tenant_role" on public.prospects
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:crear')
  );
create policy "prospects_update_tenant_role" on public.prospects
  for update to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      (user_id = auth.uid() and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'))
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = prospects.id
          and ps.shared_with_id = auth.uid()
          and public.share_can_edit(ps.permission)
      )
    )
  )
  with check (public.user_in_workspace(auth.uid(), workspace_id));
create policy "prospects_delete_tenant_role" on public.prospects
  for delete to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      (user_id = auth.uid() and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:eliminar'))
      or public.user_is_empresa_admin(
        auth.uid(),
        (select w.empresa_id from public.workspaces w where w.id = prospects.workspace_id)
      )
    )
  );

drop policy if exists "sales_select_member" on public.sales;
drop policy if exists "sales_insert_member" on public.sales;
drop policy if exists "sales_update_member" on public.sales;
drop policy if exists "sales_delete_member" on public.sales;
drop policy if exists "sales_select_shared" on public.sales;

create policy "sales_select_tenant_role" on public.sales
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'ventas:ver_equipo')
      or exists (
        select 1 from public.prospect_shares ps
        join public.prospects p on p.id = ps.prospect_id
        where ps.prospect_id = sales.prospect_id
          and ps.shared_with_id = auth.uid()
          and p.workspace_id = sales.workspace_id
      )
    )
  );
create policy "sales_insert_tenant_role" on public.sales
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'ventas:registrar')
  );
create policy "sales_update_tenant_role" on public.sales
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'ventas:editar')
  )
  with check (user_id = auth.uid() and public.user_in_workspace(auth.uid(), workspace_id));
create policy "sales_delete_tenant_role" on public.sales
  for delete to authenticated using (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'ventas:cancelar')
  );

drop policy if exists "activities_select_member" on public.activities;
drop policy if exists "activities_insert_member" on public.activities;
drop policy if exists "activities_update_member" on public.activities;
drop policy if exists "activities_delete_member" on public.activities;
drop policy if exists "activities_select_shared" on public.activities;

create policy "activities_select_tenant_role" on public.activities
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_shares ps
        join public.prospects p on p.id = ps.prospect_id
        where ps.prospect_id = activities.prospect_id
          and ps.shared_with_id = auth.uid()
          and p.workspace_id = activities.workspace_id
      )
    )
  );
create policy "activities_insert_tenant_role" on public.activities
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar')
  );
create policy "activities_update_tenant_role" on public.activities
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar')
  )
  with check (user_id = auth.uid() and public.user_in_workspace(auth.uid(), workspace_id));
create policy "activities_delete_tenant_role" on public.activities
  for delete to authenticated using (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar')
  );

drop policy if exists "goals_select_member" on public.goals;
drop policy if exists "goals_insert_member" on public.goals;
drop policy if exists "goals_update_member" on public.goals;
drop policy if exists "goals_delete_member" on public.goals;
create policy "goals_select_tenant_role" on public.goals
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'metas:ver_equipo')
    )
  );
create policy "goals_write_tenant_role" on public.goals
  for all to authenticated
  using (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'metas:ver_editar_propias')
  )
  with check (
    user_id = auth.uid()
    and public.workspace_has_permission(auth.uid(), workspace_id, 'metas:ver_editar_propias')
  );

drop policy if exists "tools_select_member" on public.tool_calculations;
drop policy if exists "tools_insert_member" on public.tool_calculations;
drop policy if exists "tools_update_member" on public.tool_calculations;
drop policy if exists "tools_delete_member" on public.tool_calculations;
drop policy if exists "tool_calc_select_shared" on public.tool_calculations;
drop policy if exists "tool_calc_insert_shared_edit" on public.tool_calculations;
drop policy if exists "tool_calc_update_shared_edit" on public.tool_calculations;

create policy "tools_select_tenant_role" on public.tool_calculations
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_shares ps
        join public.prospects p on p.id = ps.prospect_id
        where ps.prospect_id = tool_calculations.prospect_id
          and ps.shared_with_id = auth.uid()
          and p.workspace_id = tool_calculations.workspace_id
      )
    )
  );
create policy "tools_insert_tenant_role" on public.tool_calculations
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.user_in_workspace(auth.uid(), workspace_id)
  );
create policy "tools_update_tenant_role" on public.tool_calculations
  for update to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.prospect_shares ps
        join public.prospects p on p.id = ps.prospect_id
        where ps.prospect_id = tool_calculations.prospect_id
          and ps.shared_with_id = auth.uid()
          and public.share_can_edit(ps.permission)
          and p.workspace_id = tool_calculations.workspace_id
      )
    )
  )
  with check (public.user_in_workspace(auth.uid(), workspace_id));
create policy "tools_delete_tenant_role" on public.tool_calculations
  for delete to authenticated using (
    user_id = auth.uid() and public.user_in_workspace(auth.uid(), workspace_id)
  );

comment on table public.empresa_miembros is 'Membresía administrativa directa a empresa.';
comment on table public.paquetes_acceso is 'Paquetes tenant que habilitan módulos mediante paquete_flags.';
comment on function public.effective_workspace_permissions(uuid, uuid) is 'Permisos efectivos de un usuario dentro de un workspace.';
