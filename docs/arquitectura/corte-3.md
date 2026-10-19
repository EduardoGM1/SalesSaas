# Corte 3 — post Tramo B / Etapa 2 / locks cliente (sin 0098)

Fecha: 2026-10-18. Solo documentación.

## SHAs en producción

| Superficie | SHA | Notas |
|------------|-----|-------|
| `main` / `origin/main` | `fe26b10` | tip local = remoto |
| API VPS (`/var/www/Saletse` git) | `aab2714` | Paso 2; sin redeploy API en Paso 3 |
| Web `build-id` | `fe26b10` | Paso 3 web-only |
| Política `broadcast_expediente` | **aplicada** (count=1) | canario ii revertido; canario ii-bis aplicado y mantenido |

Desalineación API≠web es **intencional** tras Paso 3 web-only. No se forzó redeploy API a `fe26b10` (fuera del alcance autorizado).

## Pasos ejecutados

| Paso | SHA | Ámbito | Resultado |
|------|-----|--------|-----------|
| 1 Tramo B | `503928f` | API | OK (previo) |
| 2 Permiso PUT | `aab2714` | API + web | OK (previo) |
| 3 Locks cliente | `fe26b10` | web-only | OK: Arquitectura verde + E2E=baseline; presence A↔B; bloqueo = KNOWN GAP; purga 0 |
| 4a Canario 0098 share-only | — | BD | STOP antes de apply (B CHANNEL_ERROR por predicado share+WS) |
| 4b Canario 0098 variante ii | — | BD (1 policy) | Aplicada → positivos A↔B OK → falla del instrumento de presence → **rollback automático OK** |
| 4c Canario 0098 ii-bis | — | BD (1 policy) | Línea base presence 2/2 → bug reproducido → apply → todos los criterios OK → **0098 aplicada**; gate collab bloqueo = PASS |
| 5 Saneamiento E2E | `8b59907` | tests | 18 → 1 (ver `e2e-baseline.md`) |

## Paso 4 — resumen

Detalle completo y tabla de casos en [`pendiente-bloqueo-campos-collab.md`](./pendiente-bloqueo-campos-collab.md) § Canario ii.

- Bug previo reproducido (B no recibe `field_lock` sin política).
- Tras aplicar: count=1, 4 `presence_*` idénticas, B recibe de A y A recibe de B.
- El chequeo de presence del script devolvió 0/0 también **antes** del apply: faltaba un listener `presence` antes de `subscribe` (comprobado sin cambios de BD: 0/0 sin listener, 2/2 con listener).
- Rollback `DROP POLICY IF EXISTS` ejecutado; re-snapshot con 4 policies. Purga QA a 0.
- Canario corregido y re-ejecutado (ii-bis) con línea base de presence pre-apply: todos los criterios OK, 0098 queda aplicada.

## Baseline E2E

Ver `docs/arquitectura/e2e-baseline.md` + `e2e:comparar-baseline`.  
Matriz bisect (18 idénticos): `eeb90b9` = `a81578c` = `503928f` = `aab2714` = `fe26b10`.  
Clasificación Etapa 5: sección en `e2e-baseline.md` (propuesta, sin aplicar).

## Backlog de seguridad

[`backlog-seguridad.md`](./backlog-seguridad.md): (1) miembros del WS acceden a canales de todos los expedientes del WS — exposición actual 1 sala / 1 expediente; (2) `sync.reconcile` RLS preexistente y multiusuario, hipótesis `dbToRows` estampa `user_id` propio en expedientes ajenos; (3) `/health` con `commit: null` en VPS; (4) regex de texto del comparador E2E. §2.1 tiene el diagnóstico solo lectura: `PUT /sync` no puede insertar filas nuevas (`workspace_id` nulo) y el filtro `teamScope` no filtra nada; hay datos de 3 usuarios vigentes fuera de la nube.

Fix `?sub=moneybox` (bug desde `4703d65`): rama `arquitectura/fix-sub-moneybox`, baseline E2E 0, plan web-only en [`deploy-fix-sub-moneybox.md`](./deploy-fix-sub-moneybox.md); sin merge ni deploy.

## Deuda restante

| Tema | Estado |
|------|--------|
| Notificaciones Tramo A / API | Tramo A web **desplegado** `61b223f` (web-only; API sigue `72a3ca4`); detalle en [`notificaciones.md`](./migraciones/notificaciones.md). Tramo B API en `aab2714`; API de notificaciones aún sin migrar a `modulos/` |
| Bloqueo campos / 0098 | **Resuelto**: 0098 aplicada (canario ii-bis); gate collab bloqueo = PASS |
| Multi-pestaña en bloqueos | pendiente |
| Sync / persistencia / outbox | deuda compartida |
| HTTPS | pendiente ops |
| Retención backups VPS | pendiente ops |
| E2E saneamiento | 18 → 1; queda bug de app `?sub=moneybox` |
| Alinear API git a `fe26b10` | opcional; no pedido en Paso 3 |

## Backups relevantes

- API: `/opt/saletse-backups/api/pre-20261017-235332`, `…/pre-20261018-000201`
- Web: `/opt/saletse-backups/web-dist/pre-20261018-000302`, `…/pre-20261018-011544`, `…/pre-20261018-011559`
