-- Fix RPCs admin: user_id ambiguo y comparación tool_type = text

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

  -- Evitar ambigüedad con columnas OUT (user_id) vs columnas de tablas
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
