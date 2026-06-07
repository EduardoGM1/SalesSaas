-- ============================================================
-- Rol de administrador: lectura global del sistema.
-- 1) profiles.email (para listar usuarios en el panel admin)
-- 2) is_admin() (SECURITY DEFINER, evita recursión de RLS)
-- 3) Políticas SELECT para admin en todas las tablas
-- ============================================================

-- 1) Email en profiles
alter table public.profiles
  add column if not exists email text;

-- Poblar email en nuevos registros desde auth.users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- Backfill de emails existentes
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- 2) Helper: ¿el usuario actual es admin? (bypassa RLS por SECURITY DEFINER)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;

-- 3) Políticas de lectura global para admin (se suman con OR a las "own")
create policy "profiles_admin_read"  on public.profiles          for select using (public.is_admin());
create policy "prospects_admin_read" on public.prospects         for select using (public.is_admin());
create policy "sales_admin_read"     on public.sales             for select using (public.is_admin());
create policy "cal_admin_read"       on public.calendar_entries  for select using (public.is_admin());
create policy "goals_admin_read"     on public.goals             for select using (public.is_admin());
create policy "activities_admin_read" on public.activities       for select using (public.is_admin());
create policy "tool_calc_admin_read" on public.tool_calculations for select using (public.is_admin());

-- ============================================================
-- Para promover a un usuario como admin (ejecutar manualmente):
--   update public.profiles set role = 'admin' where email = 'tu@correo.com';
-- ============================================================
