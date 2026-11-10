# Caracterización — Ventas Tramo C (antes de mover la API)

Paths sin cambio: `GET/POST /api/v1/sales`, `GET/PATCH/DELETE /api/v1/sales/:id`.

| Verbo | Permiso | Respuesta |
|-------|---------|-----------|
| GET lista | `sales:history` | `{ data, total, limit, offset }`. Filtra workspace; sin `teamScope` también `user_id` |
| POST | `ventas:registrar` | 201 `{ data }`. 400 si faltan `prospect_id` y fecha. 403 `WORKSPACE_PERMISSION_DENIED` sin el permiso |
| GET uno | `sales:view_detail` | 400 si el id no es uuid. 404 «Venta no encontrada.» |
| PATCH | `ventas:editar` | Siempre filtra `user_id`. `status=cancelada` llama `handleCancelacionVenta` |
| DELETE | `ventas:cancelar` | `{ ok: true }`. Otro dueño: 404 |

El listado pide `SALE_LIST_COLUMNS` y `prospects(name, name1, prospect_code)`. No usa `select("*")`. `bodyToSaleInsert`, `saleToPatch` y `SALE_LIST_COLUMNS` se quedan en shared y en `patch-whitelist`.
