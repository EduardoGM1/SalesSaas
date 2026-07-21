-- =============================================================================
-- 0049 — Sesiones de plataforma + Overview de uso (sin comercial)
-- =============================================================================

create table if not exists public.platform_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  last_activity_at timestamptz not null default timezone('utc', now())
);

create index if not exists platform_sessions_user_started_idx
  on public.platform_sessions (user_id, started_at desc);

create index if not exists platform_sessions_open_idx
  on public.platform_sessions (user_id)
  where ended_at is null;

create index if not exists platform_sessions_started_idx
  on public.platform_sessions (started_at);

alter table public.platform_sessions enable row level security;

drop policy if exists "platform_sessions_own" on public.platform_sessions;
create policy "platform_sessions_own" on public.platform_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.platform_sessions to authenticated;
grant all on public.platform_sessions to service_role;

-- Abrir sesión (login). Cierra huérfanas > 24h del mismo usuario.
create or replace function public.platform_session_start(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    if not public.is_super_admin() then
      raise exception 'No autorizado';
    end if;
  end if;

  update public.platform_sessions
  set ended_at = timezone('utc', now()),
      last_activity_at = timezone('utc', now())
  where user_id = p_user_id
    and ended_at is null
    and started_at < timezone('utc', now()) - interval '24 hours';

  insert into public.platform_sessions (user_id)
  values (p_user_id)
  returning id into v_id;

  update public.profiles
  set last_seen_at = timezone('utc', now())
  where id = p_user_id;

  return v_id;
end;
$$;

grant execute on function public.platform_session_start(uuid) to authenticated;

-- Cerrar sesión abierta (logout / offline).
create or replace function public.platform_session_end(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    if not public.is_super_admin() then
      raise exception 'No autorizado';
    end if;
  end if;

  update public.platform_sessions
  set ended_at = timezone('utc', now()),
      last_activity_at = timezone('utc', now())
  where user_id = p_user_id
    and ended_at is null;

  update public.profiles
  set last_seen_at = timezone('utc', now())
  where id = p_user_id;
end;
$$;

grant execute on function public.platform_session_end(uuid) to authenticated;

-- Overview orientado a uso / crecimiento (sin rankings ni tendencia comercial).
create or replace function public.admin_platform_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_today date := v_now::date;
  v_week_start date := (v_now - interval '6 days')::date;
  v_month_start date := date_trunc('month', v_now)::date;
  v_prev_month_start date := (date_trunc('month', v_now) - interval '1 month')::date;

  v_users int := 0;
  v_users_active_acct int := 0;
  v_users_inactive_acct int := 0;
  v_users_today int := 0;
  v_users_week int := 0;
  v_users_month int := 0;
  v_users_prev_month int := 0;

  v_active_today int := 0;
  v_active_week int := 0;
  v_active_month int := 0;

  v_sessions_completed int := 0;
  v_sessions_avg_min numeric := 0;
  v_sessions_total_hours numeric := 0;
  v_sessions_per_user numeric := 0;

  v_tool_saves int := 0;
  v_survey_total int := 0;
  v_survey_linked int := 0;
  v_memberships int := 0;
  v_prospects int := 0;
  v_prospects_month int := 0;

  v_users_trend jsonb := '[]'::jsonb;
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

  select
    count(*)::int,
    count(*) filter (where coalesce(is_active, true) is true)::int,
    count(*) filter (where coalesce(is_active, true) is false)::int,
    count(*) filter (where created_at::date = v_today)::int,
    count(*) filter (where created_at::date >= v_week_start)::int,
    count(*) filter (where created_at >= v_month_start)::int,
    count(*) filter (
      where created_at >= v_prev_month_start and created_at < v_month_start
    )::int
  into
    v_users, v_users_active_acct, v_users_inactive_acct,
    v_users_today, v_users_week, v_users_month, v_users_prev_month
  from public.profiles;

  -- Actividad: last_seen_at O sesión abierta/recién iniciada O guardado de tool
  with activity as (
    select p.id,
      greatest(
        coalesce(p.last_seen_at, 'epoch'::timestamptz),
        coalesce((
          select max(s.started_at) from public.platform_sessions s where s.user_id = p.id
        ), 'epoch'::timestamptz),
        coalesce((
          select max(tc.updated_at) from public.tool_calculations tc where tc.user_id = p.id
        ), 'epoch'::timestamptz)
      ) as last_act
    from public.profiles p
    where coalesce(p.is_active, true) is true
  )
  select
    count(*) filter (where last_act::date = v_today)::int,
    count(*) filter (where last_act::date >= v_week_start)::int,
    count(*) filter (where last_act >= v_month_start)::int
  into v_active_today, v_active_week, v_active_month
  from activity
  where last_act > 'epoch'::timestamptz;

  -- Sesiones completadas (últimos 30 días)
  select
    count(*)::int,
    coalesce(round(avg(extract(epoch from (ended_at - started_at)) / 60.0)::numeric, 1), 0),
    coalesce(round(sum(extract(epoch from (ended_at - started_at)) / 3600.0)::numeric, 1), 0)
  into v_sessions_completed, v_sessions_avg_min, v_sessions_total_hours
  from public.platform_sessions
  where ended_at is not null
    and started_at >= v_now - interval '30 days'
    and ended_at > started_at
    and extract(epoch from (ended_at - started_at)) between 30 and 86400; -- 30s–24h

  if v_users_active_acct > 0 then
    v_sessions_per_user := round(
      (
        select count(*)::numeric
        from public.platform_sessions
        where started_at >= v_now - interval '30 days'
      ) / v_users_active_acct
    , 2);
  end if;

  select count(*)::int, count(*) filter (where created_at >= v_month_start)::int
  into v_prospects, v_prospects_month
  from public.prospects;

  select
    count(*)::int,
    count(*) filter (where tool = 'survey'::public.tool_type)::int,
    count(*) filter (where tool = 'survey'::public.tool_type and prospect_id is not null)::int
  into v_tool_saves, v_survey_total, v_survey_linked
  from public.tool_calculations;

  begin
    select count(distinct usuario_id)::int into v_memberships
    from public.membresias
    where estado in ('activa', 'en_prueba');
  exception when undefined_table then
    v_memberships := 0;
  end;

  -- Tendencia altas de usuarios (6 meses)
  with months as (
    select to_char(d, 'YYYY-MM') as month_key, d
    from generate_series(
      date_trunc('month', v_now) - interval '5 months',
      date_trunc('month', v_now),
      interval '1 month'
    ) as d
  ),
  agg as (
    select to_char(p.created_at, 'YYYY-MM') as month_key, count(*)::int as users
    from public.profiles p
    where p.created_at >= date_trunc('month', v_now) - interval '5 months'
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('month', m.month_key, 'users', coalesce(a.users, 0))
    order by m.d
  ), '[]'::jsonb)
  into v_users_trend
  from months m
  left join agg a on a.month_key = m.month_key;

  with tools as (
    select unnest(array[
      'survey'::public.tool_type,
      'vacaciones'::public.tool_type,
      'worksheet'::public.tool_type
    ]) as tool
  ),
  agg as (
    select tc.tool,
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
    where tc.updated_at >= date_trunc('month', v_now) - interval '5 months'
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
    'usersActiveAccounts', v_users_active_acct,
    'usersInactiveAccounts', v_users_inactive_acct,
    'usersCreatedToday', v_users_today,
    'usersCreatedWeek', v_users_week,
    'usersCreatedMonth', v_users_month,
    'usersCreatedPrevMonth', v_users_prev_month,
    'usersActiveToday', v_active_today,
    'usersActiveWeek', v_active_week,
    'usersActiveMonth', v_active_month,
    'pctActiveAccounts', case when v_users > 0 then round((v_users_active_acct::numeric / v_users) * 100, 1) else 0 end,
    'pctActiveWeek', case when v_users_active_acct > 0 then round((v_active_week::numeric / v_users_active_acct) * 100, 1) else 0 end,
    'sessionsCompleted30d', v_sessions_completed,
    'avgSessionMinutes', v_sessions_avg_min,
    'totalSessionHours30d', v_sessions_total_hours,
    'avgSessionsPerUser30d', v_sessions_per_user,
    'prospectsCount', v_prospects,
    'prospectsMonth', v_prospects_month,
    'toolSavesTotal', v_tool_saves,
    'surveyTotal', v_survey_total,
    'surveyLinked', v_survey_linked,
    'membershipsActive', v_memberships,
    'usersTrend', v_users_trend,
    'toolsByTool', v_tools_by_tool,
    'toolsTrend', v_tools_trend,
    'topSellers', '[]'::jsonb,
    'recentSales', '[]'::jsonb,
    'salesTrend', '[]'::jsonb,
    'generatedAt', v_now
  );
end;
$$;

grant execute on function public.admin_platform_overview() to authenticated;
