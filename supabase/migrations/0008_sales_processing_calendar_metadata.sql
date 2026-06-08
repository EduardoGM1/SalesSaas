-- ============================================================
-- Sales Timeshare — metadatos para ventas pendientes y Agenda
-- 1) sales: estado operativo de procesamiento
-- 2) calendar_entries: metadatos de reflejos y recordatorios
-- ============================================================

alter table public.sales
  add column if not exists processing text not null default 'procesable',
  add column if not exists add_processing_followup boolean not null default false;

alter table public.calendar_entries
  add column if not exists status public.prospect_status,
  add column if not exists processing text,
  add column if not exists process_date date,
  add column if not exists completed boolean not null default false,
  add column if not exists kind text,
  add column if not exists client_name text;

create index if not exists sales_user_processing_idx
  on public.sales (user_id, processing);

create index if not exists cal_user_completed_idx
  on public.calendar_entries (user_id, completed);
