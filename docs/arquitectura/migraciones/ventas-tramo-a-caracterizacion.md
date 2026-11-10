# Caracterización — Ventas Tramo A (antes de mover la UI)

E2E de la pantalla `/sales`: no hay spec en `e2e/`. El único candado de ventas en esa carpeta es `e2e/egress-payload.spec.js`, que apunta al repositorio de API. Este tramo no lo cambia.

Selectores que el smoke ya usa y no se renombran: `#m-client-record`, `.mfield input`, placeholder de folio, botones Registrar venta / Abrir venta / Guardar / Ver venta, ruta `/sales`, clases `sales-history-filters` y `cal-grid`. `SalesModal` se queda en `components/ui`.

## Qué hace cada acción

`validateSaleForm` no toca el store. Rechaza volumen ≤ 0 o folio vacío, y un `pendiente` sin fecha de proceso (si el formulario trae `date`, esa fecha cubre el vacío). En una venta que no es `pendiente` el payload lleva `processDate: ""` aunque el formulario tuviera otra fecha.

`saveClientSale`:

| Caso | Escritura |
|------|-----------|
| Alta | `registerClientSale(clientId, payload)` |
| Edición (`editingSaleId`) | `updateClientSale(clientId, editingSaleId, payload)` |
| `pendiente` + seguimiento + fecha de proceso | además `scheduleReminderPush` con `type: "follow-up"` y `entryKey` `sale-proc-{clientId}-{fecha}-{folio}` |

El payload es `{ date, vol, tours, contract, status, processDate, note, addProcessingFollowup }`.

`useSaleActions` solo devuelve `saveSale`, que llama a `saveClientSale`.

Quien crea la fila de `sales` y la de agenda es `db-store` (`registerClientSale` / `updateClientSale` → `ensureSaleInClientAndAgenda` → `notifySaleRegistered` / `notifySaleUpdated`). Esta acción no calcula `entry_date`. Tras el fix de `findCalEntries`, esa fila debe quedar en el mismo mes que `sale.date`.
