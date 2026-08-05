-- ============================================================
-- 0067 — Módulos custom por tenant (sobre flags existentes)
-- - flags.tipo: estandar | custom
-- - flags.empresa_id: NULL = catálogo global; set = exclusivo tenant
-- - flags.schema_ui: esquema declarativo de campos (JSON)
-- - modulo_custom_datos: metafields por entidad (patrón Shopify)
-- ============================================================

alter table public.flags
  add column if not exists tipo text not null default 'estandar'
    check (tipo in ('estandar', 'custom')),
  add column if not exists empresa_id uuid references public.empresas(id) on delete cascade,
  add column if not exists schema_ui jsonb not null default '{}'::jsonb,
  add column if not exists punto_extension text
    check (
      punto_extension is null
      or punto_extension in (
        'expediente.tab',
        'dashboard.sala.bloque',
        'clientes.columna'
      )
    );

comment on column public.flags.tipo is 'estandar = catálogo Saletse; custom = módulo de una empresa';
comment on column public.flags.empresa_id is 'NULL para estándar; obligatorio para custom';
comment on column public.flags.schema_ui is 'Esquema declarativo de campos para el motor de renderizado genérico';
comment on column public.flags.punto_extension is 'Hook UI permitido; null = no renderiza superficie propia';

-- Unicidad: globales por clave; custom por (empresa_id, clave)
-- La columna `clave` se creó como UNIQUE inline en 0051.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.flags'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%clave%'
  ) then
    execute (
      select 'alter table public.flags drop constraint ' || quote_ident(conname)
      from pg_constraint
      where conrelid = 'public.flags'::regclass and contype = 'u'
        and pg_get_constraintdef(oid) ilike '%clave%'
      limit 1
    );
  end if;
end $$;

create unique index if not exists flags_clave_global_uidx
  on public.flags (clave)
  where empresa_id is null;

create unique index if not exists flags_clave_empresa_uidx
  on public.flags (empresa_id, clave)
  where empresa_id is not null;

create index if not exists flags_empresa_idx on public.flags (empresa_id)
  where empresa_id is not null;

-- Datos genéricos del módulo (sin tablas por cliente)
create table if not exists public.modulo_custom_datos (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references public.flags(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  entidad_relacionada_id uuid,
  datos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modulo_id, empresa_id, entidad_relacionada_id)
);

create index if not exists modulo_custom_datos_gin
  on public.modulo_custom_datos using gin (datos);

create index if not exists modulo_custom_datos_empresa_idx
  on public.modulo_custom_datos (empresa_id, modulo_id);

create index if not exists modulo_custom_datos_entidad_idx
  on public.modulo_custom_datos (entidad_relacionada_id)
  where entidad_relacionada_id is not null;

alter table public.modulo_custom_datos enable row level security;

drop policy if exists "modulo_custom_datos_select_authenticated" on public.modulo_custom_datos;
create policy "modulo_custom_datos_select_authenticated"
  on public.modulo_custom_datos for select to authenticated
  using (
    exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = modulo_custom_datos.empresa_id
        and em.usuario_id = auth.uid()
        and em.estado = 'activo'
    )
    or public.is_super_admin()
  );

drop policy if exists "modulo_custom_datos_write_empresa_admin" on public.modulo_custom_datos;
create policy "modulo_custom_datos_write_empresa_admin"
  on public.modulo_custom_datos for all to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = modulo_custom_datos.empresa_id
        and em.usuario_id = auth.uid()
        and em.es_admin = true
        and em.estado = 'activo'
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from public.empresa_miembros em
      where em.empresa_id = modulo_custom_datos.empresa_id
        and em.usuario_id = auth.uid()
        and em.es_admin = true
        and em.estado = 'activo'
    )
  );

comment on table public.modulo_custom_datos is
  'Metafields JSONB por módulo custom + entidad (expediente, etc.). Sin migraciones por cliente.';
