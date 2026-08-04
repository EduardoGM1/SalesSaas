-- ============================================================
-- 0066 — admin_list_roles solo roles de plataforma
-- Los puestos tenant (Gerente/Liner/Cerrador por empresa) no deben
-- aparecer en Panel → Roles (gobierno de plataforma).
-- ============================================================

create or replace function public.admin_list_roles()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  return coalesce((
    select jsonb_agg(row_obj order by sort_rank, nombre)
    from (
      select
        jsonb_build_object(
          'id', r.id,
          'nombre', r.nombre,
          'slug', r.slug,
          'es_sistema', r.es_sistema,
          'scope', coalesce(r.scope, 'plataforma'),
          'empresa_id', r.empresa_id,
          'created_at', r.created_at,
          'permission_keys', coalesce((
            select jsonb_agg(p.clave order by p.clave)
            from public.rol_permisos rp
            join public.permisos p on p.id = rp.permiso_id
            where rp.rol_id = r.id
          ), '[]'::jsonb)
        ) as row_obj,
        r.nombre,
        case r.slug
          when 'superadmin' then 1
          when 'admin' then 2
          when 'soporte' then 3
          when 'vendedor' then 4
          else 100
        end as sort_rank
      from public.roles r
      where r.empresa_id is null
    ) q
  ), '[]'::jsonb);
end;
$$;

comment on function public.admin_list_roles() is
  'Lista roles de plataforma (empresa_id IS NULL). Puestos tenant se gestionan en Empresas → Acceso.';

grant execute on function public.admin_list_roles() to authenticated;
