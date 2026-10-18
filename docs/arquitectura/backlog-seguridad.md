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

**Hipótesis:** `dbToRows` (`packages/shared/src/data/mappers.js`) estampa `user_id = userId` en **todos** los clientes del blob local. Fuera de `teamScope`, `reconcile` no filtra por dueño: si el blob contiene expedientes ajenos (sala, otro workspace activo antes del cambio, o un perfil borrado con outbox pendiente), el upsert intenta reescribir una fila ajena con `user_id` propio y RLS lo rechaza. El blob puede quedar reintentando (outbox).  
**Fix propuesto (sin aplicar):** filtrar en `reconcile` por expedientes del usuario/workspace activo también fuera de `teamScope`, y descartar del outbox las filas rechazadas por RLS en vez de reintentarlas. No es regresión de este rollout.

## 3. `/health` de la API devuelve `commit: null`

`apps/api/src/app.js` lee `VERCEL_GIT_COMMIT_SHA || VITE_BUILD_ID`; en el VPS (pm2) ninguna existe. El SHA desplegado solo se puede verificar con `git rev-parse` en `/var/www/Saletse`.  
**Fix propuesto:** que el deploy API exporte `API_BUILD_ID=<sha>` en el entorno de pm2 (o escriba `build-id.txt`) y que `/health` lo lea. Cambio de app + deploy: requiere OK.
