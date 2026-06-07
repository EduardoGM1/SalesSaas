-- ============================================================
-- Ajustes para la sincronización cliente <-> nube (Opción A)
-- 1) prospects.quick_expedient (flag de expediente rápido)
-- 2) tool_calculations: unique (user_id, prospect_id, tool) con
--    NULLS NOT DISTINCT, para poder hacer UPSERT por esas columnas
--    (las calculadoras "libre" tienen prospect_id NULL).
-- ============================================================

-- 1) Flag de expediente rápido en prospects
alter table public.prospects
  add column if not exists quick_expedient boolean not null default false;

-- 2) Reemplazar índices únicos parciales por una constraint única
--    que trate los NULL como iguales (Postgres 15+).
drop index if exists public.tool_calc_prospect_uniq;
drop index if exists public.tool_calc_libre_uniq;

alter table public.tool_calculations
  drop constraint if exists tool_calc_uniq;

alter table public.tool_calculations
  add constraint tool_calc_uniq
  unique nulls not distinct (user_id, prospect_id, tool);
