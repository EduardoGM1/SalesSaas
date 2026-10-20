# Agenda Tramo C — caracterización API (antes del move)

**Tip base:** `main` tras Tramo A (`7966148`).

## Consumidores de los archivos a mover

| Archivo | Lo importa |
|---------|------------|
| `apps/api/src/routes/calendar.js` | `apps/api/src/routes/v1.js` (`calendarRouter`) |
| `apps/api/src/controllers/calendar-controller.js` | solo `routes/calendar.js` |
| `apps/api/src/services/calendar-service.js` | solo el controlador |
| `apps/api/src/repositories/calendar-repository.js` | solo el servicio |

Nadie más importa esos cuatro paths. `packages/shared` (`dbToRows`, `normalizeIds`, `sync.js`) no se mueve: la alta por `PUT /sync` sigue exigiendo `expedientes:editar` ahí (deuda del Tramo 2 de sync).

## Contrato HTTP observado

| Método | Path | Sin token | Con sesión |
|--------|------|-----------|------------|
| GET/POST | `/api/v1/calendar-entries` | 401 o 503 | ver servicio |
| GET/PATCH/DELETE | `/api/v1/calendar-entries/:id` | 401 o 503 | ver servicio |

Envoltorios de ruta (no cambian en el move): POST/GET/PATCH `wrap: "data"` (POST 201); DELETE `wrap: "ok"` → `{ ok: true }`.

## Servicio (códigos reales, no 422)

| Caso | Código | Mensaje |
|------|--------|---------|
| Sin `type` o fecha | **400** | `type y entry_date/date son requeridos.` |
| Id no UUID | **400** | `ID inválido.` |
| Sin workspace activo | **403** | `Workspace activo requerido.` |
| No encontrada / otro dueño u otro workspace | **404** | `Entrada no encontrada.` |
| `expedientes:editar` | **no se consulta en REST** | el permiso está en `sync.js` para el insert del reconcile |

Lectura: filtra `workspace_id`; sin `teamScope` también `user_id`. Escritura (PATCH/DELETE): siempre `user_id` del actor + `workspace_id`, aunque haya `teamScope`.

Alta válida: `bodyToCalInsert` conserva `type`, `entry_date`, `kind`, `source`, `user_id`, `workspace_id`.
