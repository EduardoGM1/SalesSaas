# Inventario — ventas (módulo 9)

**Tramo B (dominio) movido.** Tramos A y C sin empezar. Sin deploy en este documento hasta que los gates cierren. Sin cambios de BD.

**Contratos congelados:** ver §2. No renombrar. **shared/sync intocable** en los tramos B/A/C (guard del mismo corte que el de agenda, ver §4).

**Hallazgo clave:** el cálculo de “qué cuenta como venta” estaba aislado en `lib/sales/` y en el Tramo B pasó a `modulos/ventas`. La escritura (fila `sales`, expediente, agenda y `processDate`) vive en `db-store` y sube por `PUT /sync` / outbox. Ese cruce se queda fuera de los tres tramos.

---

## 0. Resumen de conteos (tip de `main` al abrir este inventario)

| Grupo | Archivos | Líneas | Nota |
|-------|----------|-------:|------|
| Dominio y cálculo | `modulos/ventas/dominio` y `servicios` (antes 4 archivos en `lib/sales/`) | — | Puro respecto de red y de `sync.js` |
| UI de venta | 4 propios + 1 shell genérico + 1 modal de expediente | 374 propios; shell 34; expediente 258 | El shell no es de ventas |
| API MVC | 4 (`routes` / controlador / servicio / repositorio) | 150 | Ya separado; falta `modulos/` |
| Persistencia y sync | `db-store`, `cloud-persist`, shared sync/mappers/validators/columnas, outbox, `sts4_*` | compartido | **No mover** |
| Cruces | agenda, metas, expediente, notificaciones, Royal Holiday | — | Ver §1.5 |
| Flags, permisos, i18n, tests | catálogo + claves + E2E de egress | — | Ver §1.6–§1.8 |

**Núcleo movible sin tocar sync:** los 4 de dominio (221) + UI propia (374) + API (150) ≈ 745 líneas.  
**Fuera:** `packages/shared/src/data/*`, outbox, `sts4_*`, y el cruce `processDate` de `db-store`.

---

## 1. Inventario

### 1.1 Dominio y cálculo

| Archivo | Líneas | Qué hace |
|---------|-------:|----------|
| [`apps/web/src/modulos/ventas/dominio/contabilidad-ventas.ts`](../../../apps/web/src/modulos/ventas/dominio/contabilidad-ventas.ts) | — | `ventaContable` / `isSaleCountable`, `ventaActivaEnAgenda` / `isActiveAgendaSale`, `ventasDelMes` / `collectSalesForMonth` (antes `lib/sales/agenda-sales.ts`) |
| [`apps/web/src/modulos/ventas/dominio/validez-formulario.ts`](../../../apps/web/src/modulos/ventas/dominio/validez-formulario.ts) | — | `fechaProcesoVenta` / `resolveSaleProcessDate`, `formularioVentaValido` / `isSaleFormValid` (antes `lib/sales/form-valid.ts`) |
| [`apps/web/src/modulos/ventas/servicios/recopilar-ventas.ts`](../../../apps/web/src/modulos/ventas/servicios/recopilar-ventas.ts) | — | `recopilarVentas` / `collectAllSales`, `filtrarVentas`, `contarVentas`, `buscarVentaPorId` (antes `lib/sales/collect.ts`) |
| [`apps/web/src/modulos/ventas/servicios/instantanea-venta.ts`](../../../apps/web/src/modulos/ventas/servicios/instantanea-venta.ts) | — | `construirInstantaneaVenta` / `buildSaleSnapshot`. `lib/sales/snapshot.ts` queda como shim porque `db-store` no se puede editar |

Regla de conteo (no unificarla con la copia de `db-store` en estos tramos):

- `isSaleCountable`: excluye `tourCuantificable === false`, estado `cancelada`, estado `pendiente` y `processing === "pendiente"`. El resto cuenta (el default de estado es `venta`).
- `isSaleTourCountable`: cuenta el tour si `tourCuantificable !== false`, **incluido** el estado `pendiente`.
- `isActiveAgendaSale`: la entrada `t=venta` se muestra si la venta del expediente es contable o `cancelada`. `pendiente` no se muestra como venta.
- `isCancelledAgendaSale`: el color rojo sale del estado actual de la venta, no de la fila de agenda.

Copia distinta dentro de [`apps/web/src/stores/db-store.ts`](../../../apps/web/src/stores/db-store.ts): `isProcessableSale` / `shouldKeepSaleOnAgenda`. No mira `tourCuantificable`. Sirve para dejar la venta en la agenda y para `hasSales` / `lastSaleVolume` del expediente.

Estados que ya aparecen en UI o en el enum `prospect_status` (no renombrar): `venta`, `pendiente`, `cancelada`, `cerrado`, `bback`, `perdido`, `procesable`, `no-procesable`, `procesado`. El formulario de alta usa `venta`, `pendiente`, `cerrado`, `cancelada`. El historial filtra además `bback` y `perdido`. `processing` en cliente es `venta` o `pendiente`; el default de columna en BD es `procesable` (migración `0008`).

Montos: `vol` se guarda como el número tecleado (`parseMoney`), sin conversión. El formato de pantalla está en [`apps/web/src/lib/format/money.ts`](../../../apps/web/src/lib/format/money.ts) (92) y en [`apps/web/src/hooks/use-money.js`](../../../apps/web/src/hooks/use-money.js). `toDisplayAmount` trata el número guardado como USD y, si la moneda de pantalla no es USD, lo multiplica por la tasa. **Ningún archivo de ventas importa `@/modulos/moneda`.** La normalización de `usdToMxnRate` sigue en el módulo de moneda, en el guardado de ajustes.

### 1.2 UI

| Archivo | Líneas | Papel |
|---------|-------:|-------|
| [`apps/web/src/pages/SalesHistoryPage.jsx`](../../../apps/web/src/pages/SalesHistoryPage.jsx) | 174 | Ruta `/sales`. Lista local (`collectAllSales` + `filterSales`), feature `sales:history`, abre el detalle |
| [`apps/web/src/components/sales/sale-detail-modal.jsx`](../../../apps/web/src/components/sales/sale-detail-modal.jsx) | 144 | Detalle de solo lectura. Lee snapshot y pinta survey, vacaciones y worksheet con la moneda de pantalla |
| [`apps/web/src/hooks/use-sale-actions.js`](../../../apps/web/src/hooks/use-sale-actions.js) | 8 | `saveSale` → `saveClientSale` |
| [`apps/web/src/actions/sales.js`](../../../apps/web/src/actions/sales.js) | 48 | Valida, llama `registerClientSale` / `updateClientSale`, y si queda `pendiente` con follow programa `scheduleReminderPush` (`entryKey` `sale-proc-…`) |
| [`apps/web/src/components/ui/sales-modal.jsx`](../../../apps/web/src/components/ui/sales-modal.jsx) | 34 | **Shell genérico** de diálogo. Lo usan expediente, survey, worksheet, equipo, admin, red, ajustes de prima. No es dominio de ventas |
| [`apps/web/src/components/clients/client-record-modal.jsx`](../../../apps/web/src/components/clients/client-record-modal.jsx) | 258 | Modal de expediente. Dentro está `SaleFields` (fecha, volumen, tours, folio, estado, `processDate`) |

Ruta: [`apps/web/src/routes/lazy-pages.js`](../../../apps/web/src/routes/lazy-pages.js) y [`apps/web/src/routes/index.jsx`](../../../apps/web/src/routes/index.jsx) (`path="sales"`). Nav: [`apps/web/src/lib/nav-config.js`](../../../apps/web/src/lib/nav-config.js) con feature `sales:history`.

Consumidores de la UI de venta (no del shell): ficha [`client-detail.jsx`](../../../apps/web/src/components/clients/client-detail.jsx) (`useSaleActions`, `SalesModal`), agenda [`calendar-page.jsx`](../../../apps/web/src/modulos/agenda/ui/calendar-page.jsx) y [`entry-dialog.jsx`](../../../apps/web/src/modulos/agenda/ui/entry-dialog.jsx), tablero [`dashboard-chart.jsx`](../../../apps/web/src/components/goals/dashboard-chart.jsx).

### 1.3 API

Ya es MVC. Paths sin cambio.

| Archivo | Líneas | Papel |
|---------|-------:|-------|
| [`apps/api/src/routes/sales.js`](../../../apps/api/src/routes/sales.js) | 10 | `GET/POST /sales`, `GET/PATCH/DELETE /sales/:id` |
| [`apps/api/src/controllers/sales-controller.js`](../../../apps/api/src/controllers/sales-controller.js) | 26 | Paginación y delegación |
| [`apps/api/src/services/sales-service.js`](../../../apps/api/src/services/sales-service.js) | 65 | Permisos y, si el parche deja `status=cancelada`, `import()` de `handleCancelacionVenta` |
| [`apps/api/src/repositories/sales-repository.js`](../../../apps/api/src/repositories/sales-repository.js) | 49 | `SALE_LIST_COLUMNS`; el listado añade `prospects(name, name1, prospect_code)` |

Montaje: [`apps/api/src/routes/v1.js`](../../../apps/api/src/routes/v1.js). Otro lector del path del repositorio: [`e2e/egress-payload.spec.js`](../../../e2e/egress-payload.spec.js) (el Tramo C tendrá que actualizar esa ruta, como en agenda, sin cambiar la aserción de columnas).

Contrato HTTP actual (no medido de nuevo en este inventario; se caracteriza en el Tramo C, antes del move):

| Verbo | Permiso | Notas |
|-------|---------|-------|
| `GET /api/v1/sales` | `sales:history` | Filtra workspace; sin `teamScope` también `user_id` |
| `POST /api/v1/sales` | `ventas:registrar` | 400 si faltan `prospect_id` y `sale_date`/`date` (`bodyToSaleInsert`) |
| `GET /api/v1/sales/:id` | `sales:view_detail` | 400 si el id no es uuid; 404 «Venta no encontrada.» |
| `PATCH /api/v1/sales/:id` | `ventas:editar` | Siempre filtra `user_id` del actor. `cancelada` dispara Royal Holiday |
| `DELETE /api/v1/sales/:id` | `ventas:cancelar` | `{ ok: true }` |

`PUT /sync` solo consulta `ventas:registrar` para insertar `sales` (`SYNC_INSERT_PERMISSIONS`). No se alinea con el REST en estos tramos.

### 1.4 Persistencia y sync

Tabla `public.sales`. Columnas que el pull y el listado ya piden (no ampliar ni renombrar en los tramos): `id`, `user_id`, `workspace_id`, `prospect_id`, `prospect_name`, `sale_date`, `vol`, `tours`, `contract`, `status`, `processing`, `process_date`, `add_processing_followup`, `note`, `created_at`. FK `prospect_id`; `calendar_entries.sale_id` hace `ON DELETE SET NULL`.

Blob local: `sts4_v1` y `sts4_v1:{workspaceId}` guardan `clients[].sales` y el mapa `db.sales` (ventas cuyo expediente ya no está). Claves de outbox y `pendingDeletes.sales` no se renombran.

Escritura de producto: `registerClientSale` / `updateClientSale` / `ensureSaleInClientAndAgenda` en `db-store`. Al guardar:

- estado distinto de `pendiente` → entrada de agenda `t=venta`, `source=client`, `processDate` vacío en la venta, sin `kind`;
- `pendiente` con `addProcessingFollowup` y `processDate` → entrada `t=follow`, `kind=procesamiento-venta`, `source=client-sale-processing`, en la fecha de proceso.

Eso también copia `status`, `contract` y `processDate` al expediente y crea la actividad de venta. [`apps/web/src/lib/cloud-persist.js`](../../../apps/web/src/lib/cloud-persist.js) reenvía `processDate`.

Sync (intocable): [`packages/shared/src/data/sync.js`](../../../packages/shared/src/data/sync.js) (`sales: "ventas:registrar"`, clave natural `created_at` + `sale_date` + `prospect_id`), [`packages/shared/src/data/mappers.js`](../../../packages/shared/src/data/mappers.js), [`packages/shared/src/api/validators.js`](../../../packages/shared/src/api/validators.js) (`bodyToSaleInsert`), [`packages/shared/src/data/sync-columns.js`](../../../packages/shared/src/data/sync-columns.js), [`apps/api/src/lib/patch-whitelist.js`](../../../apps/api/src/lib/patch-whitelist.js) (`saleToPatch`).

`processDate` **se queda fuera** de B, A y C. La propuesta es no mover `ensureSaleInClientAndAgenda` ni hacer que `db-store` pase a llamar una función nueva. En el Tramo B el golden describe la forma de la fila de agenda; el store sigue con su copia. Tocarlo es el mismo tipo de cambio que la regresión de `PUT /sync`: el blob y las filas de `sales` y de `calendar_entries` salen de ahí.

### 1.5 Cruces

| Quién | Cómo | En los tramos |
|-------|------|----------------|
| Agenda | `isActiveAgendaSale` / `isCancelledAgendaSale`; `findSaleById` en `resolve-entry-client`; detalle y shell en la página | Tras B, agenda importa la fachada de ventas. Ventas no importa agenda |
| Metas | [`semanas-tablero.ts`](../../../apps/web/src/modulos/metas/dominio/semanas-tablero.ts) suma `sale.vol` con `isSaleCountable` y cuenta tours con `isSaleTourCountable`. [`kpis-metas.ts`](../../../apps/web/src/modulos/metas/dominio/kpis-metas.ts) recibe el volumen ya sumado y no convierte moneda | Fachada de ventas. No se toca el cálculo de metas ni `modulos/moneda` |
| Dashboard | [`tour-summary.ts`](../../../apps/web/src/lib/calculations/tour-summary.ts) usa `isSaleCountable` con `tour_cuantificable` del expediente | Fachada |
| Ajustes | `collectAllSales`, `isSaleCancelled` | Fachada |
| Expediente | `client-detail`, `client-record-modal` (`SaleFields`) | El modal de expediente se queda; en A, `SaleFields` puede salir a la fachada (decisión §5) |
| Notificaciones | `scheduleReminderPush` en pendiente; digest `SALES_TO_PROCESS` lee `processDate` en `construir-recordatorios.js`; deep link `/sales` | No se mueven. PushType y claves de preferencias congelados |
| Money Box | No importa `lib/sales`. `ventaTotal` es matemática del worksheet RH. La clase CSS `sales-page` es presentación | Fuera |
| Comisiones / Royal Holiday | `PATCH` a `cancelada` llama `handleCancelacionVenta` → `rh_ventas` por `sale_id` | El `import()` se conserva en el servicio. `rh_ventas` no entra al módulo |
| Moneda | Cero imports desde ventas. Pantalla vía `use-money` / `lib/format/money` y claves de settings | No mover `format/money` ni reabrir moneda |

### 1.6 Flags y permisos

Catálogo en [`packages/shared/src/auth/permission-catalog.js`](../../../packages/shared/src/auth/permission-catalog.js):

- App / API: `ventas:registrar`, `ventas:editar`, `ventas:cancelar`, `ventas:ver_equipo`.
- Features de UI: `sales:view_modal`, `sales:view_detail`, `sales:history` (también en [`packages/shared/src/auth/user-features.js`](../../../packages/shared/src/auth/user-features.js) y [`apps/web/src/lib/auth/user-features.ts`](../../../apps/web/src/lib/auth/user-features.ts)).
- Legado en [`packages/shared/src/auth/permissions.js`](../../../packages/shared/src/auth/permissions.js): `sales:read`, `sales:export` (valor nulo). No renombrar.

Claves de settings que la pantalla de venta ya lee: `currency`, `activeCaptureCurrency`, `exchangeRate`, `usdToMxnRate`, `exchangeMode`, `language`. No se renombran.

### 1.7 i18n

Catálogo en [`apps/web/src/lib/i18n.js`](../../../apps/web/src/lib/i18n.js) y [`apps/web/src/lib/i18n-phase2-catalog.js`](../../../apps/web/src/lib/i18n-phase2-catalog.js). Prefijos que no se renombran: `page.sales.*`, `salesHistory.*`, `saleDetail.*`, `exp.sale.*`, `exp.sales.*`, `toast.sale.*`, `status.sale`, `status.cancelled`, `admin.perm.sales*`. El catálogo no se mueve.

### 1.8 Tests que ya existen

| Test | Qué cubre de ventas |
|------|---------------------|
| [`e2e/egress-payload.spec.js`](../../../e2e/egress-payload.spec.js) | El repositorio usa `SALE_LIST_COLUMNS` y no `select("*")`; umbral de bytes de `GET /api/v1/sales` |
| [`e2e/egress-realtime-idle.spec.js`](../../../e2e/egress-realtime-idle.spec.js) | En idle no hay `GET /api/v1/sales` |
| [`apps/api/src/services/sync-reconcile.test.mjs`](../../../apps/api/src/services/sync-reconcile.test.mjs) | Filas `sales` dentro del reconcile (no se toca en estos tramos) |
| [`scripts/architecture/smoke-sync-roundtrip-qa.mjs`](../../../scripts/architecture/smoke-sync-roundtrip-qa.mjs) | Una venta dentro del roundtrip de sync |
| [`apps/api/src/modulos/notificaciones/dominio/construir-recordatorios.test.mjs`](../../../apps/api/src/modulos/notificaciones/dominio/construir-recordatorios.test.mjs) | `processDate` y deep link de `SALES_TO_PROCESS` |

No hay unitarios de `agenda-sales`, `form-valid`, `collect` ni `snapshot`, ni smoke QA de alta/edición/borrado de `sales`. El Tramo B crea los golden masters. El Tramo C crea el smoke de filas.

---

## 2. Contratos que NO se renombran

| Contrato | Detalle |
|----------|---------|
| Tabla / columnas | `sales` y la lista de §1.4 |
| Estados | Valores de §1.1, incluido `processing` |
| Claves storage | `sts4_v1`, `sts4_v1:{workspaceId}`, outbox, `pendingDeletes.sales` |
| HTTP | `/api/v1/sales`, `/api/v1/sales/:id` |
| Sync | `sales: "ventas:registrar"`, clave natural, `dbToRows` / `normalizeIds` |
| Settings | `currency`, `activeCaptureCurrency`, `exchangeRate`, `usdToMxnRate`, `exchangeMode`, `language` |
| Flags y permisos | §1.6 |
| i18n | Prefijos de §1.7 |
| Tool slugs | Ningún slug de herramienta se toca (`survey`, `worksheet`, `vacaciones` siguen en el snapshot) |
| Ruta UI | `/sales` |
| PushType | `sales_to_process` → `/sales` |
| `kind` de agenda | `procesamiento-venta` sigue naciendo en `db-store` |

---

## 3. Qué se mueve, qué no, y el riesgo

### Lógica pura (Tramo B)

Movible detrás de `modulos/ventas/dominio` + fachadas `index.ts` y `fachada-node.js`:

- estado y conteo: `isSaleCancelled`, `isSaleCountable`, `isSaleTourCountable`, `isActiveAgendaSale`, `isCancelledAgendaSale`, `collectSalesForMonth`, `collectCountableSalesForMonth`;
- formulario: `resolveSaleProcessDate`, `isSaleFormValid`;
- lista: `collectAllSales`, `filterSales`, `countAllSales`, `findSaleById`;
- snapshot: `buildSaleSnapshot`, `withSaleSnapshot`.

Consumidores de la fachada: metas (`semanas-tablero`), agenda (`calendar-page`, `resolve-entry-client`), ajustes, `tour-summary`, `actions/sales.js`, historial y detalle. `db-store` sigue importando el shim `lib/sales/snapshot.ts`. Ventas no importa metas ni agenda.

### Depende de sync / outbox (máximo riesgo; no entra en B/A/C)

`sync.js`, mappers, validators, `sync-columns`, `saleToPatch`, `cloud-persist`, outbox, claves `sts4_*`, `pendingDeletes.sales`. La regresión conocida de `PUT /sync` salió de tocar shared. El guard del Tramo B rechaza el diff si una rama `arquitectura/ventas-*` modifica `packages/shared/src/data/**` o `scripts/architecture/sync-shared-files.json`.

### `processDate` en `db-store` (se queda fuera)

Propuesta: **fuera** de los tres tramos. El golden del Tramo B fija la forma esperada de la fila de agenda (venta activa vs follow `procesamiento-venta`) leyendo una función pura nueva que **no** sustituye al store. `ensureSaleInClientAndAgenda` sigue escribiendo el blob. Un corte posterior, con OK explícito, puede hacer que el store llame a esa función; ese corte no es B, A ni C.

### Montos y moneda

- Guardado: `vol` numérico, sin pasar por `modulos/moneda`.
- Pantalla: `use-money` y `lib/format/money` (tasa y `activeCaptureCurrency`). No se mueven al módulo de ventas.
- Metas: suman `sale.vol` tal cual. Un cambio de moneda en ventas cambiaría el real del tablero. Estos tramos no lo cambian.
- **Backlog (sin corregir):** con captura en MXN, `vol` es ambiguo porque el número tecleado no pasa por el módulo de moneda y la pantalla lo trata como USD al aplicar la tasa. Pregunta de producto. Ver [`PROYECTO.md`](../../PROYECTO.md) §12.

---

## 4. Plan por tramos

Orden: **B puro → A UI → C API**. Cada uno con verificación sin dispositivo. Ninguno despliega ni toca BD. El guard entra en el primer commit de código del Tramo B (este inventario no lo añade).

### Tramo B — dominio puro

- Mover §3 «lógica pura» a `apps/web/src/modulos/ventas/dominio/`.
- Fachadas. Metas, agenda, ajustes y `tour-summary` importan la fachada. Sin shim si no queda consumidor.
- Golden masters nuevos (mismos casos antes y después), en `node --test` dentro de `test:web`:
  - matriz de `isSaleCountable` / `isSaleTourCountable` (`venta`, `pendiente`, `cancelada`, `processing=pendiente`, `tourCuantificable=false`);
  - `isActiveAgendaSale` / `isCancelledAgendaSale` con venta presente, cancelada, pendiente y sin `saleId`;
  - `resolveSaleProcessDate` / `isSaleFormValid` (volumen 0, folio vacío, pendiente sin fecha);
  - `collectSalesForMonth` + `filterSales` sobre un blob fijo;
  - forma de la fila de agenda descrita en §1.4, sin ejecutar `db-store`.
- Guard `check-ventas-shared-guard.mjs` (clon del de agenda, ramas `arquitectura/ventas-*`, mismos paths prohibidos) enganchado a `verificar:arquitectura:checks`.
- Verificar: `npm run test:web`, `npm run verificar:arquitectura:checks`. Con stack local (sección 4.4 de [`PROYECTO.md`](../../PROYECTO.md)): `npm run verificar:arquitectura:completo`. E2E del SHA en CI, 0 fallos. No hay smoke de filas en B: no se escribe `sales`.

### Tramo A — UI

- Mover historial, detalle, `use-sale-actions` y `actions/sales.js` a `modulos/ventas/{ui,hooks,servicios}`.
- `SalesModal` se queda en `components/ui` (decisión §5).
- `SaleFields` sale de `client-record-modal.jsx` solo si se cierra la decisión §5. El archivo de expediente no se mueve entero.
- La ruta `/sales` importa la fachada. Recordatorios siguen en `@/modulos/notificaciones`.
- Verificar sin dispositivo: los golden de B siguen verdes; E2E de egress sin cambio de aserciones; smoke QA efímera (rol que pueda registrar) que da de alta una venta `venta` y una `pendiente` con `processDate`, compara las filas de `sales` (y la entrada de agenda que el store ya crea) contra el mismo flujo en `main`, y purga a 0. Contraseña aleatoria fuera del repo.

### Tramo C — API MVC

- Caracterización **antes** del move, en commit aparte: códigos, forma `{ data, total, limit, offset }` / `{ ok: true }`, permisos de §1.3, 401/403/404/400, aislamiento por workspace. Mismos nombres y resultados después.
- Mover a `apps/api/src/modulos/ventas/{rutas,controladores,servicios,repositorio}`. Fachadas `index.js` y `fachada-node.js`. `v1.js` importa la fachada. Sin shims si no quedan consumidores.
- El `import()` de `handleCancelacionVenta` se queda en el servicio. No se mueve Royal Holiday.
- `bodyToSaleInsert`, `saleToPatch`, `SALE_LIST_COLUMNS` siguen en shared.
- Verificar: checks + guard; `test:security` con los tests nuevos y la misma lista de nombres previos; `test:web` sin cambios de comportamiento; E2E 0 fallos (el spec de egress apunta al repositorio nuevo, aserciones iguales); smoke API con QA efímera: 401 sin token, alta, edición, borrado, 403 sin `ventas:registrar`, aislamiento entre workspaces, filas de `sales` comparadas con `main`, purga a 0.
- Regla de corte: si cambia un código, un payload o una fila de `sales`, o el guard se dispara, no se despliega.

### Tramos que no se abren

| Pieza | Por qué |
|-------|---------|
| `packages/shared/src/data/**`, `sync-shared-files.json` | Regresión de `PUT /sync` |
| Outbox y `sts4_*` | Módulo de sync |
| `ensureSaleInClientAndAgenda` / `processDate` | Cruce agenda + expediente + blob |
| `rh_ventas`, Money Box, comisiones | Otro flujo de venta |
| `lib/format/money.ts`, `modulos/moneda` | Pantalla y tasa; `vol` no se convierte aquí |
| Shell `SalesModal` | Diálogo genérico |

---

## 5. Decisiones que hacen falta antes de empezar un tramo

1. **`SalesModal` se queda en `components/ui`.** Propuesta: sí. No es dominio de ventas.
2. **`processDate` y `ensureSaleInClientAndAgenda` se quedan en `db-store`.** Propuesta: sí, fuera de B/A/C. El Tramo B solo añade el golden de la forma de la fila, sin sustituir el store.
3. **Extraer `SaleFields` en el Tramo A.** Propuesta: sí, el formulario pasa al módulo y el modal de expediente lo usa por fachada. El archivo del expediente no se mueve.
4. **No unificar `isProcessableSale` con `isSaleCountable`.** La segunda mira `tourCuantificable`. Unificar cambiaría qué venta entra en la agenda o en los totales.
5. **Royal Holiday, Money Box y comisiones quedan fuera.** El único cruce que se conserva es `handleCancelacionVenta` al pasar a `cancelada`.
6. **No alinear en estos tramos el REST (`ventas:editar`, `ventas:cancelar`, `sales:history`, `sales:view_detail`) con el único `ventas:registrar` de `PUT /sync`.** Se caracteriza en C y la decisión de producto queda con el Tramo 2 de sync.
7. **El guard `arquitectura/ventas-*` se añade en el primer commit de código del Tramo B**, clon del de agenda. Este inventario no lo añade.

---

## 0e. Estado tras Tramo B (dominio puro)

| Pieza | Estado |
|-------|--------|
| Dominio | `modulos/ventas/dominio/` — contabilidad, validez del formulario, `filaAgendaDeVenta` |
| Servicios | `modulos/ventas/servicios/` — recopilar e instantánea |
| Fachadas | `index.ts`, `fachada-node.js` |
| Consumidores | Agenda, metas, ajustes, historial, detalle, formulario de expediente y `tour-summary` importan la fachada |
| Ciclo ventas↔agenda | No hay. Agenda importa la fachada de ventas. Ventas no importa agenda |
| `db-store` | No se editó (el guard lo prohíbe). Sigue `ensureSaleInClientAndAgenda` |
| Shim | `lib/sales/snapshot.ts` reexporta la fachada porque `db-store` importa `withSaleSnapshot`. Es el único consumidor que no se puede redirigir |
| Borrados de `lib/sales` | `agenda-sales.ts`, `form-valid.ts`, `collect.ts` |
| Contención | Baseline 385 → 382 (−3). Disco 388 → 385. Excepciones 3 |
| `filaAgendaDeVenta` | Golden de la forma. No sustituye al store |
| `isProcessableSale` | Sigue privada en `db-store`. No se unificó con `ventaContable` |

## 6. Checklist

- [x] Inventario y plan (este documento)
- [x] Tramo B dominio puro
- [ ] Tramo A UI
- [ ] Tramo C API
- [ ] Sync / `processDate` / `rh_ventas` (fuera de este módulo)
