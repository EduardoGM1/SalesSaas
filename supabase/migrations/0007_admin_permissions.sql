-- ============================================================
-- Permisos granulares de admin: super admin + permisos delegados
-- ============================================================

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists admin_permissions text[] not null default '{}';

-- Un solo super admin en el sistema
create unique index if not exists profiles_one_super_admin
  on public.profiles ((true))
  where is_super_admin = true;

-- Super admin principal
update public.profiles
set role = 'admin', is_super_admin = true, admin_permissions = '{}'
where lower(email) = lower('eduardolalito99@hotmail.com');

-- ---------- Helpers de permisos ----------

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.has_admin_permission(perm text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and perm = any(admin_permissions)
    );
$$;

grant execute on function public.is_super_admin() to anon, authenticated, service_role;
grant execute on function public.has_admin_permission(text) to anon, authenticated, service_role;

-- ---------- RLS lectura global (reemplaza is_admin() plano) ----------

drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles
  for select using (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('users:read'))
  );

drop policy if exists "prospects_admin_read" on public.prospects;
create policy "prospects_admin_read" on public.prospects
  for select using (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('sales:read'))
  );

drop policy if exists "sales_admin_read" on public.sales;
create policy "sales_admin_read" on public.sales
  for select using (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('sales:read'))
  );

drop policy if exists "cal_admin_read" on public.calendar_entries;
create policy "cal_admin_read" on public.calendar_entries
  for select using (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('agenda:read'))
  );

drop policy if exists "goals_admin_read" on public.goals;
create policy "goals_admin_read" on public.goals
  for select using (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('goals:read'))
  );

drop policy if exists "activities_admin_read" on public.activities;
create policy "activities_admin_read" on public.activities
  for select using (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('activity:read'))
  );

drop policy if exists "tool_calc_admin_read" on public.tool_calculations;
create policy "tool_calc_admin_read" on public.tool_calculations
  for select using (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('worksheets:read'))
  );

-- ---------- Mutaciones admin (SECURITY DEFINER) ----------

create or replace function public.admin_set_user_active(p_target_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target_super boolean;
begin
  if v_caller is null then
    raise exception 'No autenticado';
  end if;

  select is_super_admin into v_target_super
  from public.profiles where id = p_target_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  if v_target_super and not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  if p_active then
    if not (public.is_super_admin() or public.has_admin_permission('users:activate')) then
      raise exception 'No autorizado';
    end if;
  else
    if not (public.is_super_admin() or public.has_admin_permission('users:deactivate')) then
      raise exception 'No autorizado';
    end if;
    if p_target_id = v_caller then
      raise exception 'No puedes desactivar tu propia cuenta';
    end if;
  end if;

  update public.profiles set is_active = p_active where id = p_target_id;
end;
$$;

create or replace function public.admin_update_user_role(p_target_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target_super boolean;
begin
  if v_caller is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select is_super_admin into v_target_super
  from public.profiles where id = p_target_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  if v_target_super and p_role is distinct from 'admin'::public.user_role then
    raise exception 'No puedes quitar el rol al administrador principal';
  end if;

  if p_target_id = v_caller and p_role is distinct from 'admin'::public.user_role then
    raise exception 'No puedes quitarte el rol de administrador';
  end if;

  update public.profiles
  set
    role = p_role,
    admin_permissions = case when p_role = 'admin'::public.user_role then admin_permissions else '{}'::text[] end,
    is_super_admin = case when p_role = 'admin'::public.user_role then is_super_admin else false end
  where id = p_target_id;
end;
$$;

create or replace function public.admin_set_user_permissions(p_target_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'dashboard:read', 'users:read', 'users:deactivate', 'users:activate', 'users:export',
    'sales:read', 'sales:export', 'agenda:read', 'goals:read', 'activity:read', 'worksheets:read'
  ];
  v_clean text[];
  v_target_role public.user_role;
  v_target_super boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  select role, is_super_admin into v_target_role, v_target_super
  from public.profiles where id = p_target_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  if v_target_super then
    raise exception 'No puedes modificar permisos del administrador principal';
  end if;

  if v_target_role is distinct from 'admin'::public.user_role then
    raise exception 'Solo aplica a usuarios con rol admin';
  end if;

  select coalesce(array_agg(distinct p), '{}'::text[])
  into v_clean
  from unnest(coalesce(p_permissions, '{}'::text[])) as p
  where p = any(v_allowed);

  update public.profiles
  set admin_permissions = coalesce(v_clean, '{}'::text[])
  where id = p_target_id;
end;
$$;

grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.admin_update_user_role(uuid, public.user_role) to authenticated;
grant execute on function public.admin_set_user_permissions(uuid, text[]) to authenticated;

-- Solo super admin puede actualizar perfiles directamente (delegados usan RPC)
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
