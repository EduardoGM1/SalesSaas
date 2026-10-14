# Migración — vacaciones (`vacaciones`)

**Rama:** `arquitectura/modulo-vacaciones`  
**Alcance:** módulo 4 (web).  
**API:** no tocada (cálculo y UI viven en web; persistencia vía tool_calculations / sync compartido).

## Estructura nueva

```
apps/web/src/modulos/vacaciones/
  dominio/   calculo-vacaciones.ts (+ tests)
```

UI (`components/calculators/vacaciones-page.jsx`, chart) **no** se movió: solo actualizó imports.

## Mapeo archivos (viejo → nuevo)

| Antes | Después |
|-------|---------|
| `apps/web/src/lib/calculations/vacaciones.ts` | `modulos/vacaciones/dominio/calculo-vacaciones.ts` |

Adaptador legacy `lib/calculations/vacaciones.ts` y aliases EN (`computeVacaciones`, `buildVacacionesCumulativeSeries`): **eliminados** (sin consumidores externos; UI y ventas ya usan nombres ES).

## Identificadores internos

| Antes | Después |
|-------|---------|
| `computeVacaciones` | `calcularVacaciones` |
| `buildVacacionesCumulativeSeries` | `construirSerieAcumuladaVacaciones` |

## Contratos **no** renombrados

- Tool slug `vacaciones` en `tool_calculations.tool` / `TOOLS` / rutas `/clients/:id/vacaciones`, `/tools/vacaciones`
- Claves JSON `data`: `vv`, `vc`, `va`, `vi` (+ moneda: `capture_currency`, `currency_meta`)
- Resultado interno de cálculo: `ga`, `cf`, `ts`, `tc`, `viajes`, `costo`, `anios`, `inf`, `futAno`
- Permisos / flags: `herramientas:vacaciones`, `proyeccion_vacaciones`
- Fixture Fase 1: `scripts/architecture/fixtures/tool-data/vacaciones.json`

## Dependencia cruzada — ventas

`apps/web/src/components/sales/sale-detail-modal.jsx` (módulo de **ventas**, aún no migrado) importa `calcularVacaciones` desde `modulos/vacaciones/dominio/calculo-vacaciones`.  
Al migrar **Ventas**, debe consumir una **interfaz pública** del módulo vacaciones (p. ej. `modulos/vacaciones/index` o `servicios/`), no el path interno de `dominio/`.

## Deuda — sync / outbox / persistencia

**No migrado** (módulo sync / tools futuro):

- `cloud-persist`, `tool-calculations-api`, `db-store` / buckets de tools
- `useToolSession` / `saveBucket` / outbox
- `bodyToToolUpsert` / `sanitizeTool` en shared validators
- Mappers `TOOLS` que incluyen `"vacaciones"`

**Smoke QA:** el expediente se crea offline (403 cloud en workspace personal). Antes de guardar la tool, `qa-geo-fx-ephemeral.py seed-prospect` inserta la misma fila en `prospects` para satisfacer `tool_calculations_prospect_id_fkey`. No es migración de sync; es andamiaje de prueba.

## Paso B / A

1. Caracterización (`calculo-vacaciones.test.mjs`) + `check-tool-contracts` (vacaciones.json).
2. Extracción con nombres ES; `git mv` a `modulos/vacaciones/dominio/`.
3. Imports en `vacaciones-page`, `sale-detail-modal` (nombres ES).

## Reversión

```bash
git revert <sha-deploy>
# o restaurar backup /opt/saletse-backups/web-dist/pre-<stamp>
```

## Deploy

Solo **web** (sin reload API). Backup `web-dist/pre-<stamp>`, build SHA limpio, smoke UI QA + purga (`tool_calculations=0`).
