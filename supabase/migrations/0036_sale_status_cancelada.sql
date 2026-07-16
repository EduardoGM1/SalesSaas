-- Estado de venta "cancelada": se excluye de totales (no saldo negativo).
-- Visible en Agenda en rojo (lógica de UI); el enum debe aceptarlo en sales/calendar.

alter type public.prospect_status add value if not exists 'cancelada';

-- Agregaciones Super Admin: solo ventas no canceladas.
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

  select count(*)::int, coalesce(sum(vol), 0)
  into v_sales, v_total_vol
  from public.sales
  where coalesce(status::text, '') <> 'cancelada';

  select count(*)::int, coalesce(sum(vol), 0)
  into v_month_sales, v_month_vol
  from public.sales
  where to_char(sale_date, 'YYYY-MM') = v_month
    and coalesce(status::text, '') <> 'cancelada';

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
      and coalesce(s.status::text, '') <> 'cancelada'
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
    where coalesce(s.status::text, '') <> 'cancelada'
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
    where coalesce(sx.status::text, '') <> 'cancelada'
    group by sx.user_id
  ) sa on sa.seller_id = p.id;
end;
$$;
