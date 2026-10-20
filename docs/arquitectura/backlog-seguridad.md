# Backlog de seguridad (registrado 2026-10-18)

Consultas solo lectura sobre producción; conteos agregados, sin ids ni emails. Excluye cuentas QA `@saletse-test.com`.

## 1. Miembros del workspace acceden a los canales de todos los expedientes del workspace

**Modelo:** `user_can_access_prospect` (0052) concede acceso si el usuario es miembro del workspace del expediente (`user_in_workspace`). La rama de `prospect_shares` también exige membresía, y `createShare` solo permite compartir con miembros del mismo workspace. Consecuencia: cualquier miembro (incluido un "invitado" agregado para compartir) puede suscribirse a `expediente:{uuid}` de **cualquier** expediente del workspace, no solo los compartidos. Con 0098 también podría emitir `field_lock` en ellos. **No se cambia** en este plan.

Evidencia: diagnóstico efímero del canario — B como invitado (`seed-collab-share`) logra SUBSCRIBED en P1 compartido; en el incidente 0090 ya se observó lo mismo en P2 no compartido.

| Métrica (prod, sin QA) | Valor |
|------------------------|------:|
| Workspaces `personal` / `sala_de_venta` | 3 / 1 |
| Workspaces con más de 1 miembro | 1 (sala) |
| Miembros no dueños con acceso a expedientes ajenos | 2 |
| Expedientes alcanzables por miembros no dueños | 1 |
| Pares miembro × expediente ajeno sin share explícito | 2 |
| Workspaces personales con invitados | 0 |
| Shares reales (`prospect_shares`) | 0 |

**Exposición actual:** mínima (1 sala, 1 expediente). Crece linealmente con miembros × expedientes por sala.  
**Opciones (requieren OK):** separar "ver ficha" de "unirse al canal" (predicado de canal basado en dueño / share / rol de sala explícito), o aceptar el modelo de sala como frontera de confianza y documentarlo como tal.

## 2. `sync.reconcile.failed` con errores de RLS (preexistente, multiusuario)

Ruta: `PUT /api/v1/sync` → `reconciliarBaseDatosUsuario` → `reconcile` (`packages/shared/src/data/sync.js`).

| Mensaje (normalizado) | Eventos | Usuarios | Rango |
|-----------------------|--------:|---------:|-------|
| `upsert calendar_entries` RLS (USING) | 6456 | 4 | 09-09 → 09-27 |
| `delete prospects`: historial del workflow inmutable | 964 | 2 | 09-09 → 09-26 |
| `upsert sales` RLS (USING) | 653 | 2 | 09-26 → 10-01 |
| `upsert prospects` RLS | 274 | 22 | 09-22 → 10-18 |
| `upsert calendar_entries` RLS (WITH CHECK) | 72 | 1 | 10-10 → 10-11 |
| `upsert goals` RLS | 15 | 3 | 10-14 |
| otros (null / FK) | 2 | 2 | septiembre |

Perfil de los 22 usuarios con `upsert prospects` RLS: **19 ya no tienen perfil** (cuentas borradas; compatible con QA purgadas a mitad de sync), **3 vigentes**: los 3 en sala y en más de un workspace, 2 ven expedientes ajenos de su workspace, 0 gerentes, 0 reciben shares. Volumen por usuario: 13 con 1–9 eventos, 9 con 10–99 (máx. 78).

**Hipótesis inicial:** `dbToRows` estampa `user_id = userId` en todas las filas del blob y el upsert reescribe filas ajenas. Ver § 2.1: se **confirma** para calendario y ventas y se **descarta** para prospects.

### 2.1 Diagnóstico solo lectura (2026-10-18)

Fuentes: logs pm2 de la API (`sync.reconcile.failed/ok`, `sync.pull.ok`), código de `reconcile`/`dbToRows`, `pg_policies` y conteos en BD dentro de `begin read only … rollback`, simulando el JWT de cada usuario para las funciones de permiso. Usuarios etiquetados V1–V3; sin ids ni emails.

**Cómo leer los mensajes de Postgres en un upsert (`INSERT … ON CONFLICT DO UPDATE`):**

- `… (USING expression)`: la fila **ya existe** y no pasa el `USING` de UPDATE. En `calendar_entries` y `sales`, eso es `user_id = uid AND permiso de editar en el workspace de la fila`.
- Mensaje RLS **sin** "USING": falla el `WITH CHECK` de INSERT, que Postgres evalúa sobre la fila **propuesta** antes de detectar el conflicto.
  - **Corrección (18-10):** esto **no** prueba que la fila no exista. Una fila ya guardada enviada sin `workspace_id` da el mismo error.
  - Por tanto, la "Causa" de prospects de abajo y la conclusión de que V2 y V3 tenían expedientes fuera de la nube eran incorrectas. Ver `sync-fix-diseno.md` §0 (regresión `9f2b5ac`) y §c (verificación de V2/V3).

**Hechos de código:**

1. `dbToRows(db, userId)` no fija `workspace_id` en ninguna fila, y ni `reconcile` ni la BD lo rellenan (sin default ni trigger). Todo INSERT por `PUT /sync` llega con `workspace_id` nulo y el `WITH CHECK` lo rechaza siempre. La BD tiene 0 filas con `workspace_id` nulo en `calendar_entries`, `prospects` y `sales`. **Una fila que solo existe en el cliente no puede subir por `PUT /sync`**: solo por las rutas REST por entidad (`POST /calendar-entries`, etc.), que sí toman el workspace de la sesión.
2. `dbToRows` estampa `user_id = userId` **antes** de que `reconcile` filtre en `teamScope` por `r.user_id === userId`, así que ese filtro no excluye nada. Las filas de equipo bajadas por un gerente o miembro con `ver_equipo` se reenvían como propias.
3. `reconcile` es secuencial (prospects → sales → calendar → activities → goals → tools → borrados) y aborta en el primer error. Un fallo en `prospects` bloquea todo el resto del `PUT /sync` de ese usuario.

**calendar_entries (4 usuarios):** 2 ya no tienen perfil (cuentas borradas; 5 y 2.495 eventos). Los 2 vigentes:

| Usuario | Tipo | Eventos | Días | Rango | ¿Hubo `reconcile.ok` después? |
|---------|------|--------:|-----:|-------|-------------------------------|
| V1 | USING (fila existente) | 2.140 | 3 | 09-24 → 09-26 | sí, hasta 10-02 |
| V1 | INSERT (fila nueva) | 72 | 2 | 10-10 → 10-11 | **no**: último ok 10-02, último pull 10-11 |
| V2 | USING (fila existente) | 1.816 | 5 | 09-09 → 09-25 | sí (23 ok en la ventana; último 10-12) |

- **Filas distintas:** el log no registra ids de fila, así que el número exacto no se puede medir en el servidor. Por categoría hay al menos 1. Unos 700 eventos por día y usuario corresponden al reintento automático del outbox, con el mismo blob reenviado.
- **Política que rechaza:** `calendar_update_tenant_role` (USING). V2 tiene `ver_equipo` en la sala, así que el mecanismo está explicado por el hecho 2: filas ajenas de equipo reenviadas con `user_id` propio. Hoy ve 1 fila ajena de calendario; es una cota del estado actual, no de septiembre. V1 no tiene `ver_equipo` y hoy posee 0 filas de calendario: el origen de su USING de septiembre no es reconstruible con el estado actual.
- **¿Llegan por otra vía?** Las entradas de V1 que fallaron por INSERT (10-10/11) **no están en la nube**: posee 0 filas de calendario y no hubo `reconcile.ok` después. La vía REST funciona en general: V3 tiene una entrada de calendario creada el 10-18 por REST.

**prospects (22 usuarios):** 19 sin perfil, con el patrón de las cuentas QA de los smokes: expediente creado sin conexión, 1 tombstone y purga. Los 3 vigentes:

| Usuario | Eventos (INSERT) | Días | Rango | Último `reconcile.ok` | Último fallo |
|---------|-----------------:|-----:|-------|-----------------------|--------------|
| V1 | 2 | 1 | 09-22 | 10-02 | 10-11 (calendario) |
| V2 | 8 | 3 | 09-22 → 10-18 | 10-12 | **10-18** |
| V3 | 78 | 5 | 09-26 → 10-18 | 10-13 | **10-18** |

- **Causa:** todos son errores sin "USING", es decir, ruta INSERT. El blob contiene expedientes que **no existen en la BD** y el INSERT falla por el `workspace_id` nulo. Esto **descarta** la hipótesis `dbToRows`/`teamScope` para prospects: una fila ajena existe en la BD y daría error de UPDATE, no de INSERT.
- **Riesgo derivado (no observado):** la política UPDATE de prospects acepta `ver_equipo` o un rol de workflow, y su `WITH CHECK` solo exige ser miembro. Un miembro con `ver_equipo` que reenvía un expediente ajeno no recibe error y **cambia el `user_id` a sí mismo**. En los 3 vigentes hay 0 expedientes propios con representante distinto, así que no hay evidencia de que haya ocurrido. Exposición actual: 1 expediente ajeno visible.
- **Filas distintas:** al menos 1 por usuario; el número exacto no es observable en el servidor. V2 y V3 tienen hoy 1 expediente propio cada uno.
- **sales** (V2 463 eventos, V3 190, 09-26 → 10-01, USING): mismo mecanismo que el calendario (hecho 2).
- **`delete prospects`, historial del workflow inmutable** (V1 901, V2 63): borrados pendientes de expedientes con historial de workflow. Van en el último paso, sin efecto sobre el resto.

**¿Solo reintentos o hay datos fuera de la nube?** Las dos cosas:

- **Volumen:** casi todo es reintento del outbox: 6.456 + 974 eventos para un puñado de filas.
- **Datos fuera de la nube:**
  - **V1:** entradas de calendario nuevas (al menos 1) que no están en la nube.
  - **V2 y V3:** al menos 1 expediente cada uno que no está en la nube, y sus `PUT /sync` **fallan en el primer paso desde el 10-12 y el 10-13**. Todo lo que no suba por REST (borrados explícitos, tools en lote, goals) está bloqueado.
- **Recuento exacto:** solo es posible leyendo el outbox/blob local de cada uno (cliente), no en el servidor.

### 2.2 Plan de arreglo (deuda de sync/persistencia — SIN ejecutar)

1. **No reescribir propiedad:** `dbToRows` conserva el `user_id`/`workspace_id` de origen de cada fila (de `rowsToDb`); `reconcile` filtra por dueño real **antes** de estampar, en cualquier alcance, no solo en `teamScope`.
2. **Inserción posible por el `PUT /sync`:** las filas nuevas llevan `workspace_id` = workspace activo de la sesión. Separar "insertar nuevas" de "actualizar propias".
3. **Aislar fallos:** un error RLS en una tabla o fila no aborta el resto del reconcile (como `upsertToolsBestEffort`). Registrar por tabla el conteo de filas rechazadas (sin ids) para medir filas distintas.
4. **Outbox:** backoff y tope ante el mismo error RLS repetido, en vez de ~700 reintentos al día. Marcar las filas como "pendiente sin subir" visible para el usuario y reintentarlas por la ruta REST.
5. **Recuperación de V1–V3:** diagnóstico en el cliente, solo lectura y con consentimiento, que cuente las filas locales ausentes en la nube; después, reenvío por REST.
6. **Endurecer UPDATE de prospects (requiere OK de BD):** impedir el cambio de `user_id` en UPDATE (trigger o `WITH CHECK` con `user_id` sin cambio) para cerrar el riesgo de reasignación.

No es regresión del rollout actual; el patrón existe desde septiembre.

## 3. `/health` de la API devuelve `commit: null`

`apps/api/src/app.js` lee `VERCEL_GIT_COMMIT_SHA || VITE_BUILD_ID`; en el VPS (pm2) ninguna existe. El SHA desplegado solo se puede verificar con `git rev-parse` en `/var/www/Saletse`.  
**Fix propuesto (sin ejecutar):**

1. En el deploy API, tras `git checkout <sha>`, escribir `git rev-parse HEAD > /var/www/Saletse/SHA.txt`. El mismo patrón ya se usa en los backups (`SHA.txt`).
2. `/health` lee, en orden: `API_BUILD_ID` (env de pm2) → `SHA.txt` en la raíz del repo, leído una vez al arrancar → `VERCEL_GIT_COMMIT_SHA`/`VITE_BUILD_ID` → `null`.
3. Smoke del deploy: `curl :4000/health` debe devolver el SHA desplegado; si no coincide, se para.

Cambio de app + deploy: requiere OK.

**Estado:** implementado en la rama `arquitectura/health-commit-comparador`, sin merge ni deploy (viaja con el próximo deploy de la API):

- `resolveBuildCommit` en `apps/api/src/app.js`, con test en `app.security.test.mjs`.
- `scripts/vps-deploy-api.py` escribe `SHA.txt` y para si `/health` no coincide con él.
- `/SHA.txt` está en `.gitignore`.

Hasta ese deploy, `/health` del VPS sigue devolviendo `commit: null`.

## 4. Comparador E2E: lectura de logs de texto multilínea

`scripts/architecture/e2e-comparar-baseline.mjs`, `fromTextLog`: el lookahead del regex termina en `$` **sin** flag `m`, de modo que `$` solo casa al final de todo el texto. Con el resumen del CI ("Playwright Run Summary" como texto de varias líneas, o un log redirigido con saltos de línea reales) no extrae ningún fallo y sale con código 2. Hoy se compara con el reporte JSON (que sí funciona) o a mano.

**Fix propuesto (sin ejecutar):** añadir el flag `m` al regex (o cortar el título en `\r?\n`), y un test con un resumen real de CI de varias líneas y con un log `list` en UTF-8 y UTF-16. Solo tooling de CI.

**Estado:** implementado en `arquitectura/health-commit-comparador`:

- Flag `m` en el regex.
- `e2e-comparar-baseline.test.mjs` usa el resumen real del CI de `68003a1` (18 fallos) y el de `8b59907` (1 fallo), con LF, CRLF y UTF-16, y prueba el CLI de punta a punta.
- El test está enganchado a `verificar:arquitectura:checks`, que también corre en el CI de Arquitectura.

**Precisión medida:** sin el flag, el regex pierde solo el **último** fallo de cada bloque: los anteriores sí casan, porque el lookahead `\s+e2e` toma la línea siguiente. Con el resumen de 18 fallos saca 17, y con el de 1 fallo no saca ninguno. Por eso un fallo nuevo en última posición podía pasar como "sin fallos nuevos".

## 5. `PUT /sync` exige `expedientes:editar` para `calendar_entries`; el REST de calendario no

Hallazgo previo, caracterizado en el Tramo C de agenda y **sin corregir**. La decisión queda para el Tramo 2 de sync, para cambiar los dos lados juntos. No forma parte del inventario ni de los tramos de ventas.

| Lado | Qué exige |
|------|-----------|
| `PUT /sync` | `SYNC_INSERT_PERMISSIONS.calendar_entries` = `expedientes:editar` en [`packages/shared/src/data/sync.js`](../../packages/shared/src/data/sync.js) |
| REST `/api/v1/calendar-entries` | Sesión y workspace activo. No llama a `requireWorkspacePermission`. 403 si no hay workspace; 404 si la fila no es del actor o del workspace |

Tests que fijan el contrato actual (mismos nombres antes y después del move): «REST de agenda no aplica expedientes:editar» y «deuda sync: alta de calendar_entries exige expedientes:editar en sync.js», en [`apps/api/src/modulos/agenda/servicios/entradas-agenda-servicio.caracterizacion.test.mjs`](../../apps/api/src/modulos/agenda/servicios/entradas-agenda-servicio.caracterizacion.test.mjs).

Un usuario con sesión y workspace puede crear o editar entradas por REST aunque no tenga `expedientes:editar`. El mismo alta por `PUT /sync` se rechaza. Alinearlos (subir el REST o bajar el sync) cambia quién puede escribir agenda. Por eso no se toca aquí.

## 6. `findCalEntries` adelanta un mes la fecha de agenda de una venta

Hallazgo de solo lectura del 2026-10-20. No es regresión del Tramo B de ventas. El web `b48c729` se desplegó con el bug presente a propósito.

**Estado:** corregido en `3acb234` y desplegado solo en el web. `findCalEntries` usa el mes de la clave tal cual. El conteo de filas con el mes desplazado, repetido justo antes del deploy, seguía en 0, así que no hubo reparación de datos. Smoke de QA: una venta del 2026-10-20 y otra del 2026-12-20 quedan en ese mes en `calendar_entries` antes y después de cancelar.

`calKey` (`apps/web/src/lib/format/dates.ts`, líneas 32-33) guarda el mes de calendario (`month + 1` sobre el índice 0). Antes del fix, `findCalEntries` (`apps/web/src/lib/cloud-persist.js`) volvía a sumar 1: una clave `2026-10` salía como `entry_date` `2026-11-20`. La única llamada es `persistSaleBundle`, programada por `scheduleSaleBundle` desde `notifySaleRegistered` y `notifySaleUpdated` (`apps/web/src/lib/cloud-persist-bridge.js`, líneas 43-50), que `db-store.ts` dispara al registrar (línea 518) y al actualizar (línea 554). El mapper de sync (`apps/web/src/lib/data/mappers.ts`, línea 419) arma `entry_date` con la clave tal cual, sin el segundo +1. Gana el camino que llega último.

`git blame` de la línea 255 apunta a `d60c8a4` (2026-10-13). Ese commit es la raíz del repositorio: el `+1` llegó con el árbol inicial y esta historia no tiene un padre que lo haya introducido después.

Una clave de diciembre (`2026-12`) produce `2026-13-DD`. `calendar_entries.entry_date` es `date`: ese valor no se puede guardar. El alta REST devolvería 400. El camino de sync seguiría pudiendo escribir diciembre.

Consulta en transacción de solo lectura, sin ids ni emails. Cohortes: QA = correo `@saletse-test.com`; ghost = sin fila en `profiles`; real = el resto.

| Métrica | Valor |
|---------|------:|
| Filas `calendar_entries` con `type=venta` | 0 |
| De esas, con mes distinto al de `sales.sale_date` | 0 (QA 0, real 0, ghost 0) |
| Igual, cualquier `type` enlazado a una venta | 0 |
| Filas `type=venta` sin `sale_id` | 0 |
| Usuarios reales con una fila de venta desplazada | 0 |
| Primera fila real afectada | ninguna |
| Ventas en la tabla | 1 (real, mes 2026-09) |
| Ventas de diciembre | 0 |
| Esa venta de septiembre, filas de agenda enlazadas | 0 |
| Agenda por tipo | `follow` 5, `nota` 1, `venta` 0, `descanso` 0 |
| `follow` / `nota` / `descanso` con `sale_id` | 0 / 0 / 0 |
| `entry_date` de mes inválido en la tabla | 0 (el tipo `date` no lo admite) |

Logs de los últimos 30 días (desde 2026-09-20), sin cuerpos ni identificadores:

| Fuente | Resultado |
|--------|-----------|
| nginx `POST /api/v1/calendar-entries` 400 | 16 |
| nginx `PUT /api/v1/sync` 400 | 1 |
| nginx 422 en esas rutas | 0 |
| Log de la API con `invalid input syntax for type date`, `entry_date` o `month must` | 0 líneas |

Los 16 de calendario y el 1 de sync no se pueden atribuir a una fecha de diciembre: el log de la API no guarda el motivo. No hay ventas de diciembre en la tabla que se hayan podido perder por el mes 13.

`findCalEntries` solo mira entradas cuyo `saleId` coincide. Notas, descansos y seguimientos que entran por `notifyCalEntryAdded` (`cloud-persist-bridge.js`, líneas 75-81) calculan la fecha con el índice de mes en base 0 y no pasan por esta función. En la tabla actual ninguna nota, follow ni descanso tiene `sale_id`, así que el paquete de la venta tampoco las alcanzó.

**Reparación de datos:** hoy el conteo previo es 0. No hay `UPDATE` que aplicar. El SQL de abajo queda propuesto y sin ejecutar hasta un OK explícito.

Verificación previa (esperado hoy: 0 filas):

```sql
BEGIN;
SET TRANSACTION READ ONLY;
SELECT
  (
    (EXTRACT(YEAR FROM c.entry_date)::int * 12 + EXTRACT(MONTH FROM c.entry_date)::int)
    - (EXTRACT(YEAR FROM s.sale_date)::int * 12 + EXTRACT(MONTH FROM s.sale_date)::int)
  ) AS month_delta,
  count(*)
FROM public.calendar_entries c
JOIN public.sales s ON s.id = c.sale_id
WHERE date_trunc('month', c.entry_date) <> date_trunc('month', s.sale_date)
GROUP BY 1;
ROLLBACK;
```

Reparación, solo si ese conteo es el que se aprobó. Conserva el día y no toca un día que no existe en el mes de la venta. Backup lógico de `calendar_entries` y `sales` antes del `COMMIT`. Si no se ha hecho `COMMIT`, el rollback es `ROLLBACK`. Si ya se aplicó, restaurar esas tablas desde el backup.

```sql
BEGIN;
UPDATE public.calendar_entries c
SET entry_date = make_date(
  EXTRACT(YEAR FROM s.sale_date)::int,
  EXTRACT(MONTH FROM s.sale_date)::int,
  EXTRACT(DAY FROM c.entry_date)::int
)
FROM public.sales s
WHERE s.id = c.sale_id
  AND date_trunc('month', c.entry_date) <> date_trunc('month', s.sale_date)
  AND EXTRACT(DAY FROM c.entry_date)::int
      <= EXTRACT(DAY FROM (date_trunc('month', s.sale_date) + interval '1 month - 1 day'))::int;
-- Esperado hoy: UPDATE 0. COMMIT solo con OK.
ROLLBACK;
```
