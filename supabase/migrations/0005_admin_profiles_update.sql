-- Admin puede actualizar perfiles (p. ej. cambiar rol desde el panel).
-- Incluye is_admin() por si la migración 0004 no se aplicó aún en este proyecto.

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

drop policy if exists "profiles_admin_update" on public.profiles;

create policy "profiles_admin_update" on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());
