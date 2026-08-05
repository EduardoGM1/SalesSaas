# Parte 4 — Criterio de traducción ES (primer lote)

## Criterio

| Traducir al español | Dejar en inglés |
|---|---|
| Conceptos de negocio Saletse (`createProspect` → `crearExpediente`, sync de usuario) | Vocabulario técnico genérico (`debounce`, `fetch`, `parseBody`, `runService`) |
| Controllers / services de dominio | Utilidades HTTP, middleware, libs de terceros |

## Lote 1 aplicado

| Antes | Después | Archivo |
|---|---|---|
| `pullUserDatabase` | `obtenerBaseDatosUsuario` (+ alias deprecated) | `sync-service.js` |
| `reconcileUserDatabase` | `reconciliarBaseDatosUsuario` (+ alias deprecated) | `sync-service.js` |
| Rutas sync/prospects | Controllers: `obtenerSincronizacion`, `listarExpedientes`, `crearExpediente`, … | `controllers/*` |

Los wrappers en inglés se mantienen temporalmente para no romper imports externos; las rutas nuevas usan los nombres en español vía controllers.

## No traducido en este lote

- `pullAll` / `pullTable` en `packages/shared` (infra sync, alto fan-out; siguiente lote)
- `runService`, `requireAuth`, `parseJsonBody`
- Hooks React / Zustand (`useDbStore`, `saveClient`)
