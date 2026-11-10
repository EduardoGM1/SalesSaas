# Expediente / sharing — inventario

**Estado C.** Dominio, UI y API viven en `modulos/expediente`. OPC sigue en `components/clients`. El realtime de red y la persistencia siguen fuera. Sin cambios de BD ni de paths HTTP.

## Tramo A — UI (hecho)

Páginas, modal, acciones y hooks de expediente están en `modulos/expediente/{ui,hooks,servicios}`. Las rutas `/clients`, `/clients/:id`, `/share/:token`, `/e/i/:token` y `/e/:prospectId` no cambian. `db-store` no se editó. `opc-expediente-page.jsx` no se movió.

## Qué entra en el Tramo B

| Pieza | Destino |
|-------|---------|
| Identidad y nombre (`ensureProspectIdentity`, `clientDisplayName`, `activeClients`) | `dominio/identidad-prospecto.ts` |
| Fila compartida y permisos de share (`prospectRowToClient`, `canEditShared`, `canCommentShared`, `canAddToWorkspace`) | `dominio/prospecto-compartido.ts` |
| Throttle de avisos de bloqueo de campo | `dominio/aviso-bloqueo.js` |

Los nombres exportados no cambian. `db-store` sigue importando `@/lib/clients`: ese archivo queda como puente a `fachada-node.js` porque el guard prohíbe editar `db-store`.

## Qué no entra

| Pieza | Por qué |
|-------|---------|
| `opc-expediente.js` y su página | Royal Holiday / OPC. Módulo 11 |
| `prospects-persist`, `clients-mirror`, `recover-local-prospects` | Outbox y sync |
| `expediente-realtime.js` | I/O de presencia. Solo cambia el import del throttle |
| API `prospects`, `sharing`, `prospect-edit-access` | Tramo C (hecho) |
| UI de `components/clients`, hooks y acciones | Tramo A |
| `packages/shared/src/data/**`, `sync.js`, `db-store`, outbox | Misma regla que ventas y agenda |

## Verificación del Tramo B

La caracterización corre contra el archivo legacy y, después del move, contra el módulo. Mismos casos: folio, nombre, lista activa, fila con `processing` por omisión, permisos de share. El test del throttle no cambia de aserciones.

Guard `check-expediente-shared-guard.mjs` en ramas `arquitectura/expediente-*`. Prohíbe `packages/shared/src/data/**`, `sync-shared-files.json`, `db-store.*` y archivos con `outbox` en el nombre.

No hay smoke de filas: este tramo no escribe `prospects` ni `sales`.

## Tramos

- **A — UI (hecho).** Páginas, modal, acciones y hooks de expediente. OPC y el store no se movieron.
- **C — API (hecho).** `prospects`, shares y `prospect-edit-access`. OPC, sync, `db-store` y el outbox no se movieron.
