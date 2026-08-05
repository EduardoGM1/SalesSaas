-- ============================================================
-- 0068 — Asistentes (permisos_delegados) + acceso cruzado Gerente
-- ============================================================

-- ---------- 1) Permisos delegados ----------
create table if not exists public.permisos_delegados (
  id uuid primary key default gen_random_uuid(),
  usuario_delegante_id uuid not null references auth.users(id) on delete cascade,
  usuario_asistente_id uuid not null references auth.users(id) on delete cascade,
  permiso_id uuid not null references public.permisos(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  sala_id uuid references public.workspaces(id) on delete cascade,
  otorgado_en timestamptz not null default now(),
  otorgado_por uuid not null references auth.users(id) on delete cascade,
  constraint permisos_delegados_alcance_chk check (
    (empresa_id is not null and sala_id is null)
    or (empresa_id is null and sala_id is not null)
  ),
  constraint permisos_delegados_no_self check (usuario_delegante_id <> usuario_asistente_id)
);

create unique index if not exists permisos_delegados_empresa_uidx
  on public.permisos_delegados (usuario_asistente_id, permiso_id, empresa_id)
  where empresa_id is not null;

create unique index if not exists permisos_delegados_sala_uidx
  on public.permisos_delegados (usuario_asistente_id, permiso_id, sala_id)
  where sala_id is not null;

create index if not exists permisos_delegados_asistente_idx
  on public.permisos_delegados (usuario_asistente_id);
create index if not exists permisos_delegados_delegante_idx
  on public.permisos_delegados (usuario_delegante_id);

alter table public.permisos_delegados enable row level security;

drop policy if exists "permisos_delegados_select_parties" on public.permisos_delegados;
create policy "permisos_delegados_select_parties" on public.permisos_delegados
  for select to authenticated
  using (
    auth.uid() = usuario_delegante_id
    or auth.uid() = usuario_asistente_id
    or public.is_super_admin()
  );

drop policy if exists "permisos_delegados_write_delegante" on public.permisos_delegados;
create policy "permisos_delegados_write_delegante" on public.permisos_delegados
  for all to authenticated
  using (auth.uid() = usuario_delegante_id or public.is_super_admin())
  with check (auth.uid() = usuario_delegante_id or public.is_super_admin());

comment on table public.permisos_delegados is
  'Permisos delegados a Asistente de Empresa (empresa_id) o Asistente de Sala (sala_id). Techo = permisos del delegante.';

-- ---------- 2) Acceso cruzado Gerente ----------
create table if not exists public.gerente_acceso_cruzado (
  id uuid primary key default gen_random_uuid(),
  gerente_id uuid not null references auth.users(id) on delete cascade,
  sala_adicional_id uuid not null references public.workspaces(id) on delete cascade,
  otorgado_por uuid not null references auth.users(id) on delete cascade,
  fecha_otorgado timestamptz not null default now(),
  estado text not null default 'activo' check (estado in ('activo', 'revocado')),
  constraint gerente_acceso_cruzado_sala_tipo check (
    exists (
      select 1 from public.workspaces w
      where w.id = sala_adicional_id and w.tipo = 'sala_de_venta'
    )
  )
);

create unique index if not exists gerente_acceso_cruzado_activo_uidx
  on public.gerente_acceso_cruzado (gerente_id, sala_adicional_id)
  where estado = 'activo';

create index if not exists gerente_acceso_cruzado_gerente_idx
  on public.gerente_acceso_cruzado (gerente_id)
  where estado = 'activo';

create index if not exists gerente_acceso_cruzado_sala_idx
  on public.gerente_acceso_cruzado (sala_adicional_id)
  where estado = 'activo';

alter table public.gerente_acceso_cruzado enable row level security;

drop policy if exists "gerente_acceso_cruzado_select" on public.gerente_acceso_cruzado;
create policy "gerente_acceso_cruzado_select" on public.gerente_acceso_cruzado
  for select to authenticated
  using (
    auth.uid() = gerente_id
    or auth.uid() = otorgado_por
    or public.is_super_admin()
    or public.user_is_empresa_admin(
      auth.uid(),
      (select w.empresa_id from public.workspaces w where w.id = sala_adicional_id)
    )
  );

drop policy if exists "gerente_acceso_cruzado_write_admin" on public.gerente_acceso_cruzado;
create policy "gerente_acceso_cruzado_write_admin" on public.gerente_acceso_cruzado
  for all to authenticated
  using (
    public.is_super_admin()
    or public.user_is_empresa_admin(
      auth.uid(),
      (select w.empresa_id from public.workspaces w where w.id = sala_adicional_id)
    )
  )
  with check (
    public.is_super_admin()
    or public.user_is_empresa_admin(
      auth.uid(),
      (select w.empresa_id from public.workspaces w where w.id = sala_adicional_id)
    )
  );

-- Misma empresa: la sala adicional y alguna sala donde el gerente ya es miembro
create or replace function public.validate_gerente_acceso_cruzado()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_emp uuid;
  v_home_emp uuid;
begin
  select empresa_id into v_emp from public.workspaces where id = new.sala_adicional_id;
  if v_emp is null then
    raise exception 'La sala adicional debe pertenecer a una empresa';
  end if;

  select w.empresa_id into v_home_emp
  from public.workspace_miembros wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.usuario_id = new.gerente_id
    and w.tipo = 'sala_de_venta'
    and w.empresa_id = v_emp
  limit 1;

  if v_home_emp is null then
    raise exception 'El gerente debe ser miembro de otra sala de la misma empresa';
  end if;

  -- No otorgar acceso a una sala donde ya es miembro
  if exists (
    select 1 from public.workspace_miembros wm
    where wm.usuario_id = new.gerente_id and wm.workspace_id = new.sala_adicional_id
  ) then
    raise exception 'Ya es miembro de esa sala; no requiere acceso cruzado';
  end if;

  return new;
end;
$$;

drop trigger if exists gerente_acceso_cruzado_validate on public.gerente_acceso_cruzado;
create trigger gerente_acceso_cruzado_validate
before insert or update of gerente_id, sala_adicional_id, estado on public.gerente_acceso_cruzado
for each row
when (new.estado = 'activo')
execute function public.validate_gerente_acceso_cruzado();

comment on table public.gerente_acceso_cruzado is
  'Acceso de un Gerente a salas adicionales de la MISMA empresa (nunca cross-tenant).';

-- ---------- 3) user_in_workspace incluye acceso cruzado ----------
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
    and (
      exists (
        select 1 from public.workspace_miembros m
        where m.usuario_id = p_usuario_id
          and m.workspace_id = p_workspace_id
      )
      or exists (
        select 1 from public.gerente_acceso_cruzado g
        where g.gerente_id = p_usuario_id
          and g.sala_adicional_id = p_workspace_id
          and g.estado = 'activo'
      )
    );
$$;

-- ---------- 4) effective_workspace_permissions: delegados + acceso cruzado ----------
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
  v_keys text[];
  v_role_id uuid;
  v_empresa_id uuid;
  v_super boolean;
  v_cross boolean;
  v_asistente_sala boolean;
  v_asistente_emp boolean;
begin
  select is_super_admin into v_super from public.profiles where id = p_usuario_id;
  if coalesce(v_super, false) then
    select coalesce(array_agg(clave order by clave), '{}') into v_keys from public.permisos;
    return v_keys;
  end if;

  select w.empresa_id into v_empresa_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if v_empresa_id is not null
     and public.user_is_empresa_admin(p_usuario_id, v_empresa_id) then
    select coalesce(array_agg(clave order by clave), '{}') into v_keys
    from public.permisos;
    return v_keys;
  end if;

  v_cross := exists (
    select 1 from public.gerente_acceso_cruzado g
    where g.gerente_id = p_usuario_id
      and g.sala_adicional_id = p_workspace_id
      and g.estado = 'activo'
  );

  select wm.role_id into v_role_id
  from public.workspace_miembros wm
  where wm.usuario_id = p_usuario_id and wm.workspace_id = p_workspace_id;

  -- Acceso cruzado: usar rol gerente de la empresa (sin membresía local)
  if v_role_id is null and v_cross and v_empresa_id is not null then
    select r.id into v_role_id
    from public.roles r
    where r.empresa_id = v_empresa_id
      and r.slug = 'gerente'
      and r.scope = 'workspace'
    limit 1;
  end if;

  if v_role_id is not null then
    select coalesce(array_agg(distinct p.clave), '{}') into v_keys
    from public.rol_permisos rp
    join public.permisos p on p.id = rp.permiso_id
    where rp.rol_id = v_role_id;
  else
    v_keys := public.resolve_user_permission_keys(p_usuario_id);
  end if;

  if exists (
    select 1 from public.workspace_miembros wm
    where wm.usuario_id = p_usuario_id
      and wm.workspace_id = p_workspace_id
      and wm.rol_en_workspace = 'gerente'
  ) or v_cross then
    v_keys := v_keys || array[
      'expedientes:ver_equipo',
      'ventas:ver_equipo',
      'dashboard:ver_equipo',
      'metas:ver_equipo'
    ];
  end if;

  -- ¿Asistente de sala? Solo permisos_delegados (vacían el rol base)
  select exists (
    select 1
    from public.workspace_miembros wm
    join public.roles r on r.id = wm.role_id
    where wm.usuario_id = p_usuario_id
      and wm.workspace_id = p_workspace_id
      and r.slug = 'asistente_sala'
  ) into v_asistente_sala;

  select exists (
    select 1
    from public.empresa_miembros em
    join public.roles r on r.id = em.role_id
    where em.usuario_id = p_usuario_id
      and em.empresa_id = v_empresa_id
      and em.estado = 'activo'
      and r.slug = 'asistente_empresa'
  ) into v_asistente_emp;

  if v_asistente_sala or v_asistente_emp then
    v_keys := '{}';
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
      and not (v_asistente_sala or v_asistente_emp)
    union
    -- Delegados de sala
    select p.clave
    from public.permisos_delegados d
    join public.permisos p on p.id = d.permiso_id
    where d.usuario_asistente_id = p_usuario_id
      and d.sala_id = p_workspace_id
    union
    -- Delegados de empresa (aplican en salas de esa empresa)
    select p.clave
    from public.permisos_delegados d
    join public.permisos p on p.id = d.permiso_id
    where d.usuario_asistente_id = p_usuario_id
      and d.empresa_id is not null
      and d.empresa_id = v_empresa_id
  ) granted;

  return coalesce(v_keys, '{}');
end;
$$;

-- Helper: claves delegadas a un asistente (empresa o sala)
create or replace function public.list_permisos_delegados_keys(
  p_asistente_id uuid,
  p_empresa_id uuid default null,
  p_sala_id uuid default null
)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.clave order by p.clave), '{}')
  from public.permisos_delegados d
  join public.permisos p on p.id = d.permiso_id
  where d.usuario_asistente_id = p_asistente_id
    and (
      (p_empresa_id is not null and d.empresa_id = p_empresa_id)
      or (p_sala_id is not null and d.sala_id = p_sala_id)
    );
$$;

grant execute on function public.list_permisos_delegados_keys(uuid, uuid, uuid) to authenticated, service_role;

-- Realtime (opcional): publicación para refresh de sesión del asistente
do $$
begin
  begin
    alter publication supabase_realtime add table public.permisos_delegados;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.gerente_acceso_cruzado;
  exception when duplicate_object then null;
  end;
end $$;
