-- Admin privacy: agregados sin PII de clientes (LFPDPPP / minimización)
-- 1) Permiso tools:analytics
-- 2) Quitar lectura admin directa a CRM (sales, prospects, agenda, activities, tool_calculations)
-- 3) RPCs SECURITY DEFINER solo con métricas agregadas

-- ---------- Migrar permisos delegados ----------
update public.profiles
set admin_permissions = (
  select coalesce(array_agg(distinct x), '{}'::text[])
  from (
    select case
      when p = 'worksheets:read' then 'tools:analytics'
      when p in (
        'sales:read', 'sales:export', 'agenda:read', 'prospects:read',
        'activity:read', 'worksheets:read'
      ) then null
      else p
    end as x
    from unnest(coalesce(admin_permissions, '{}'::text[])) as p
  ) s
  where x is not null
)
where role = 'admin'::public.user_role
  and is_super_admin is not true;

-- ---------- Allowlist de permisos delegables ----------
create or replace function public.admin_set_user_permissions(p_target_id uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'dashboard:read', 'users:read', 'users:deactivate', 'users:activate', 'users:export',
    'goals:read', 'tools:analytics'
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

-- ---------- Quitar lectura CRM global del admin ----------
drop policy if exists "prospects_admin_read" on public.prospects;
drop policy if exists "sales_admin_read" on public.sales;
drop policy if exists "cal_admin_read" on public.calendar_entries;
drop policy if exists "activities_admin_read" on public.activities;
drop policy if exists "tool_calc_admin_read" on public.tool_calculations;

-- ---------- Overview agregado (sin nombres de clientes) ----------
create or replace function public.admin_platform_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char(timezone('utc', now()), 'YYYY-MM');
  v_users int;
  v_prospects int;
  v_sales int;
  v_total_vol numeric := 0;
  v_month_sales int := 0;
  v_month_vol numeric := 0;
  v_trend jsonb := '[]'::jsonb;
  v_top jsonb := '[]'::jsonb;
begin
  if not (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('dashboard:read'))
  ) then
    raise exception 'No autorizado';
  end if;

  select count(*)::int into v_users from public.profiles;
  select count(*)::int into v_prospects from public.prospects;
  select count(*)::int, coalesce(sum(vol), 0) into v_sales, v_total_vol from public.sales;

  select count(*)::int, coalesce(sum(vol), 0)
  into v_month_sales, v_month_vol
  from public.sales
  where to_char(sale_date, 'YYYY-MM') = v_month;

  with months as (
    select to_char(d, 'YYYY-MM') as month_key,
           d
    from generate_series(
      date_trunc('month', timezone('utc', now())) - interval '5 months',
      date_trunc('month', timezone('utc', now())),
      interval '1 month'
    ) as d
  ),
  agg as (
    select to_char(s.sale_date, 'YYYY-MM') as month_key,
           count(*)::int as sales,
           coalesce(sum(s.vol), 0) as volume
    from public.sales s
    where s.sale_date >= (date_trunc('month', timezone('utc', now())) - interval '5 months')::date
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', m.month_key,
      'label', m.month_key,
      'sales', coalesce(a.sales, 0),
      'volume', coalesce(a.volume, 0)
    ) order by m.d
  ), '[]'::jsonb)
  into v_trend
  from months m
  left join agg a on a.month_key = m.month_key;

  select coalesce(jsonb_agg(row_data order by volume desc), '[]'::jsonb)
  into v_top
  from (
    select jsonb_build_object(
      'name', coalesce(nullif(p.full_name, ''), nullif(p.email, ''), 'Usuario'),
      'sales', count(*)::int,
      'volume', coalesce(sum(s.vol), 0)
    ) as row_data,
    coalesce(sum(s.vol), 0) as volume
    from public.sales s
    join public.profiles p on p.id = s.user_id
    group by p.id, p.full_name, p.email
    order by coalesce(sum(s.vol), 0) desc
    limit 5
  ) t;

  return jsonb_build_object(
    'usersCount', v_users,
    'prospectsCount', v_prospects,
    'salesCount', v_sales,
    'totalVolume', v_total_vol,
    'monthSalesCount', v_month_sales,
    'monthVolume', v_month_vol,
    'topSellers', v_top,
    'trend', v_trend,
    'recentSales', '[]'::jsonb
  );
end;
$$;

grant execute on function public.admin_platform_overview() to authenticated;

-- ---------- Stats de usuarios (conteos, sin PII de clientes) ----------
create or replace function public.admin_user_stats()
returns table (
  user_id uuid,
  prospects int,
  sales int,
  volume numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('users:read'))
  ) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    p.id,
    coalesce(pr.c, 0)::int,
    coalesce(sa.c, 0)::int,
    coalesce(sa.v, 0)
  from public.profiles p
  left join (
    select prx.user_id as seller_id, count(*)::int as c
    from public.prospects prx
    group by prx.user_id
  ) pr on pr.seller_id = p.id
  left join (
    select sx.user_id as seller_id, count(*)::int as c, coalesce(sum(sx.vol), 0) as v
    from public.sales sx
    group by sx.user_id
  ) sa on sa.seller_id = p.id;
end;
$$;

grant execute on function public.admin_user_stats() to authenticated;

-- ---------- Uso de herramientas (sin jsonb data ni nombres de clientes) ----------
create or replace function public.admin_tools_usage(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by_tool jsonb;
  v_top jsonb;
  v_trend jsonb;
  v_total int;
begin
  if not (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('tools:analytics'))
  ) then
    raise exception 'No autorizado';
  end if;

  with filtered as (
    select tc.user_id, tc.tool, tc.prospect_id, tc.updated_at
    from public.tool_calculations tc
    where (p_from is null or tc.updated_at >= p_from)
      and (p_to is null or tc.updated_at <= p_to)
      and (p_user_id is null or tc.user_id = p_user_id)
  ),
  tools as (
    select unnest(array[
      'survey'::public.tool_type,
      'vacaciones'::public.tool_type,
      'worksheet'::public.tool_type
    ]) as tool
  ),
  agg as (
    select
      f.tool,
      count(*)::int as saves,
      count(distinct f.user_id)::int as unique_users,
      count(*) filter (where f.prospect_id is null)::int as libre,
      count(*) filter (where f.prospect_id is not null)::int as linked
    from filtered f
    group by f.tool
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tool', t.tool::text,
      'saves', coalesce(a.saves, 0),
      'uniqueUsers', coalesce(a.unique_users, 0),
      'libre', coalesce(a.libre, 0),
      'linked', coalesce(a.linked, 0)
    ) order by t.tool::text
  ), '[]'::jsonb)
  into v_by_tool
  from tools t
  left join agg a on a.tool = t.tool;

  select count(*)::int into v_total
  from public.tool_calculations tc
  where (p_from is null or tc.updated_at >= p_from)
    and (p_to is null or tc.updated_at <= p_to)
    and (p_user_id is null or tc.user_id = p_user_id);

  select coalesce(jsonb_agg(row_data order by total desc), '[]'::jsonb)
  into v_top
  from (
    select jsonb_build_object(
      'user_id', tc.user_id,
      'name', coalesce(nullif(p.full_name, ''), nullif(p.email, ''), 'Usuario'),
      'total', count(*)::int,
      'survey', count(*) filter (where tc.tool = 'survey'::public.tool_type),
      'vacaciones', count(*) filter (where tc.tool = 'vacaciones'::public.tool_type),
      'worksheet', count(*) filter (where tc.tool = 'worksheet'::public.tool_type)
    ) as row_data,
    count(*)::int as total
    from public.tool_calculations tc
    join public.profiles p on p.id = tc.user_id
    where (p_from is null or tc.updated_at >= p_from)
      and (p_to is null or tc.updated_at <= p_to)
      and (p_user_id is null or tc.user_id = p_user_id)
    group by tc.user_id, p.full_name, p.email
    order by count(*) desc
    limit 10
  ) ranked;

  with months as (
    select to_char(d, 'YYYY-MM') as month_key, d
    from generate_series(
      date_trunc('month', timezone('utc', now())) - interval '5 months',
      date_trunc('month', timezone('utc', now())),
      interval '1 month'
    ) as d
  ),
  agg as (
    select to_char(tc.updated_at, 'YYYY-MM') as month_key, tc.tool, count(*)::int as saves
    from public.tool_calculations tc
    where tc.updated_at >= (date_trunc('month', timezone('utc', now())) - interval '5 months')
      and (p_user_id is null or tc.user_id = p_user_id)
    group by 1, 2
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', m.month_key,
      'survey', coalesce((
        select a.saves from agg a
        where a.month_key = m.month_key and a.tool = 'survey'::public.tool_type
      ), 0),
      'vacaciones', coalesce((
        select a.saves from agg a
        where a.month_key = m.month_key and a.tool = 'vacaciones'::public.tool_type
      ), 0),
      'worksheet', coalesce((
        select a.saves from agg a
        where a.month_key = m.month_key and a.tool = 'worksheet'::public.tool_type
      ), 0)
    ) order by m.d
  ), '[]'::jsonb)
  into v_trend
  from months m;

  return jsonb_build_object(
    'totalSaves', v_total,
    'byTool', v_by_tool,
    'topUsers', v_top,
    'trend', v_trend
  );
end;
$$;

grant execute on function public.admin_tools_usage(timestamptz, timestamptz, uuid) to authenticated;

-- Lectura de perfiles para filtros admin (solo nombre/email de vendedores; sin CRM)
drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles
  for select using (
    public.is_super_admin()
    or (
      public.is_admin()
      and (
        public.has_admin_permission('users:read')
        or public.has_admin_permission('dashboard:read')
        or public.has_admin_permission('goals:read')
        or public.has_admin_permission('tools:analytics')
      )
    )
  );
