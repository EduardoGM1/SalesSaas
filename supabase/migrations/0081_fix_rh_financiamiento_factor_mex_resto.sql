-- Corrige factor_mensual mexicano/resto: el seed importó la columna F/I del Excel
-- (factor ÷ 25) en lugar de E/H (factor real R/Ap). Argentino ya usaba la columna correcta.
-- Condición factor < 0.015 evita aplicar dos veces (factores correctos suelen ser ≥ ~0.02).
UPDATE rh_financiamiento
SET factor_mensual = factor_mensual * 25
WHERE nacionalidad IN ('mexicano', 'resto')
  AND factor_mensual > 0
  AND factor_mensual < 0.015;
