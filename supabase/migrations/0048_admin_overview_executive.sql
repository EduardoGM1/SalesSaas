-- =============================================================================
-- 0048 — Resumen ejecutivo: métricas agregadas sin desempeño individual
-- =============================================================================
-- Elimina topSellers / rankings por persona del RPC admin_platform_overview.
-- Añade tendencias de expedientes, adopción de herramientas y crecimiento MoM.
-- Auth: is_super_admin o has_admin_permission (acepta ver_resumen vía equivalencias).
-- =============================================================================

create or replace function public.admin_platform_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_month text := to_char(v_now, 'YYYY-MM');
  v_prev_month text := to_char(date_trunc('month', v_now) - interval '1 month', 'YYYY-MM');
  v_year text := to_char(v_now, 'YYYY');
  v_month_start date := date_trunc('month', v_now)::date;
  v_prev_month_start date := (date_trunc('month', v_now) - interval '1 month')::date;
  v_year_start date := date_trunc('year', v_now)::date;
  v_day30 date := (v_now - interval '30 days')::date;

  v_users int := 0;
  v_users_active int := 0;
  v_users_month int := 0;

  v_prospects int := 0;
  v_prospects_closed int := 0;
  v_prospects_month int := 0;
  v_prospects_30 int := 0;

  v_sales int := 0;
  v_total_vol numeric := 0;
  v_month_sales int := 0;
  v_month_vol numeric := 0;
  v_prev_sales int := 0;
  v_prev_vol numeric := 0;
  v_year_sales int := 0;
  v_year_vol numeric := 0;

  v_survey_total int := 0;
  v_survey_linked int := 0;
  v_tool_saves int := 0;
  v_memberships int := 0;

  v_sales_trend jsonb := '[]'::jsonb;
  v_prospects_trend jsonb := '[]'::jsonb;
  v_tools_by_tool jsonb := '[]'::jsonb;
  v_tools_trend jsonb := '[]'::jsonb;
begin
  if not (
    public.is_super_admin()
    or (public.is_admin() and public.has_admin_permission('dashboard:read'))
    or (public.is_admin() and public.has_admin_permission('ver_resumen'))
  ) then
    raise exception 'No autorizado';
  end if;

  -- Usuarios (agregado)
  select
    count(*)::int,
    count(*) filter (where coalesce(is_active, true) is true)::int,
    count(*) filter (where created_at >= v_month_start)::int
  into v_users, v_users_active, v_users_month
  from public.profiles;

  -- Expedientes (agregado; finalizados = venta/cerrado/procesado)
  select
    count(*)::int,
    count(*) filter (
      where status::text in ('venta', 'cerrado', 'procesado')
    )::int,
    count(*) filter (where created_at >= v_month_start)::int,
    count(*) filter (where created_at::date >= v_day30)::int
  into v_prospects, v_prospects_closed, v_prospects_month, v_prospects_30
  from public.prospects;

  -- Ventas (excluye canceladas)
  select count(*)::int, coalesce(sum(vol), 0)
  into v_sales, v_total_vol
  from public.sales
  where coalesce(status::text, '') <> 'cancelada';

  select count(*)::int, coalesce(sum(vol), 0)
  into v_month_sales, v_month_vol
  from public.sales
  where sale_date >= v_month_start
    and coalesce(status::text, '') <> 'cancelada';

  select count(*)::int, coalesce(sum(vol), 0)
  into v_prev_sales, v_prev_vol
  from public.sales
  where sale_date >= v_prev_month_start
    and sale_date < v_month_start
    and coalesce(status::text, '') <> 'cancelada';

  select count(*)::int, coalesce(sum(vol), 0)
  into v_year_sales, v_year_vol
  from public.sales
  where sale_date >= v_year_start
    and coalesce(status::text, '') <> 'cancelada';

  -- Survey / tools (agregado, sin nombres)
  select
    count(*)::int,
    count(*) filter (where tool = 'survey'::public.tool_type)::int,
    count(*) filter (
      where tool = 'survey'::public.tool_type and prospect_id is not null
    )::int
  into v_tool_saves, v_survey_total, v_survey_linked
  from public.tool_calculations;

  -- Membresías vigentes (activo / en prueba) — 1 por usuario si hay varias
  begin
    select count(distinct usuario_id)::int into v_memberships
    from public.membresias
    where estado in ('activa', 'en_prueba');
  exception
    when undefined_table then
      v_memberships := 0;
  end;

  -- Tendencia comercial 6 meses
  with months as (
    select to_char(d, 'YYYY-MM') as month_key, d
    from generate_series(
      date_trunc('month', v_now) - interval '5 months',
      date_trunc('month', v_now),
      interval '1 month'
    ) as d
  ),
  agg as (
    select
      to_char(s.sale_date, 'YYYY-MM') as month_key,
      count(*)::int as sales,
      coalesce(sum(s.vol), 0) as volume
    from public.sales s
    where s.sale_date >= (date_trunc('month', v_now) - interval '5 months')::date
      and coalesce(s.status::text, '') <> 'cancelada'
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', m.month_key,
      'sales', coalesce(a.sales, 0),
      'volume', coalesce(a.volume, 0)
    ) order by m.d
  ), '[]'::jsonb)
  into v_sales_trend
  from months m
  left join agg a on a.month_key = m.month_key;

  -- Tendencia de expedientes 6 meses
  with months as (
    select to_char(d, 'YYYY-MM') as month_key, d
    from generate_series(
      date_trunc('month', v_now) - interval '5 months',
      date_trunc('month', v_now),
      interval '1 month'
    ) as d
  ),
  agg as (
    select
      to_char(p.created_at, 'YYYY-MM') as month_key,
      count(*)::int as prospects,
      count(*) filter (
        where p.status::text in ('venta', 'cerrado', 'procesado')
      )::int as closed
    from public.prospects p
    where p.created_at >= (date_trunc('month', v_now) - interval '5 months')
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', m.month_key,
      'prospects', coalesce(a.prospects, 0),
      'closed', coalesce(a.closed, 0)
    ) order by m.d
  ), '[]'::jsonb)
  into v_prospects_trend
  from months m
  left join agg a on a.month_key = m.month_key;

  -- Uso de herramientas (conteos agregados)
  with tools as (
    select unnest(array[
      'survey'::public.tool_type,
      'vacaciones'::public.tool_type,
      'worksheet'::public.tool_type
    ]) as tool
  ),
  agg as (
    select
      tc.tool,
      count(*)::int as saves,
      count(*) filter (where tc.prospect_id is null)::int as libre,
      count(*) filter (where tc.prospect_id is not null)::int as linked
    from public.tool_calculations tc
    group by tc.tool
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'tool', t.tool::text,
      'saves', coalesce(a.saves, 0),
      'libre', coalesce(a.libre, 0),
      'linked', coalesce(a.linked, 0)
    ) order by t.tool::text
  ), '[]'::jsonb)
  into v_tools_by_tool
  from tools t
  left join agg a on a.tool = t.tool;

  -- Tendencia herramientas 6 meses
  with months as (
    select to_char(d, 'YYYY-MM') as month_key, d
    from generate_series(
      date_trunc('month', v_now) - interval '5 months',
      date_trunc('month', v_now),
      interval '1 month'
    ) as d
  ),
  agg as (
    select
      to_char(tc.updated_at, 'YYYY-MM') as month_key,
      count(*) filter (where tc.tool = 'survey'::public.tool_type)::int as survey,
      count(*) filter (where tc.tool = 'vacaciones'::public.tool_type)::int as vacaciones,
      count(*) filter (where tc.tool = 'worksheet'::public.tool_type)::int as worksheet
    from public.tool_calculations tc
    where tc.updated_at >= (date_trunc('month', v_now) - interval '5 months')
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', m.month_key,
      'survey', coalesce(a.survey, 0),
      'vacaciones', coalesce(a.vacaciones, 0),
      'worksheet', coalesce(a.worksheet, 0)
    ) order by m.d
  ), '[]'::jsonb)
  into v_tools_trend
  from months m
  left join agg a on a.month_key = m.month_key;

  return jsonb_build_object(
    'usersCount', v_users,
    'usersActive', v_users_active,
    'usersCreatedMonth', v_users_month,
    'prospectsCount', v_prospects,
    'prospectsClosed', v_prospects_closed,
    'prospectsMonth', v_prospects_month,
    'prospectsLast30Days', v_prospects_30,
    'salesCount', v_sales,
    'totalVolume', v_total_vol,
    'monthSalesCount', v_month_sales,
    'monthVolume', v_month_vol,
    'prevMonthSalesCount', v_prev_sales,
    'prevMonthVolume', v_prev_vol,
    'yearSalesCount', v_year_sales,
    'yearVolume', v_year_vol,
    'avgVolumePerSale', case when v_sales > 0 then round(v_total_vol / v_sales, 2) else 0 end,
    'conversionRate', case when v_prospects > 0 then round((v_sales::numeric / v_prospects) * 100, 1) else 0 end,
    'toolSavesTotal', v_tool_saves,
    'surveyTotal', v_survey_total,
    'surveyLinked', v_survey_linked,
    'membershipsActive', v_memberships,
    'salesTrend', v_sales_trend,
    'prospectsTrend', v_prospects_trend,
    'toolsByTool', v_tools_by_tool,
    'toolsTrend', v_tools_trend,
    -- Compat: sin rankings individuales
    'topSellers', '[]'::jsonb,
    'recentSales', '[]'::jsonb,
    'generatedAt', v_now
  );
end;
$$;

grant execute on function public.admin_platform_overview() to authenticated;
