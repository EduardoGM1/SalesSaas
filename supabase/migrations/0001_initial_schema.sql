-- ============================================================
-- Sales Timeshare — Esquema inicial (Supabase / Postgres)
-- Modelo per-vendedor con RLS. Autenticación: Supabase Auth.
-- Decisiones: datos de calculadoras en jsonb; sin equipos por ahora
-- (el enum incluye 'gerente'/'admin' para no migrar en el futuro).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type public.user_role        as enum ('vendedor', 'gerente', 'admin');
create type public.prospect_status  as enum ('venta', 'bback', 'procesable', 'no-procesable', 'perdido', 'cerrado', 'procesado');
create type public.entry_type       as enum ('venta', 'nota', 'follow', 'descanso');
create type public.tool_type        as enum ('survey', 'vacaciones', 'worksheet');

-- ---------- Helper: updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- profiles (1:1 con auth.users)
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        public.user_role not null default 'vendedor',
  phone       text,
  avatar_url  text,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crear profile automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- prospects (expedientes / clientes)
-- ============================================================
create table public.prospects (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  prospect_code   text not null,
  name            text,
  name1           text,
  name2           text,
  occupation1     text,
  occupation2     text,
  city            text,
  country         text,
  phone           text,
  email           text,
  contract        text,
  status          public.prospect_status,
  tour_date       date,
  process_date    date,
  process_amount  numeric(12,2) default 0,
  note            text,
  completed       boolean not null default false,
  anonymized_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, prospect_code)
);

create index prospects_user_idx        on public.prospects (user_id);
create index prospects_user_status_idx on public.prospects (user_id, status);
create index prospects_user_tour_idx   on public.prospects (user_id, tour_date desc);

create trigger trg_prospects_updated
  before update on public.prospects
  for each row execute function public.set_updated_at();

-- ============================================================
-- sales (ventas por expediente)
-- ============================================================
create table public.sales (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  prospect_id   uuid not null references public.prospects(id) on delete cascade,
  sale_date     date not null,
  vol           numeric(12,2) not null default 0,
  tours         int not null default 1,
  contract      text,
  status        public.prospect_status,
  process_date  date,
  note          text,
  created_at    timestamptz not null default now()
);

create index sales_user_idx      on public.sales (user_id);
create index sales_prospect_idx  on public.sales (prospect_id);
create index sales_user_date_idx on public.sales (user_id, sale_date);

-- ============================================================
-- calendar_entries (Agenda)
-- ============================================================
create table public.calendar_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  prospect_id  uuid references public.prospects(id) on delete set null,
  sale_id      uuid references public.sales(id) on delete set null,
  type         public.entry_type not null,
  entry_date   date not null,
  note         text,
  vol          numeric(12,2),
  tours        int,
  contract     text,
  source       text,
  created_at   timestamptz not null default now()
);

create index cal_user_date_idx on public.calendar_entries (user_id, entry_date);
create index cal_prospect_idx  on public.calendar_entries (prospect_id);

-- ============================================================
-- goals (metas mensuales)
-- ============================================================
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  year        int not null,
  month       int not null check (month between 0 and 11),
  vol         numeric(12,2) default 0,
  tours       int default 0,
  ventas      int default 0,
  dias        int default 0,
  descansos   int default 0,
  updated_at  timestamptz not null default now(),
  unique (user_id, year, month)
);

create trigger trg_goals_updated
  before update on public.goals
  for each row execute function public.set_updated_at();

-- ============================================================
-- activities (bitácora: de expediente o personal si prospect_id is null)
-- ============================================================
create table public.activities (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  prospect_id    uuid references public.prospects(id) on delete cascade,
  sale_id        uuid references public.sales(id) on delete set null,
  type           text not null,
  title          text,
  note           text,
  activity_date  date,
  source         text,
  vol            numeric(12,2),
  tours          int,
  contract       text,
  created_at     timestamptz not null default now()
);

create index activities_user_idx     on public.activities (user_id);
create index activities_prospect_idx on public.activities (prospect_id);

-- ============================================================
-- tool_calculations (datos de Survey/Vacaciones/Worksheet en jsonb)
-- prospect_id null = calculadora "libre" (una por usuario/herramienta)
-- ============================================================
create table public.tool_calculations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  prospect_id  uuid references public.prospects(id) on delete cascade,
  tool         public.tool_type not null,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

create unique index tool_calc_prospect_uniq
  on public.tool_calculations (user_id, prospect_id, tool)
  where prospect_id is not null;

create unique index tool_calc_libre_uniq
  on public.tool_calculations (user_id, tool)
  where prospect_id is null;

create trigger trg_tool_calc_updated
  before update on public.tool_calculations
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security (modelo per-vendedor)
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.prospects         enable row level security;
alter table public.sales             enable row level security;
alter table public.calendar_entries  enable row level security;
alter table public.goals             enable row level security;
alter table public.activities        enable row level security;
alter table public.tool_calculations enable row level security;

-- profiles: solo el dueño
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- patrón "dueño" para el resto de tablas
create policy "prospects_all_own" on public.prospects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sales_all_own" on public.sales
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cal_all_own" on public.calendar_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_all_own" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activities_all_own" on public.activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tool_calc_all_own" on public.tool_calculations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- NOTA: las políticas de lectura global para 'admin' se agregarán en la
-- fase administrativa (rol admin + screens de sistema).

-- ============================================================
-- GRANTs de roles (RLS sigue protegiendo las filas)
-- ============================================================
grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables    in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
grant all privileges on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
