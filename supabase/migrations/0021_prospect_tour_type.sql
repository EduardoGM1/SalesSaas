-- ============================================================
-- Tipo de tour en expedientes (usado en Metas y Expedientes)
-- Sin estas columnas, PUT /api/v1/sync falla al subir clientes
-- y bloquea metas, ventas y agenda en el reconcile completo.
-- ============================================================

alter table public.prospects
  add column if not exists tipo_tour text,
  add column if not exists tour_cuantificable boolean;
