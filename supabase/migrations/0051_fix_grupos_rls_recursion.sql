-- 0051: Evitar recursión infinita RLS entre grupos ↔ grupo_miembros
-- Causa: políticas SELECT se consultaban mutuamente bajo RLS.
-- Fix: helpers SECURITY DEFINER (bypasan RLS) + políticas sin subqueries cruzadas.

create or replace function public.my_grupo_ids(p_user_id uuid default auth.uid())
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(distinct gid),
    '{}'::uuid[]
  )
  from (
    select g.id as gid
    from public.grupos g
    where g.gerente_id = p_user_id
    union
    select m.grupo_id as gid
    from public.grupo_miembros m
    where m.usuario_id = p_user_id
  ) s;
$$;

grant execute on function public.my_grupo_ids(uuid) to authenticated;

create or replace function public.is_grupo_gerente(p_grupo_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.grupos g
    where g.id = p_grupo_id and g.gerente_id = p_user_id
  );
$$;

grant execute on function public.is_grupo_gerente(uuid, uuid) to authenticated;

-- Políticas SELECT sin cruzar tablas bajo RLS
drop policy if exists grupos_select_related on public.grupos;
create policy grupos_select_related on public.grupos
  for select to authenticated
  using (
    public.is_super_admin()
    or gerente_id = auth.uid()
    or id = any (public.my_grupo_ids(auth.uid()))
  );

drop policy if exists grupo_miembros_select_related on public.grupo_miembros;
create policy grupo_miembros_select_related on public.grupo_miembros
  for select to authenticated
  using (
    public.is_super_admin()
    or usuario_id = auth.uid()
    or public.is_grupo_gerente(grupo_id, auth.uid())
  );

-- modulo_activacion también cruzaba grupos/miembros
drop policy if exists modulo_act_select_related on public.modulo_activacion;
create policy modulo_act_select_related on public.modulo_activacion
  for select to authenticated
  using (
    public.is_super_admin()
    or (scope_tipo = 'usuario' and usuario_id = auth.uid())
    or (scope_tipo = 'organizacion' and organizacion_id in (
      select organizacion_id from public.profiles where id = auth.uid()
    ))
    or (scope_tipo = 'grupo' and grupo_id = any (public.my_grupo_ids(auth.uid())))
  );

comment on function public.my_grupo_ids(uuid) is
  'IDs de grupos del usuario (gerente o miembro). SECURITY DEFINER para evitar recursión RLS.';
comment on function public.is_grupo_gerente(uuid, uuid) is
  '¿El usuario es gerente del grupo? SECURITY DEFINER para evitar recursión RLS.';
