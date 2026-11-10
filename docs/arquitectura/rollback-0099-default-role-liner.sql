-- Rollback exacto de 0099_default_role_liner_on_register.sql
-- Restaura handle_new_user post-0052 (sin role_id por defecto).

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

comment on function public.handle_new_user() is
  'Bootstrap de perfil + workspace personal al crear auth.users.';
