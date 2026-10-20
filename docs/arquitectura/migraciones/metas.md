# Migración — goals / metas (`metas`)

**Rama:** `arquitectura/modulo-metas`  
**Alcance:** módulo 3 (API + web). Sin merge/deploy hasta OK.  
**Orden:** 3 Goals → 4 Vacaciones → 5 Reminders/notifications (actualizado en auditoría §8 y `decisiones.md`).

## Estructura nueva

```
apps/api/src/modulos/metas/
  dominio/         periodo-meta.js (+ tests)
  servicios/       metas-servicio.js
  repositorio/     metas-repositorio.js
  controladores/   metas-controlador.js
  rutas/           metas.js

apps/web/src/modulos/metas/
  dominio/         kpis-metas.ts, semanas-tablero.ts (+ tests)
```

UI (`components/goals/*`) **no** se movió: solo actualizó imports.  
`lib/calculations/calendar.ts` reexporta adaptadores legacy hacia el dominio (ver deuda abajo).

## Mapeo archivos (viejo → nuevo)

| Antes | Después |
|-------|---------|
| `apps/api/src/services/goals-service.js` | `modulos/metas/servicios/metas-servicio.js` |
| `apps/api/src/repositories/goals-repository.js` | `repositorio/metas-repositorio.js` |
| `apps/api/src/controllers/goals-controller.js` | `controladores/metas-controlador.js` |
| `apps/api/src/routes/goals.js` | `rutas/metas.js` |
| (inline year/month) | `dominio/periodo-meta.js` (`validarPeriodoMeta`) |
| `apps/web/.../calendar.ts` (`normalizeGoal`, `computeMetasKpis`) | `dominio/kpis-metas.ts` |
| `calendar.ts` (`getDashboardWeeks`, `workingDaysRemaining`) | `dominio/semanas-tablero.ts` |
| (inline descansos) | `lib/calculations/calendar-descansos.js` (compartido agenda↔metas) |

Montaje: `routes/v1.js` importa `modulos/metas/rutas/metas.js` (paths HTTP sin cambio).

## Identificadores internos

| Antes | Después |
|-------|---------|
| (inline validación DELETE) | `validarPeriodoMeta` |
| `normalizeGoal` | `normalizarMeta` (+ alias `normalizeGoal`) |
| `computeMetasKpis` | `calcularKpisMetas` (+ alias) |
| `getDashboardWeeks` | `obtenerSemanasTablero` (+ alias) |
| `workingDaysRemaining` | `diasLaborablesRestantes` (+ alias) |

Servicio/repositorio ya usaban nombres ES (`listarMetas`, `guardarMeta`, …).

## Contratos **no** renombrados

- Tabla `goals` y columnas: `vol`, `tours`, `ventas`, `dias`, `descansos`, `year`, `month`, `user_id`, `workspace_id`
- HTTP: `GET`/`PUT`/`DELETE` `/api/v1/goals`
- `bodyToGoalUpsert` en `@salesapp/shared/api/validators.js`
- `SYNC_SELECT.goals`, mappers `db.goals` / `parseGoalKey`
- Permisos `metas:ver_editar_propias`, rutas UI `/goals`, `/metas`
- Clave local `GoalMonth.desc` (mapea a `descansos` en BD)

## Deuda — adaptadores `calendar.ts` (cerrada en Tramo B agenda)

Resuelto en el Tramo B de agenda: `calendar-descansos` vive en
`apps/web/src/modulos/agenda/dominio/`; metas importa por la fachada
`@/modulos/agenda` (dirección **metas → agenda**). Se eliminaron
`lib/calculations/calendar.ts` y `lib/calculations/calendar-descansos.js`
(reexports huérfanos e `isCalendarSaleCountable` sin callers). Detalle:
[`agenda-inventario.md`](./agenda-inventario.md).

## Deuda — sync / outbox / mappers

**No migrado** (módulo sync futuro):

- `bodyToGoalUpsert` en `@salesapp/shared/api/validators.js`
- `SYNC_SELECT.goals` en `packages/shared/src/data/sync-columns.js`
- Mappers `db.goals` / `parseGoalKey` en `packages/shared/src/data/mappers.js` (y par web)
- `packages/shared/src/data/sync.js` (pull/upsert `goals`)
- `apps/web` `cloud-persist` (PUT `/goals`), `saveGoalMonth` en `db-store`, outbox / reconcile

## Paso B / A

1. Caracterización: `periodo-meta.test.mjs`, `metas-calculo.test.mjs`, `sync-goals-columns.test.mjs`.
2. Extracción pura + `git mv` API/web.
3. Imports en RH no aplica; consumidores: `goals-page`, `metas-page`, `dashboard-chart`, `v1.js`.

## Reversión

```bash
git checkout main
# o descartar rama arquitectura/modulo-metas
```

## Plan deploy (cuando OK) — toca API

1. SHA limpio en `main` (FF merge).
2. Backup: `cp -a /var/www/Saletse/apps/api /opt/saletse-backups/api/pre-<stamp>` y web-dist si también se despliega SPA.
3. Deploy API + **pm2 reload** (sin downtime largo; medir corte).
4. Medición de corte: bucle `curl -sf http://127.0.0.1:4000/health` (o público) — anotar primer y último fallo HTTP durante reload.
5. Smoke: health, `GET /api/v1/goals` auth, smoke UI QA efímera + purga (incl. `goals=0`).
6. Rollback: restaurar backup API + pm2 reload; restaurar web-dist si aplica.
