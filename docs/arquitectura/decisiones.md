# Decisiones de arquitectura

**Fecha:** 2026-10-13  
**Rama de trabajo:** `test/arquitectura-red-seguridad`  
**Base:** `main` @ `d145fee` (auditoría Fase 0 mezclada FF, solo docs)

Estas decisiones quedan fijadas antes de cualquier move de producto. No se mueven ni renombran archivos de producto hasta OK explícito del piloto.

---

## 1. Estructura objetivo

| Decisión | Detalle |
|----------|---------|
| **Arquitectura A** | Módulos verticales con MVC dentro de cada módulo (routes → controllers → services → repositories/lib). |
| **Arquitectura B** | Paso previo **dentro de cada módulo**: extraer dominio puro + tests unitarios antes de mover carpetas. |
| **Orden** | En cada módulo migrado: B (extraer/test) → A (mover a carpeta de módulo). |

## 2. `packages/shared`

Se mantiene como **paquete de dominio compartido** (cálculos RH, sync/mappers, permisos, push paths, validators).  
`npm run sync:shared` sigue siendo el puente web→shared para los archivos del manifiesto; la paridad se verifica en CI (`check-shared-parity`).

## 3. Nombres de producto (UI)

Se mantienen literales de marca / producto visibles al usuario:

- Survey  
- Worksheet  
- Money Box  
- Royal Holiday  

No se “traducen” en UI ni en copy de producto como parte de la migración estructural.

## 4. Glosario expediente / sala

| Concepto actual | UI (usuario) | Dato / dominio interno | Contrato API / BD |
|-----------------|--------------|------------------------|-------------------|
| prospect / client | **expediente** | **prospecto** | `prospect` / columnas existentes |
| workspace (sala de ventas) | sala (cuando se muestre) | **sala** | **`workspace`** solo en API/BD |

Deep links, `PushType`, paths HTTP y columnas SQL **no** se renombran en esta fase.

## 5. Alcance de migración

Orden de la auditoría Fase 0 (`docs/arquitectura/auditoria-fase0.md` §8):

| Etapa | Módulos |
|-------|---------|
| **Inicial** | **1–9** (geo/FX → moneda → goals/metas → vacaciones → reminders/notifications → survey → money box → agenda → ventas) |
| **Segunda** | **10–14** (expediente/sharing → Royal Holiday → sync/storage → admin/RBAC → auth/session/PWA) |

## 6. Fase 1 — red de seguridad (esta rama)

Solo red de seguridad. **Sin** moves/renames de producto, **sin** deploy, **sin** merge a `main` hasta OK.

Entregables:

1. Límites entre capas (fetch en componentes + imports prohibidos) con allowlist temporal.  
2. Instantánea de `import()` lazy (lazy-pages, client-detail, sidebar prefetch).  
3. Contratos sintéticos `tool_calculations.data` / money-box.  
4. PushType → deep links → rutas.  
5. Paridad web↔shared (`sync:shared`).  
6. Baseline en `docs/arquitectura/baseline-fase1.md`.  
7. Comando `npm run verificar:arquitectura`.

## 7. Allowlist temporal de `fetch` en componentes

Documentada en `scripts/architecture/allowlist-component-fetch.json` y revisada por `check-layer-boundaries`.  
**Regla CI:** fallar si aparece un `fetch(` en `apps/web/src/components/**` fuera de la allowlist.  
Reducir la allowlist es bienvenido; ampliarla requiere justificación en PR.

## 7b. Contención legacy y fachadas (post módulos 1–4)

Ver `docs/arquitectura/contencion-y-fachadas.md`.

- **Contención:** no crecer `components`/`lib`/`pages`/`hooks`/`actions`/`stores` (web) ni `routes`/`controllers`/`services`/`repositories`/`lib` (API); baseline en `legacy-baseline.json`; excepciones en `legacy-containment-exceptions.json`.
- **Fachadas:** cada `modulos/<nombre>/index` es el único contrato de import entre módulos / UI legacy.
- Checks: `check-legacy-containment`, `check-module-facades` (en `verificar:arquitectura:checks` + workflow).

## 8. sync:shared (paridad)

- Manifiesto: `scripts/architecture/sync-shared-files.json`.
- `permissions` web↔shared queda **divergente a propósito** (web: `labelKey`+i18n; shared/API: labels string) hasta extraer catálogo sin UI.
- `sync.js` / `validators.js` viven solo en shared (no hay fuente web en el manifiesto).
- `locale-calendar.js` entra al manifiesto porque `format/dates` lo requiere.
