-- ============================================================
-- 0099 — Rol plataforma `liner` al registrarse
-- handle_new_user asigna profiles.role_id al rol de plataforma
-- con slug 'liner' (empresa_id nulo). No toca perfiles legacy.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  v_role_id uuid;
begin
  select r.id into v_role_id
  from public.roles r
  where r.empresa_id is null
    and r.slug = 'liner'
  order by r.id
  limit 1;

  insert into public.profiles (id, full_name, email, role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    v_role_id
  )
  on conflict (id) do nothing;

  ws := public.ensure_personal_workspace(new.id);
  update public.profiles set workspace_activo_id = ws where id = new.id;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Bootstrap de perfil + workspace personal; role_id = liner de plataforma si existe.';
