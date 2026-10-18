# Diseño del fix de `PUT /sync` (reconcile)

**Ramas:** `arquitectura/sync-fix-diseno` (diseño) → `arquitectura/sync-fix-tramo1` (implementación del tramo 1)  
**Estado:** Tramo 1 (solo API) **implementado en rama, sin desplegar**. Tramos 2 (web) y 3 (BD) pendientes.  
**Origen:** diagnóstico solo lectura en `backlog-seguridad.md` §2.1 (V1–V3, sin ids ni emails).

## 0) Causa raíz confirmada: regresión `9f2b5ac` (en producción desde el 13-10)

El commit `9f2b5ac` (red de seguridad, fase 1) regeneró `packages/shared/src/data/mappers.js` a partir de `apps/web/src/lib/data/mappers.ts` (`sync:shared` y chequeo de paridad). Con eso desaparecieron de la copia de la API dos cosas que el web nunca tuvo:

- `dbToRows(db, userId, workspaceId)` estampaba `workspace_id` en todas las filas.
- `ownerUserId` en `rowsToDb`/`dbToRows` conservaba el dueño, y el filtro de `teamScope` (`r.user_id === userId`) excluía las filas ajenas.

La primera API desplegada con ese commit fue `054f0ab` (2026-10-13 16:55 UTC, según el reflog del VPS). Desde el 14-10 hay **0** `sync.reconcile.ok` de usuarios con expedientes (antes, 23–121 al día): todos fallan con `upsert prospects` RLS. Los dos defectos "HOY" de la caracterización son esta regresión.

El arreglo no va en `mappers.js`, porque está emparejado con el web por el chequeo de paridad. Va en `packages/shared/src/data/sync.js`, que solo existe en shared y solo usa la API.

**Regla (causa raíz de proceso):** `sync:shared` copia el web sobre shared para los archivos de `pairs` en `scripts/architecture/sync-shared-files.json`, así que cualquier lógica propia del servidor que viva en uno de esos archivos se pierde en silencio en la siguiente regeneración. La lógica del servidor va en archivos solo de shared (`sharedOnlyNoted`). Hay dos guards en `test:security` (`sync-reconcile.test.mjs`):

1. La prueba "(i) un expediente que solo existe en el cliente se inserta con el workspace de la sesión" falla si el `reconcile` deja de estampar el `workspace_id` de la sesión o de clasificar por dueño. Comprobado con mutaciones.
2. "guard: sync:shared no regenera sync.js" falla si `sync.js` entra en `pairs` o sale de `sharedOnlyNoted`.

### Corrección sobre la semántica RLS del upsert

En `INSERT … ON CONFLICT DO UPDATE`, Postgres evalúa el `WITH CHECK` de INSERT sobre la fila **propuesta** antes de detectar el conflicto. Si pasa y hay conflicto, evalúa después el `USING` de UPDATE sobre la fila existente. Por tanto, un error RLS **sin** "USING expression" **no** prueba que la fila no exista: también lo provoca una fila ya existente enviada sin `workspace_id`. La lectura anterior de este documento y de `backlog-seguridad.md` §2.1 ("sin USING = la fila no existe") era incorrecta. Además, un `UPDATE` que no pasa el `USING` no da error: afecta 0 filas.

## a) Pruebas

`apps/api/src/services/sync-reconcile.test.mjs`, incluida en `npm run test:security -w @salesapp/api`, con `--experimental-test-module-mocks` para probar también el servicio. Usa un Supabase en memoria que emula:

- el WITH CHECK de INSERT sobre la fila propuesta;
- el USING de UPDATE si hay conflicto;
- UPDATE invisible = 0 filas;
- el unique `(user_id, prospect_code)`;
- las FK;
- el trigger de tombstone;
- el historial de workflow inmutable.

Cada sentencia es atómica. Las 6 caracterizaciones "HOY" de la rama de diseño se invirtieron al comportamiento corregido:

| Prueba | Defecto | Aserción de HOY (ya invertida) |
|--------|---------|----------------------------------------|
| (i) expediente solo en el cliente | INSERT sin `workspace_id` | `reconcile` lanza `upsert prospects: new row violates row-level security policy for table "prospects"` y la fila enviada no lleva `workspace_id` |
| (i) entrada de agenda nueva | igual en `calendar_entries` | lanza el error RLS de INSERT |
| (i) aborto en cadena | sin aislamiento | tras fallar `prospects` no se intenta `goals` |
| (ii) `dbToRows` | estampa el dueño | un expediente y una venta de OTRO salen con `user_id = yo` |
| (ii) `teamScope` | el filtro no excluye nada | `reconcile(teamScope: true)` reenvía el expediente y la venta ajenos con `user_id = yo` |
| (ii) con RLS | bloqueo del PUT | la venta ajena falla por `USING` y el PUT aborta |

Las pruebas usan UUID ficticios, no datos reales. Además de las 6 invertidas, hay pruebas para:

- **(a) Idempotencia:** el mismo blob legacy, normalizado 3 veces (con 6 ids de expediente distintos), deja exactamente una fila por entidad en las seis tablas. También se prueban los duplicados dentro de un mismo blob.
- **(b) Compatibilidad:** sin rechazos, `{ data }` y una línea `sync.reconcile.ok`. En protocolo 1 con un rechazo, `ServiceError` 409 `sync_partial` y `runService` responde 409 sin `data`. En protocolo 2, 200 con `partial` y `rejected`.
- **(c) Workspace y permisos:** `sin_permiso` (expedientes y agenda), filas ajenas fuera de `teamScope`, `otro_workspace`, `sin_workspace` y `sin_permiso_editar`.
- **(d) Aislamiento:** fila oculta más hijos `padre_rechazado` sin afectar al resto; borrado bloqueado sin afectar a los demás; tombstone con sus hijos omitidos. La respuesta y el log no llevan nombres, emails ni ids en el resumen.

`e2e/sync-partial-409.spec.js` ejecuta el `SyncProvider` real del web: ante el 409 conserva la base local y el outbox (`dirty: true`) y vuelve a hacer `PUT` al recargar. El contraste muestra que un 200 vacío le borraría el expediente local.

Las pruebas se validaron con mutaciones: sin la deduplicación natural falla (a); sin la clasificación por dueño fallan 4.

## b) Diseño

### Por qué la ruta REST por entidad sí funciona hoy

- **Alta:** `createProspect` y `bodyToCalInsert(body, userId, ctx.workspaceId)` fijan `user_id` y `workspace_id` desde la sesión, así que el `WITH CHECK` de INSERT pasa.
- **Edición:** `.update(patch)` no incluye `user_id`, va acotada a `workspace_id` y antes pasa por `canEditProspectRecord` y `requireWorkspacePermission`. Nunca cambia el dueño.
- **Aislamiento:** cada fila es una petición. Un error afecta a esa fila; `PATCH` con 404 cae a `POST`.
- **Permisos:** exige `expedientes:crear` y `expedientes:editar` en el workspace. `PUT /sync` no comprueba permisos por fila y depende solo de la RLS.

### 1. Insertar con el `workspace_id` de la sesión

**Regla:** toda fila **nueva** lleva `workspace_id = ctx.workspaceId`, el workspace activo que resuelve `getRequestWorkspaceContext`, igual que REST. Nunca se acepta un `workspace_id` del cuerpo.

- **Sala o personal:** no hace falta distinguirlos. El workspace personal es un workspace real (`tipo = personal`), y el `ctx.workspaceId` es el que esté activo en ese momento.
- **¿Por qué el activo es el correcto?** El cliente guarda su base local y el outbox por workspace (`sts4_outbound_v1:{workspaceId}`, `applyWorkspaceLocalDatabase`), y el pull filtra por `workspace_id = activo`. El blob que llega en un `PUT` es el del workspace activo.
- **Sin workspace activo** (`ctx.workspaceId` nulo): no se inserta nada. Las filas se rechazan con el código `sin_workspace`, sin abortar el resto.
- **Filas que ya existen en otro workspace:** nunca se mueven. Se omiten y se reportan como `otro_workspace`.
- **Filas que existen pero no son visibles para el usuario:** el INSERT choca y el `ON CONFLICT DO UPDATE` falla en el `USING`. Se reporta como `conflicto_oculto`, solo para esa fila.
- **Permiso:** antes de insertar expedientes nuevos se comprueba `expedientes:crear` en `ctx.workspaceId`, con una sola RPC por petición. Sin permiso, se rechazan con `sin_permiso`. Así `PUT /sync` no da más acceso que REST.
- **Riesgo residual:** queda la clave legacy sin namespace (`OUTBOX_LEGACY_PENDING_KEY`), que solo se usa sin workspace activo en el cliente. Un blob anterior al namespacing podría subir filas personales a la sala activa. Mitigación en el tramo web: no hacer `PUT` con la clave legacy y migrarla solo al workspace personal.

### 2. Conservar el dueño (no estampar)

`rowsToDb` no guarda `user_id`, así que el blob no sabe de quién es cada fila. La propiedad se resuelve **en el servidor**:

1. Por tabla, se precargan las filas existentes por id (`select id, user_id, workspace_id … in (ids)`, en bloques de 100) con el cliente del usuario. `tool_calculations` se busca por `(prospect_id, tool)` y `goals` por `(year, month)`.
2. Cada fila del blob se clasifica:
   - **nueva** (no visible): INSERT con `user_id = yo` y `workspace_id = ctx`.
   - **propia** (`user_id = yo` y mismo workspace): UPDATE. El upsert reenvía el `user_id` y el `workspace_id` existentes, así que no cambian.
   - **ajena** (`user_id ≠ yo`): **se omite en cualquier alcance**, no solo en `teamScope`. Editar filas ajenas sigue yendo por REST, con sus reglas. Esto cierra a nivel de aplicación el riesgo de reasignación del UPDATE de prospects sin tocar la BD.
3. Los hijos (ventas, actividades, agenda y tools) solo viajan si su expediente es nuevo o propio, como hace hoy `keepChild`.
4. **Carrera:** si una fila aparece entre la precarga y el upsert, el `ON CONFLICT` la actualiza. Si es propia no pasa nada; si no, falla solo esa fila.

### 3. Aislar fallos por tabla y por fila

- Se mantiene el orden `prospects → sales → calendar → activities → goals → tools → borrados`, porque los hijos dependen de las FK del padre.
- Cada tabla va en su propio `try`. Si el upsert en bloque falla, se reintenta fila a fila, como `upsertToolsBestEffort`, con un tope de 200 filas por tabla y petición. Pasado el tope, el resto se marca `no_intentado`.
- Los hijos de un expediente rechazado se marcan `padre_rechazado` sin enviarse.
- Los borrados explícitos son de uno en uno y best-effort. El error de historial de workflow inmutable se marca `borrado_bloqueado`, y ese id no vuelve a enviarse en la misma petición.
- **Rechazos** (implementado): `rejected: [{ table, id, code }]`, con los códigos:
  - `rls_insert`, `rls_update`, `conflicto_oculto`;
  - `sin_workspace`, `sin_permiso`, `otro_workspace`;
  - `padre_rechazado`, `borrado_bloqueado`, `no_intentado`;
  - `tombstone` (solo si lo dispara el trigger), `fk`, `duplicado` y `otro`.

  `id` es el UUID que envió el cliente, que es suyo, y no hay nombres ni emails.
- **Omitidas** (`skipped[motivo][tabla]`): no son error ni provocan 409.
  - `ajeno`, `padre_ajeno`;
  - `tombstone`, `padre_tombstone`;
  - `sin_permiso` (tools);
  - `sin_permiso_editar`: un UPDATE de una fila propia que afecta 0 filas porque falta `expedientes:editar`. REST daría 403, y contarlo como rechazo dejaría un 409 perpetuo.
- **Log** (una línea por petición, sin ids): `sync.reconcile.ok` (info) o `sync.reconcile.partial` (warn), con `protocol`, `ms`, `inserted`, `updated`, `deduped`, `skipped`, `rejected` (por código) y `rejected_by_table`. Si algo falla en infraestructura: `sync.reconcile.failed`.

### 4. Forma de la respuesta (compatibilidad)

Cliente actual (`reconcileViaApi` en `apps/web/src/lib/sync-api.js` y `doReconcile`):

- Con `!res.ok`, lanza un error, marca el outbox como sucio y **conserva la base local**.
- Con `res.ok`, **reemplaza la base local** por `body.data` (`applyRemote` con `clearPendingDeletes: true`) y limpia el outbox.

Por tanto, **un 200 con filas rechazadas haría perder datos en un cliente viejo**: las filas locales no subidas desaparecerían al reemplazar la base y se vaciarían los borrados pendientes. Por eso hay dos modos:

| Cliente | Sin rechazos | Con algún rechazo |
|---------|--------------|-------------------|
| **v1**: sin cabecera; todo lo desplegado hoy y los PWA en caché | `200 { data, syncedAt }`, igual que hoy | **`409 { error: <mensaje>, code: "sync_partial", rejected_counts, rejected: [{ table, id, code }] }`**, sin `data`. Lo aceptado **ya quedó guardado**. El cliente viejo lo trata igual que hoy: conserva lo local, marca el outbox y reintenta. En cada reintento solo vuelven a fallar las filas rechazadas |
| **v2**: `X-Sync-Protocol: 2` | `200 { data }` | `200 { data, partial: true, rejected: [{ table, id, code }] }` |

- Se usa 409 y no 500 para distinguirlo en las métricas. El cliente viejo solo mira `res.ok`, así que cualquier código distinto de 2xx es equivalente para él.
- Un PWA en caché ejecuta el bundle viejo, sin cabecera, y entra en v1, que es seguro. No hace falta invalidar el service worker para el tramo API.
- **Cliente v2:**
  - Fusiona `data` con lo local con `mergeSyncDatabases`, en lugar de reemplazar, y conserva los ids rechazados y sus borrados pendientes.
  - Marca esas filas como "pendiente sin subir", visible para el usuario.
  - Deja de reintentar automáticamente los códigos permanentes (`sin_permiso`, `otro_workspace`, `ajeno` y `conflicto_oculto`).

### 5. Backoff del outbox (cliente, tramo web)

Hoy cada mutación, flush, refresh o init lanza `doReconcile`: unos 700 intentos al día con el mismo blob.

- **Estado persistente en el outbox:** `failCount`, `nextAttemptAt` y `lastErrorCode`.
- **Error transitorio** (red, 5xx o 409 v1): espera de 1, 2, 4… minutos, con tope de 30 min. Una mutación nueva no salta el backoff; solo lo reinician un cambio de workspace, un login o una nueva versión del bundle.
- **Rechazo permanente** (v2): sin reintento automático de esas filas. Se reintentan al cambiar de workspace o de versión, o con una acción explícita del usuario.

### 6. Idempotencia y duplicados

- Las filas se identifican por UUID generado en el cliente. Un upsert por id es idempotente: si se reintenta tras un INSERT exitoso cuya respuesta se perdió, se hace UPDATE de la propia fila y no se duplica.
- **Riesgo real con el fix:** `normalizeIds` asigna un UUID **nuevo** a ids legacy no-UUID en **cada** llamada a `reconcileViaApi`, y la base local no lo guarda hasta aplicar la respuesta. Si un INSERT funciona y se pierde la respuesta, el reintento usa otro UUID y crea un **duplicado**. Hoy no pasa porque el INSERT siempre falla.
- **Mitigación API (tramo 1, implementada):** antes de insertar, cada fila nueva se busca por su clave natural entre las filas **propias** del usuario. Si aparece, se actualiza esa fila con su id de BD y sus hijos se remapean a ella (se cuenta en `deduped`, no es un rechazo). Si es propia pero de otro workspace, se rechaza `otro_workspace`. Las claves naturales son:

  | Tabla | Clave natural | Por qué es estable entre reintentos |
  |-------|---------------|--------------------------------------|
  | `prospects` | `prospect_code`; si no coincide, `(created_at, name)` | El código lo genera el cliente una vez. Si `normalizeIds` lo regenera (blob sin código), `created_at` sale del `createdAt` local. Se conserva el `prospect_code` ya guardado |
  | `sales` | `(created_at, sale_date, prospect_id)` | `created_at` = `ts` local; `prospect_id` ya remapeado al expediente de BD |
  | `calendar_entries` | `(created_at, entry_date, type)` | `ts` local, día y tipo |
  | `activities` | `(created_at, type, prospect_id)` | `ts` local; `prospect_id` remapeado |
  | `goals` | `(user_id, year, month)` | Clave única de BD (`onConflict`) |
  | `tool_calculations` | `(user_id, prospect_id, tool)` | Clave única de BD con `NULLS NOT DISTINCT` (0003) |

  También se deduplican las filas repetidas dentro del mismo blob. **Límite:** una fila sin `ts` local llega sin `created_at` y no se puede deduplicar por clave natural (solo pasa en blobs muy antiguos).
- **Mitigación web (tramo 2):** guardar las ids normalizadas en local **antes** del `PUT`.
- Las ventas, la agenda y las actividades con id no-UUID solo existen en blobs muy antiguos. El tramo 1 registra cuántas filas llegan normalizadas, sin ids, para medirlo.

## c) Efecto sobre los datos pendientes de V1–V3

Con el tramo 1 desplegado, **sí suben solos** en el siguiente reintento del outbox, sin acción del usuario, si se cumplen **todas** estas condiciones:

1. El usuario abre la app, con cualquier versión, incluido un PWA en caché, porque el protocolo v1 es compatible y tiene sesión válida. El outbox sigue marcado como sucio (`reconcile-error`) y se dispara en el init, en refresh, al volver online o con una mutación.
2. **El workspace activo es aquel donde se crearon las filas**, porque el blob y el outbox van por workspace. Si nunca vuelve a ese workspace, no se suben.
3. Sigue siendo miembro de ese workspace y tiene `expedientes:crear` (para los expedientes). Si no, se rechazan con `sin_permiso` o `rls_insert`, sin bloquear el resto.
4. La base local sigue en ese dispositivo y navegador: no se borró almacenamiento ni hubo cambio de cuenta (`resetLocalCrmState`).
5. Las filas no tienen tombstone.

Por usuario:

- **V1** (agenda nueva, INSERT 10-10/11): cumple el patrón exacto de (i). Sube al abrir la app en ese workspace.
- **V2 y V3** (verificado en solo lectura, 18-10, conteos agregados):
  - Ambos tienen sala activa, son miembros con `expedientes:crear` y `editar`, y tienen 1 tombstone (01-10) y 1 expediente propio.
  - Sus fallos (7 y 53 en 15 días) coinciden al segundo con un `PUT /sync` 500. **No hay ningún `POST /prospects`** en la ventana de −15 s a +30 s: la recuperación del cliente no encuentra expedientes "solo locales".
  - Es decir, **no** tienen expedientes fuera de la nube: la conclusión anterior de este documento era incorrecta. Lo bloqueado es el resto del `PUT` (goals, tools en lote, borrados) y cualquier fila nueva, por la regresión de §0.
  - El tramo 1 los destraba al abrir la app en esa sala: fija el workspace de la sesión, clasifica por dueño y aísla fallos. Su tombstone se omite (`tombstone`) sin bloquear.
- **V2: ventas y agenda ajenas** (USING): dejan de enviarse (`ajeno`) y desaparece ese error.

### ¿Algún flujo legítimo edita filas de equipo por `PUT /sync`?

No. Antes de la regresión, el filtro de `teamScope` excluía las filas ajenas del `PUT` gracias a `ownerUserId`. La edición de equipo (`ver_equipo` con edición, roles de workflow, shares) va por REST (`PATCH` con `canEditProspectRecord`). El tramo 1 conserva eso: las filas ajenas se omiten en cualquier alcance (`skipped.ajeno`), sin actualizarse ni reasignarse. **Limitación** (igual que antes de la regresión): una edición offline de una fila de equipo que solo quede en el blob no sube por `PUT`; el siguiente pull la sustituye por la versión del servidor. La subida de esas ediciones por REST es del tramo 2.

## d) Plan por tramos

### Tramo 1: solo API (compatible hacia atrás, se despliega primero)

- **Contenido:** los puntos 1, 2, 3 y 6 (parte API), la respuesta v1/v2 del punto 4 y los logs `sync.reconcile.partial`. Sin cambios de BD, de web ni de configuración.
- **Pruebas:** invertir las pruebas de caracterización y añadir casos de `sin_workspace`, `otro_workspace`, `ajeno`, `sin_permiso`, `duplicado_codigo`, el aislamiento por tabla y por fila, y el 409 v1 frente al 200 v2.
- **CI:** Arquitectura verde y E2E con 0 fallos en el SHA exacto de `main`.
- **Backup:** `git rev-parse HEAD > /opt/saletse-backups/api/pre-STAMP/SHA.txt` y copia de `ecosystem`/`.env` (solo lectura, sin cambios).
- **Deploy:** `git checkout <sha>`, `npm ci` si cambia el lockfile, `pm2 reload saletse-api` y escribir `SHA.txt` (ver §3 de backlog-seguridad).
- **ROLLBACK:** `git checkout <SHA previo>` y `pm2 reload saletse-api`, verificando `/health` contra el SHA previo. Sin estado nuevo en BD, así que el rollback es completo, aunque las filas ya subidas se quedan (son datos legítimos del usuario).
- **Métricas** (logs de pm2, 24 h antes y 48 h después; solo conteos):
  - `sync.reconcile.failed` por clase de mensaje y día. Se espera una caída de más del 90 %.
  - Cantidad de `sync.reconcile.ok` y de `sync.reconcile.partial` por tabla y código.
  - Tasa de 5xx de `PUT /sync`.
  - **Solo lectura en BD:** expedientes cuyo `user_id` difiere del creador según el workflow (se espera 0, sin cambio), duplicados por `(user_id, workspace_id, prospect_code)` (sin cambio) y filas con `workspace_id` nulo (0).
- **Criterios de corte** (rollback inmediato):
  - Sube la tasa de 5xx.
  - Aparece cualquier duplicado nuevo o reasignación de dueño.
  - Aparece una clase de error nueva sin explicar.
  - `failed` no baja en 48 h, aunque esto último no obliga a rollback: obliga a parar y diagnosticar.

### Tramo 2: web (después, con el tramo 1 estable)

- **Contenido:**
  - Cabecera `X-Sync-Protocol: 2` y fusión de la respuesta parcial.
  - Indicador de "pendientes sin subir".
  - Backoff (punto 5).
  - Guardar las ids normalizadas antes del `PUT`.
  - No hacer `PUT` con la clave legacy.
- **Deploy:** web-only con backup de `web-dist` y `SHA.txt`, y ROLLBACK copiando el backup.
- **Métrica:** intentos de `PUT /sync` por usuario y día; se espera bajar de unos 700 a un número de un dígito en los usuarios con rechazos permanentes.

### Tramo 3: BD (opcional, por separado; ver e)

## e) Cambios de BD (aparte; **requieren OK explícito, backup y rollback**)

Ninguno es necesario para los tramos 1 y 2. **No se aplican ni forman parte del primer tramo.**

1. **Endurecer el UPDATE de prospects:** `WITH CHECK` con `user_id` sin cambio, o un trigger `BEFORE UPDATE` que rechace el cambio de `user_id` salvo por `service_role`. Cierra en la BD lo que el tramo 1 cierra en la aplicación.
2. **Lo mismo para `workspace_id`** en las tablas del CRM: impedir mover filas entre workspaces por UPDATE.
3. **Índice único `(user_id, workspace_id, prospect_code)`** en `prospects`, si no existe. Antes hay que confirmar con un conteo de solo lectura que hoy no hay duplicados. Respalda en la BD la deduplicación del punto 6.
4. **Confirmar con solo lectura** las claves únicas reales de `goals` (`user_id, year, month` sin `workspace_id`) y de `tool_calculations` (`user_id, prospect_id, tool`). Si `goals` no incluye `workspace_id`, la misma meta mensual se comparte entre workspaces: es una decisión de producto, no de este fix.
5. **No recomendado:** default o trigger de `workspace_id` en INSERT. Escondería el bug y metería filas en un workspace que la sesión no eligió.
