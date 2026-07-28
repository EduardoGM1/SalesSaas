-- ============================================================
-- 0056 — Backfill compatible, acceso de Cerrador e invariantes
-- ============================================================

-- ---------- Paquetes compatibles por empresa ----------
insert into public.paquetes_acceso (
  empresa_id,
  nombre,
  slug,
  descripcion,
  es_sistema,
  activo
)
select
  e.id,
  'Operación base',
  'operacion-base',
  'Compatibilidad con los módulos habilitados antes del RBAC tenant.',
  true,
  true
from public.empresas e
on conflict (empresa_id, slug) do nothing;

insert into public.paquetes_acceso (
  empresa_id,
  nombre,
  slug,
  descripcion,
  es_sistema,
  activo
)
select
  e.id,
  'Cierre',
  'cierre',
  'Operación base más Money Box y capacidades de cierre.',
  true,
  true
from public.empresas e
on conflict (empresa_id, slug) do nothing;

-- Materializa todos los flags para que un paquete controle el catálogo completo.
insert into public.paquete_flags (paquete_id, flag_id, activo)
select
  pa.id,
  f.id,
  coalesce(
    (
      select fr.activo
      from public.flag_reglas fr
      where fr.flag_id = f.id
        and fr.alcance = 'rol'
        and fr.alcance_id = 'a0000000-0000-4000-8000-000000000003'
      limit 1
    ),
    f.default_global
  )
from public.paquetes_acceso pa
cross join public.flags f
where pa.slug in ('operacion-base', 'cierre')
on conflict (paquete_id, flag_id) do nothing;

update public.paquete_flags pf
set activo = true
from public.paquetes_acceso pa
join public.flags f on f.clave = 'worksheet.money_box'
where pf.paquete_id = pa.id
  and pf.flag_id = f.id
  and pa.slug = 'cierre';

-- ---------- Puestos tenant equivalentes ----------
insert into public.roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
select e.id, 'Gerente', 'gerente', 'workspace', pa.id, true
from public.empresas e
join public.paquetes_acceso pa on pa.empresa_id = e.id and pa.slug = 'operacion-base'
where not exists (
  select 1 from public.roles r where r.empresa_id = e.id and r.slug = 'gerente'
);

insert into public.roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
select e.id, 'Vendedor', 'vendedor', 'workspace', pa.id, true
from public.empresas e
join public.paquetes_acceso pa on pa.empresa_id = e.id and pa.slug = 'operacion-base'
where not exists (
  select 1 from public.roles r where r.empresa_id = e.id and r.slug = 'vendedor'
);

insert into public.roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
select e.id, 'Cerrador', 'cerrador', 'workspace', pa.id, true
from public.empresas e
join public.paquetes_acceso pa on pa.empresa_id = e.id and pa.slug = 'cierre'
where not exists (
  select 1 from public.roles r where r.empresa_id = e.id and r.slug = 'cerrador'
);

-- Vendedor tenant hereda el catálogo app del Vendedor global.
insert into public.rol_permisos (rol_id, permiso_id)
select tenant_role.id, rp.permiso_id
from public.roles tenant_role
join public.rol_permisos rp on rp.rol_id = 'a0000000-0000-4000-8000-000000000003'
where tenant_role.slug in ('vendedor', 'cerrador', 'gerente')
  and tenant_role.empresa_id is not null
on conflict do nothing;

-- Capacidades específicas de workflow y equipo.
insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on (
  (r.slug = 'vendedor' and p.clave in ('workflow:ver', 'workflow:avanzar'))
  or (r.slug = 'cerrador' and p.clave in ('workflow:ver', 'workflow:avanzar', 'workflow:cerrar'))
  or (
    r.slug = 'gerente'
    and p.clave in (
      'workflow:ver',
      'workflow:revisar',
      'workflow:asignar_cerrador',
      'expedientes:ver_equipo',
      'ventas:ver_equipo',
      'dashboard:ver_equipo',
      'metas:ver_equipo'
    )
  )
)
where r.empresa_id is not null
on conflict do nothing;

update public.workspace_miembros wm
set role_id = r.id
from public.workspaces w
join public.roles r on r.empresa_id = w.empresa_id and r.scope = 'workspace'
where wm.workspace_id = w.id
  and wm.role_id is null
  and r.slug = case when wm.rol_en_workspace = 'gerente' then 'gerente' else 'vendedor' end;

-- ---------- Expedientes existentes ----------
insert into public.prospect_workflows (
  prospect_id,
  workspace_id,
  etapa_actual,
  estado,
  representante_id,
  gerente_id,
  created_by,
  created_at,
  updated_at
)
select
  p.id,
  p.workspace_id,
  'representante',
  'en_progreso',
  p.user_id,
  (
    select wm.usuario_id
    from public.workspace_miembros wm
    where wm.workspace_id = p.workspace_id and wm.rol_en_workspace = 'gerente'
    order by wm.fecha_union
    limit 1
  ),
  p.user_id,
  coalesce(p.created_at, now()),
  coalesce(p.updated_at, p.created_at, now())
from public.prospects p
join public.workspaces w on w.id = p.workspace_id and w.tipo = 'sala_de_venta'
on conflict (prospect_id) do nothing;

-- ---------- Resolver de módulos: usuario > paquete > legacy ----------
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
  v_paquete_activo boolean;
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

  select fr.activo into v_rule
  from public.flag_reglas fr
  where fr.flag_id = v_flag_id
    and fr.alcance = 'usuario'
    and fr.alcance_id = p_usuario_id
  limit 1;
  if found then return v_rule; end if;

  select r.paquete_id, pa.activo into v_paquete_id, v_paquete_activo
  from public.workspace_miembros wm
  join public.roles r on r.id = wm.role_id
  left join public.paquetes_acceso pa on pa.id = r.paquete_id
  where wm.usuario_id = p_usuario_id and wm.workspace_id = p_workspace_id;

  if v_paquete_id is not null then
    if v_paquete_activo is not true then return false; end if;
    select pf.activo into v_rule
    from public.paquete_flags pf
    where pf.paquete_id = v_paquete_id and pf.flag_id = v_flag_id;
    return coalesce(v_rule, false);
  end if;

  return public.resolver_flag(p_clave, p_usuario_id);
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
    (
      public.user_in_workspace(p_usuario_id, p_workspace_id)
      or public.user_is_empresa_admin(
        p_usuario_id,
        (select w.empresa_id from public.workspaces w where w.id = p_workspace_id)
      )
    )
    and p_clave = any(public.effective_workspace_permissions(p_usuario_id, p_workspace_id));
$$;

-- ---------- Invariantes de scope ----------
create or replace function public.validate_workspace_member_role_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role_id is not null and not exists (
    select 1
    from public.roles r
    join public.workspaces w on w.id = new.workspace_id
    where r.id = new.role_id
      and r.scope = 'workspace'
      and r.empresa_id = w.empresa_id
  ) then
    raise exception 'El puesto no pertenece a la empresa de la sala';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_member_role_scope on public.workspace_miembros;
create trigger workspace_member_role_scope
before insert or update of workspace_id, role_id on public.workspace_miembros
for each row execute function public.validate_workspace_member_role_scope();

create or replace function public.validate_empresa_member_role_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role_id is not null and not exists (
    select 1 from public.roles r
    where r.id = new.role_id
      and r.scope = 'empresa'
      and r.empresa_id = new.empresa_id
  ) then
    raise exception 'El rol no pertenece a esta empresa';
  end if;
  return new;
end;
$$;

drop trigger if exists empresa_member_role_scope on public.empresa_miembros;
create trigger empresa_member_role_scope
before insert or update of empresa_id, role_id on public.empresa_miembros
for each row execute function public.validate_empresa_member_role_scope();

create or replace function public.validate_tenant_role_package_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.paquete_id is not null and not exists (
    select 1 from public.paquetes_acceso pa
    where pa.id = new.paquete_id and pa.empresa_id = new.empresa_id
  ) then
    raise exception 'El paquete no pertenece a la empresa del puesto';
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_role_package_scope on public.roles;
create trigger tenant_role_package_scope
before insert or update of empresa_id, paquete_id on public.roles
for each row execute function public.validate_tenant_role_package_scope();

-- ---------- El Cerrador opera el expediente original ----------
drop policy if exists "prospects_select_tenant_role" on public.prospects;
create policy "prospects_select_tenant_role" on public.prospects
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_workflows pw
        where pw.prospect_id = prospects.id and pw.cerrador_id = auth.uid()
      )
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = prospects.id and ps.shared_with_id = auth.uid()
      )
    )
  );

drop policy if exists "tools_select_tenant_role" on public.tool_calculations;
create policy "tools_select_tenant_role" on public.tool_calculations
  for select to authenticated using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or public.workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo')
      or exists (
        select 1 from public.prospect_workflows pw
        where pw.prospect_id = tool_calculations.prospect_id and pw.cerrador_id = auth.uid()
      )
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = tool_calculations.prospect_id and ps.shared_with_id = auth.uid()
      )
    )
  );

drop policy if exists "tools_insert_tenant_role" on public.tool_calculations;
create policy "tools_insert_tenant_role" on public.tool_calculations
  for insert to authenticated with check (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or (
        user_id = (select p.user_id from public.prospects p where p.id = prospect_id)
        and exists (
          select 1 from public.prospect_workflows pw
          where pw.prospect_id = tool_calculations.prospect_id and pw.cerrador_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "tools_update_tenant_role" on public.tool_calculations;
create policy "tools_update_tenant_role" on public.tool_calculations
  for update to authenticated
  using (
    public.user_in_workspace(auth.uid(), workspace_id)
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.prospect_workflows pw
        where pw.prospect_id = tool_calculations.prospect_id and pw.cerrador_id = auth.uid()
      )
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = tool_calculations.prospect_id
          and ps.shared_with_id = auth.uid()
          and public.share_can_edit(ps.permission)
      )
    )
  )
  with check (public.user_in_workspace(auth.uid(), workspace_id));
