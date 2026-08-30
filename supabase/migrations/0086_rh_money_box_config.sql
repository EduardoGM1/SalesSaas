-- ============================================================
-- 0086 — Config Money Box Royal Holiday por empresa
-- Patrón rh_ops_config: 1 fila/empresa, planes + restricciones
-- ============================================================

create table if not exists public.rh_money_box_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade unique,
  plans jsonb not null default '{
    "wo1m": "60", "wo1r": "12.99",
    "wo2m": "48", "wo2r": "8.90",
    "wo3m": "12", "wo3r": "0"
  }'::jsonb,
  restrictions jsonb not null default '{
    "minDownPct": "30",
    "maxDownPct": "50",
    "fc": "0",
    "ff": "0",
    "maxSale": "150,000.00",
    "roundStep": "0.01"
  }'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.rh_money_box_config enable row level security;

comment on table public.rh_money_box_config is 'Planes PMT y restricciones Money Box RH por empresa';

-- RLS (mismo criterio que rh_ops_config — 0078)
drop policy if exists rh_money_box_config_select on public.rh_money_box_config;
drop policy if exists rh_money_box_config_write on public.rh_money_box_config;
create policy rh_money_box_config_select on public.rh_money_box_config
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_money_box_config_write on public.rh_money_box_config
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));
