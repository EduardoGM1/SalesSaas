-- ============================================================
-- Las ventas deben persistir aunque el expediente se elimine.
-- prospect_id pasa a nullable con ON DELETE SET NULL.
-- prospect_name guarda snapshot del nombre al archivar.
-- ============================================================

alter table public.sales
  drop constraint if exists sales_prospect_id_fkey;

alter table public.sales
  alter column prospect_id drop not null;

alter table public.sales
  add constraint sales_prospect_id_fkey
  foreign key (prospect_id) references public.prospects(id) on delete set null;

alter table public.sales
  add column if not exists prospect_name text;

create index if not exists sales_user_orphan_idx
  on public.sales (user_id)
  where prospect_id is null;
