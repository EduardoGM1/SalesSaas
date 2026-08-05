# Checklist manual: Sync PWA ↔ Desktop

Tras deploy de Outbox durable + NetworkOnly sync. Misma cuenta, mismo workspace.

## Precondiciones

- [ ] Build desplegado con Workbox NetworkOnly en `/api/v1/sync` y `/api/v1/prospects`
- [ ] PWA y Desktop en el **mismo workspace** (Personal o misma sala)
- [ ] DevTools → Application → Cache Storage: no debe servir GET sync desde `api-cache`

## Caso 1 — Create Desktop → PWA

1. Desktop: crear expediente en Clientes.
2. Network: `POST /api/v1/prospects` 201 y/o `PUT /api/v1/sync` 200.
3. PWA (primer plano o al volver): el expediente aparece sin reinstalación.

**Esperado:** visible en PWA en segundos (Realtime) o al volver a la app.

## Caso 2 — Create PWA → Desktop

1. PWA: crear expediente.
2. Network: `POST /api/v1/prospects` 201.
3. Desktop → Clientes: aparece (Realtime o al entrar a Clientes).

**Esperado:** visible en Desktop; chip “Pendiente” desaparece tras sync.

## Caso 3 — Survey Desktop → PWA

1. Desktop: editar Survey de un expediente y guardar.
2. `PUT /api/v1/sync` 200.
3. PWA: abrir el mismo expediente → Survey actualizado.

## Caso 4 — Proyección / tools PWA → Desktop

1. PWA: editar Vacaciones o Worksheet y guardar.
2. Tras sync, Desktop refleja los mismos valores.

## Caso 5 — Offline PWA → online

1. PWA: modo avión / offline.
2. Crear expediente + completar Survey (+ Vacaciones/Worksheet si aplica).
3. Chip “Offline” / “Pendiente” visible.
4. Recuperar red; esperar toast de rescate o chip “Sync…”.
5. Desktop: todos los datos presentes; sin duplicados del mismo `id`.

## Kill mid-edit (Outbox)

1. PWA online: editar Survey.
2. Cerrar app antes de ~1.2s (antes del debounce) o matar proceso.
3. Reabrir PWA con red.
4. Outbox (`sts4_outbound_v1`) fuerza PUT; Desktop converge.

## Workspace cruzado

1. Desktop en Personal; PWA cambia a una sala.
2. Al volver a Desktop: toast “Workspace actualizado…” y datos de la sala (no mezcla).

## Resultado de esta implementación

Validación automatizada e2e multi-dispositivo no está en CI; este checklist es la aceptación de Fase E.
Código listo para los 5 casos; ejecutar manualmente en staging/prod tras deploy.
