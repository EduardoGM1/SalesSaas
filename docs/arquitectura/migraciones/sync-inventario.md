# Sync / storage / outbox — inventario

**Estado A+C.** API y web viven en `modulos/sync`. Las claves `sts4_*`, los paths y los códigos HTTP no se renombran. `db-store` sigue fuera; los shims de `@/lib/sync-*` lo alimentan.

## Qué entra

API: `routes/sync.js`, `controllers/sync-controller.js`, `services/sync-service.js` y `sync-reconcile.test.mjs`.

Web: `sync-provider.jsx`, `sync-api.js`, `sync-store.ts`, `sync-merge.js`, `sync-outbox.js`, `sync-outbound.js`, `sync-pending-deletes.js`, `sync-refresh.js`, `sync-table-refresh.js`, `sync-suspend.js` y `settings-sync.js`.

## Qué no entra

| Pieza | Por qué |
|-------|---------|
| `packages/shared/src/data/**` | `sync:shared` y la paridad web↔shared. Se importa, no se mueve |
| Claves `sts4_v1`, `sts4_outbound_v1` y `pendingDeletes` | Un rename deja a los clientes ya desplegados sin su cola |
| `PUT /sync` y el permiso de alta de ventas | Sigue `ventas:registrar` para ventas y `expedientes:editar` para agenda. No se alinea con el REST |
| `db-store` y `cloud-persist` | Los usan agenda, ventas y expediente. Solo se mueven si el import queda en una fachada y los códigos no cambian |

## Tramo A — Web (hecho en código)

Provider, store, outbox, merge, refresh y shims en rutas legacy. Entradas delgadas: `provider.js`, `store.js`, `fachada-node.js`, `fachada-api.js`, `fachada-table.js`.

## Tramo C — API (hecho)

Rutas, controlador, servicio y `sync-reconcile` viven en `modulos/sync`. Paths `/sync`, wrap `sync`, mensaje partial y protocolos 1/2 iguales. El cron de tombstones y notificaciones importan la fachada.

## Verificación

Caracterizar `PUT /sync` (200, 409 `sync_partial`, protocolo 1 y 2) antes de mover la API. El humo no escribe filas de producción. No hay backoff nuevo ni cambio de reintento del outbox en este inventario.
