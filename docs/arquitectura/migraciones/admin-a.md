# Admin / RBAC — Tramo A (UI web)

**Estado:** en curso (rama `arquitectura/admin-tramo-a`).

## Alcance

Páginas y componentes admin del web → `apps/web/src/modulos/admin/` con fachadas `paginas.js`, `seccion.js`, `fachada-node.js`, `fachada-ui.js` y shims legacy en `pages/admin`, `hooks`, `lib/admin`, `layouts/AdminSection`.

## Fuera de alcance

- API admin / RBAC (Tramo C)
- Auth login / sesión / PWA (módulo 14)
- Cambios al catálogo `packages/shared/src/auth/*`

## Verificación

- Caracterización: `admin-ui.caracterizacion.test.mjs`
- Guard: `check-admin-shared-guard.mjs`
- `npm run test:web` + `verificar:arquitectura` (checks 1–5) antes de deploy web
