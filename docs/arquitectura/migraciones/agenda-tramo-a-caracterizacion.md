# Agenda Tramo A — caracterización (antes del move)

**Tip base:** `ebb35a4` (`main`).  
**Contención vigente:** baseline **394** archivos; en disco en carpetas congeladas **397** (= 394 + 3 excepciones). El reporte del Tramo B “397 / 394” significaba disco/baseline, no un baseline de 396.

## 1. E2E que tocan agenda (nombres)

Deben seguir verdes en el tip (CI `main` / este tramo).

### Dedicados agenda

| Spec | Tests |
|------|-------|
| `e2e/agenda-entry-modal.spec.js` | `Agenda — modal de alta` › inventario: Venta/Follow-up/Notas cliente sin Guardar; el resto con Guardar visible |
| | Notas del usuario: Guardar visible con texto, persiste y sobrevive recarga |
| | Descanso y No tour no guardan al seleccionar; Guardar persiste |
| | Venta / Follow-up / Notas cliente: Crear nuevo cliente abre el alta con tourDate |
| | Cliente que ya existe usa la misma URL y abre el mismo alta |
| | Guardar no queda recortado en viewport bajo |
| `e2e/clients-agenda-intent.spec.js` | `Clientes — intent desde Agenda` › sin query params no abre el alta |
| | from=agenda con tourDate válido abre el alta precargada y Cancelar no reabre |
| | from=agenda sin tourDate no rompe ni abre el alta |
| | from=agenda con tourDate malformado no rompe ni abre el alta |

### Tocan `calendar_entries` / sync egress

| Spec | Tests relevantes |
|------|------------------|
| `e2e/egress-realtime-idle.spec.js` | un cambio en calendar_entries no pide /sync ni las otras tablas |
| `e2e/egress-payload.spec.js` | listados REST de sales/activities/calendar no usan select('*'); GET …/calendar-entries… umbral por fila |

(Otros specs que solo mencionan “calendar” RH / responsive no son gates de este tramo.)

## 2. Escrituras al store por acción (`actions/calendar.js`)

Contratos de entrada local (`db.cal` vía `addCalEntry` / `addCalEntryByDate`). IDs/timestamps variables omitidos en la comparación golden.

| Acción | API store | Shape entrada (`t` / `kind` / campos) | Side effects |
|--------|-----------|--------------------------------------|--------------|
| `saveAgendaUserNote` | `addCalEntry` o `addCalEntryByDate` | `{ t: "nota", ts, note, time? }` — sin `kind` | `addUserActivity` type nota; `scheduleReminderPush` type note |
| `saveAgendaDayOff` | `addCalEntry` | `{ t: "descanso", ts, note: "Día de descanso" }` | — |
| `saveAgendaNoTour` | `addCalEntry` | `{ t: "nota", kind: "no-tour", ts, note, source: "no-tour" }` | — |
| `saveClientNote` (si hay fecha recordatorio) | `addCalEntryByDate` | `{ t: "follow"\|"nota", note, time?, clientId, prospectId, clientName, ts, source: "client-note" }` | `addClientActivity`; push follow-up/note |

**No escribe agenda desde este módulo:** venta / follow desde modal (navegan a clientes); `kind: "procesamiento-venta"` vive en ventas/`db-store`.

## 3. Hooks / puros

| Pieza | Rol | Golden |
|-------|-----|--------|
| `resolveEntryClientId` | Puro: `clientId` → `prospectId` → venta→cliente | `resolve-entry-client.test.mjs` |
| `useCalendarActions` | Solo reexporta las 4 saves (sin lógica) | Test de superficie: claves del hook = `{ saveNoteForClient, saveUserNote, saveDayOff, saveNoTour }` |

## 4. Selectores E2E / UI congelados

No renombrar: `#m-entry`, `#entry-save-btn`, `#e-nota-t`, `#ef-no-tour`, `.cal-grid`, `.cal-day`, `.cal-dn`, `.add-fab`, `.day-group`, `.day-panel`, `.entry-type-seg--grid`, `.seg-btn`, textos i18n `entry.prompt` / tabs.
