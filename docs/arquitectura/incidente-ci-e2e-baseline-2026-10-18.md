# Incidente: CI E2E rojo en deploys Tramo B / Etapa 2 (2026-10-18)

## Qué se desplegó

| Paso | SHA | Ámbito | Backup | CI al momento del deploy |
|------|-----|--------|--------|---------------------------|
| 1 Tramo B | `503928f` | API | `/opt/saletse-backups/api/pre-20261017-235332` | Arquitectura verde; E2E aún en curso → se trató como no verificado |
| 2 Permiso PUT | `aab2714` | API + web | API `…/pre-20261018-000201`, web `…/web-dist/pre-20261018-000302` | Arquitectura verde; E2E en curso |

Producción quedó en `aab2714` (API + `build-id` web). Health OK. **No se revirtió** tras el diagnóstico.

## Qué se encontró

1. Job E2E `503928f` (run 39080714038): **18 failed** / 136 passed / 5 skipped.  
2. Bisect local (`CI=true`, worktree, mismos 6 specs): el **mismo conjunto de 18** falla ya en `eeb90b9` y `a81578c` (antes de Tramo B).  
3. `503928f` local y `aab2714` (CI annotations): **idéntico** a la baseline (`e2e:comparar-baseline --strict-missing` exit 0).  
4. Historial público E2E en `main`: **sin ningún success** al menos desde `ac75b5d` (2026-10-10).  
5. Gate local `verificar:arquitectura:completo` solo corre `e2e/smoke.spec.js` — **nunca** incluyó esta suite completa.

**Conclusión:** fallo de baseline / tests obsoletos o de entorno CI — **no** regresión de producción atribuible a `503928f` ni `aab2714`.

## Matriz bisect (SHA × spec-grupo)

| Spec (grupo) | eeb90b9 | a81578c | 503928f | aab2714 |
|--------------|---------|---------|---------|---------|
| agenda-entry-modal :108,:142 | FAIL | FAIL | FAIL | FAIL |
| money-box-routing :48 | FAIL | FAIL | FAIL | FAIL |
| rh-flyback-carga :136 | FAIL | FAIL | FAIL | FAIL |
| rh-pm-form-layout :110,:133,:158,:175,:221 | FAIL | FAIL | FAIL | FAIL |
| rh-tables-mobile :187 (4 viewports) | FAIL | FAIL | FAIL | FAIL |
| video-corrections :20,:57,:69,:97,:123 | FAIL | FAIL | FAIL | FAIL |

Lista exacta de 18: `docs/arquitectura/e2e-baseline.md`.

## sync.reconcile / RLS prospects (RO)

Desde ~deploy Tramo B (2026-10-17T23:00Z):

- **Antes del deploy:** miles de eventos (`sync.reconcile.failed` / upsert prospects RLS) en **24** usuarios distintos (días previos desde sept).  
- **Después:** 118 eventos en **4** usuarios; **2** de ellos ya fallaban antes.  
- **No** es un patrón nuevo introducido por Tramo B/Etapa 2; es ruido preexistente de sync/RLS (un usuario concentra parte del after, pero el fenómeno es antiguo).

## Regla nueva de CI (este plan)

Desplegar solo si: **Arquitectura VERDE** + E2E con **exactamente** los 18 de la baseline (script `e2e:comparar-baseline`). Fallo nuevo → STOP.
