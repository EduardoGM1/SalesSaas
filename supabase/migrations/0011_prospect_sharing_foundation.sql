-- ============================================================
-- Fundación para compartir expedientes entre usuarios (futuro)
-- NO activo en MVP: tablas sin políticas RLS de producto aún.
-- ============================================================

create type public.share_permission as enum ('view', 'edit');

create table if not exists public.prospect_shares (
  id             uuid primary key default gen_random_uuid(),
  prospect_id    uuid not null references public.prospects(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  shared_with_id uuid not null references auth.users(id) on delete cascade,
  permission     public.share_permission not null default 'view',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (prospect_id, shared_with_id)
);

create index if not exists prospect_shares_shared_with_idx
  on public.prospect_shares (shared_with_id);

create index if not exists prospect_shares_owner_idx
  on public.prospect_shares (owner_id);

create trigger prospect_shares_set_updated_at
  before update on public.prospect_shares
  for each row execute function public.set_updated_at();

comment on table public.prospect_shares is
  'Reservado: compartir expedientes entre vendedores (MVP no expone UI).';

-- RLS y políticas se añadirán cuando exista el módulo de compartir.
