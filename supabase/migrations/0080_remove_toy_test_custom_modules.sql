-- 0080 — Eliminar módulos custom de prueba (Toy Verificación)
-- Eran QA de módulos custom por tenant; no pertenecen a ningún catálogo productivo.

delete from public.flags
where clave like 'toy.%'
   or (
     tipo = 'custom'
     and nombre_visible ilike '%Toy Verificación%'
   );
