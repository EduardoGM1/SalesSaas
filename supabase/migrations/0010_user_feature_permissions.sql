-- ============================================================
-- Permisos de funciones para vendedores/gerentes
-- ============================================================

alter table public.profiles
  add column if not exists user_permissions text[] not null default '{}';

alter table public.sales
  add column if not exists snapshot jsonb;

create or replace function public.admin_set_user_features(p_target_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'sales:view_modal', 'sales:view_detail', 'sales:history'
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

  if v_target_role = 'admin'::public.user_role then
    raise exception 'Usa permisos de admin para usuarios administradores';
  end if;

  select coalesce(array_agg(distinct p), '{}'::text[])
  into v_clean
  from unnest(coalesce(p_permissions, '{}'::text[])) as p
  where p = any(v_allowed);

  update public.profiles
  set user_permissions = coalesce(v_clean, '{}'::text[])
  where id = p_target_id;
end;
$$;

grant execute on function public.admin_set_user_features(uuid, text[]) to authenticated;
