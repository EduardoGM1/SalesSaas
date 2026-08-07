-- ============================================================
-- 0077 — Flags herramientas RH + tablas ops + días descanso
-- ============================================================

-- Flags custom por empresa (semilla vía script; columnas ya existen en flags)
-- Tablas operativas Royal Holiday

create table if not exists public.rh_dias_descanso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  tipo text not null default 'descanso',
  notas text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, usuario_id, fecha)
);

create index if not exists rh_dias_descanso_ws_fecha_idx
  on public.rh_dias_descanso (workspace_id, fecha);

create table if not exists public.rh_ops_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade unique,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.rh_premanifiesto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fecha date not null,
  prospect_nombre text,
  prospect_id uuid,
  show_time time,
  notes text,
  status text not null default 'pendiente',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rh_premanifiesto_ws_fecha_idx
  on public.rh_premanifiesto (workspace_id, fecha);

create table if not exists public.rh_linea_asignacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fecha date not null,
  rep_id uuid references public.profiles(id) on delete set null,
  closer_id uuid references public.profiles(id) on delete set null,
  turno text,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists rh_linea_asignacion_ws_fecha_idx
  on public.rh_linea_asignacion (workspace_id, fecha);

create table if not exists public.rh_linea_rotacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fecha date not null,
  orden integer not null default 0,
  usuario_id uuid references public.profiles(id) on delete set null,
  rol text,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists rh_linea_rotacion_ws_fecha_idx
  on public.rh_linea_rotacion (workspace_id, fecha);

create table if not exists public.rh_okr (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  periodo text not null,
  clave text not null,
  meta numeric not null default 0,
  actual numeric not null default 0,
  unidad text not null default 'count',
  updated_at timestamptz not null default now(),
  unique (workspace_id, periodo, clave)
);

create table if not exists public.rh_propinas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  beneficiario_id uuid references public.profiles(id) on delete set null,
  beneficiario_nombre text,
  monto numeric not null default 0,
  fecha date not null default (current_date),
  notas text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rh_propinas_ws_fecha_idx
  on public.rh_propinas (workspace_id, fecha);

-- RLS mínima: service role / API usa service client; habilitar RLS deny-by-default para anon
alter table public.rh_dias_descanso enable row level security;
alter table public.rh_ops_config enable row level security;
alter table public.rh_premanifiesto enable row level security;
alter table public.rh_linea_asignacion enable row level security;
alter table public.rh_linea_rotacion enable row level security;
alter table public.rh_okr enable row level security;
alter table public.rh_propinas enable row level security;

comment on table public.rh_dias_descanso is 'Días de descanso por usuario/sala Royal Holiday';
comment on table public.rh_ops_config is 'Config JSON módulos ops RH por empresa';
comment on table public.rh_premanifiesto is 'Premanifiesto diario sala RH';
