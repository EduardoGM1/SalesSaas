# Baseline E2E (fallos conocidos en `main`)

**Estado:** baseline reducida de 18 a **1** fallo tras el saneamiento de la Etapa 5 (rama `arquitectura/e2e-saneamiento`). La baseline solo puede encoger.  
**Regla de deploy:** workflow **Arquitectura** en VERDE + E2E sin fallos fuera de este conjunto (ninguno nuevo, ningún spec adicional en rojo).  
**Última verificación local (suite completa, `CI=true`, `npm run test:e2e` equivalente):** 2026-10-18 — 153 passed, 5 skipped, 1 failed (el de la baseline).

## Baseline 0 en `arquitectura/fix-sub-moneybox`

En esa rama el fallo de abajo está corregido (código de app, ver [`deploy-fix-sub-moneybox.md`](./deploy-fix-sub-moneybox.md)) y `e2e-baseline-failures.json` queda vacío: suite completa local `CI=true` = 154 passed, 5 skipped, 0 failed. Hasta que esa rama se fusione, en `main` rige la baseline de 1.

## Fallo vigente en `main` (1)

| # | Spec | Título | Clase |
|---|------|--------|-------|
| 1 | `e2e/money-box-routing.spec.js:48` | Money Box — expediente y rutas › sala RH: pestaña Money Box en worksheet embebido | **(c) app** — deep link |

El spec abre `/clients/:id?tab=worksheet&sub=moneybox`. La pestaña "Money Box" aparece en la bandeja del expediente, pero al montar el worksheet la URL se reescribe a `sub=financiamiento` y el panel Money Box queda oculto. Pulsando la pestaña sí se muestra (verificado). Hipótesis: el efecto de fallback de `worksheet-royal-holiday-page.jsx` (`visibleTabs` sin `moneybox` → `onTabChange(fallback)`) corre antes de que el flag `worksheet.royal_holiday.money_box` esté disponible. Arreglarlo exige código de app: **no aplicado** (fuera del alcance e2e/CI). El spec no se cambió a "click en la pestaña" porque eso ocultaría la regresión del deep link.

## Los 18 tests fallidos originales (histórico)

## Contexto

El job CI `.github/workflows/e2e.yml` corre `npm run test:e2e` (suite completa Playwright).  
El gate local `verificar:arquitectura:completo` solo ejecuta `e2e/smoke.spec.js` cuando hay stack local — **no** es la suite de CI.

Historial público de Actions en `main`: **ningún run E2E en verde** al menos desde `ac75b5d` (2026-10-10). Los 18 fallos son **preexistentes** (reproducidos en `eeb90b9`, `a81578c`, `503928f`; ver matriz abajo).

## Los 18 tests fallidos (identidad estable)

Clave de comparación = `archivo:línea › título` (viewport incluido cuando aplica). Las líneas son las de antes del saneamiento.

| # | Spec | Título |
|---|------|--------|
| 1 | `e2e/agenda-entry-modal.spec.js:108` | Agenda — modal de alta › Notas del usuario: Guardar visible con texto, persiste y sobrevive recarga |
| 2 | `e2e/agenda-entry-modal.spec.js:142` | Agenda — modal de alta › Descanso y No tour no guardan al seleccionar; Guardar persiste |
| 3 | `e2e/money-box-routing.spec.js:48` | Money Box — expediente y rutas › sala RH: pestaña Money Box en worksheet embebido |
| 4 | `e2e/rh-flyback-carga.spec.js:136` | RH Flyback — carga dual › ambas casillas quedan marcadas y Bono sigue excluyente |
| 5 | `e2e/rh-pm-form-layout.spec.js:110` | Premanifiesto form — responsive layout › labels e inputs apilados sin superposición en móvil |
| 6 | `e2e/rh-pm-form-layout.spec.js:133` | Premanifiesto day panel — card spacing › olas y entries con separación vertical clara |
| 7 | `e2e/rh-pm-form-layout.spec.js:158` | Premanifiesto day panel — card spacing › clic en un día no crea pestaña Día y mantiene el calendario |
| 8 | `e2e/rh-pm-form-layout.spec.js:175` | Premanifiesto OPC — modal de cupo › cupo libre abre modal sin salir de Premanifiesto y cerrar no navega |
| 9 | `e2e/rh-pm-form-layout.spec.js:221` | Premanifiesto OPC — modal de cupo › todas las olas con cupo muestran botón + y el de OLA 2 abre el mismo modal |
| 10 | `e2e/rh-tables-mobile.spec.js:187` | RH tablas móviles › Membresías y escenarios @ mobile-se (320px) |
| 11 | `e2e/rh-tables-mobile.spec.js:187` | RH tablas móviles › Membresías y escenarios @ mobile-14 (390px) |
| 12 | `e2e/rh-tables-mobile.spec.js:187` | RH tablas móviles › Membresías y escenarios @ mobile-lg (430px) |
| 13 | `e2e/rh-tables-mobile.spec.js:187` | RH tablas móviles › Membresías y escenarios @ tablet (768px) |
| 14 | `e2e/video-corrections.spec.js:20` | PDF Correcciones Video — funcionalidad › Cambio 1: guardar datos del prospecto persiste y sincroniza Survey |
| 15 | `e2e/video-corrections.spec.js:57` | PDF Correcciones Video — funcionalidad › Cambio 3: editar datos sin avisos informativos obsoletos |
| 16 | `e2e/video-corrections.spec.js:69` | PDF Correcciones Video — funcionalidad › Cambio 4: totales de vacaciones sin depender del año |
| 17 | `e2e/video-corrections.spec.js:97` | PDF Correcciones Video — responsive móvil › Cambio 2: Country y City apilados en Editar datos sin overflow |
| 18 | `e2e/video-corrections.spec.js:123` | PDF Correcciones Video — responsive móvil › Survey móvil: País y Ciudad apilados sin solapamiento |

Lista máquina: `scripts/architecture/e2e-baseline-failures.json`.

## SHAs verificados (bisect local, mismos 6 specs)

| SHA | Rol | Fallidos | Resultado vs baseline |
|-----|-----|----------|------------------------|
| `eeb90b9` | baseline survey-config / pre money-box tip docs | 18 | = baseline |
| `a81578c` | money-box deploy | 18 | = baseline (idéntico) |
| `503928f` | Tramo B notificaciones | 18 | = baseline (idéntico) |
| `aab2714` | Etapa 2 permiso PUT (+ merge Tramo B) | 18 | = baseline (CI run 39080994089 + compare script) |
| `fe26b10` | locks cliente + docs baseline | 18 | = baseline (CI Arquitectura verde + compare) |

Primer SHA donde aparece cada fallo del conjunto: **ya en `eeb90b9`** (anterior a Tramo B y Etapa 2). No es regresión de `503928f` / `aab2714` / `fe26b10`.  
Comparación automatizada: `npm run e2e:comparar-baseline -- --strict-missing <log|json>` → exit 0 en los SHAs de la matriz.

## Cómo comparar

```bash
# Tras un run Playwright (JSON reporter o log con summary):
node scripts/architecture/e2e-comparar-baseline.mjs path/al/resultado.json
# o:
npm run test:e2e -- --reporter=json 2>e2e-report.json
node scripts/architecture/e2e-comparar-baseline.mjs e2e-report.json
```

El script **falla (exit 1)** si:

1. Hay un test fallido cuya clave no está en la baseline, o  
2. Falta algún fallido de la baseline (opcional vía `--strict-missing`; por defecto solo bloquea **fallos nuevos**).

También acepta un log de texto con líneas `file.spec.js:LINE:COL › título` (reporter github/list).

## Saneamiento aplicado (Etapa 5)

Solo se tocaron `e2e/` y `scripts/architecture/` (comparador). Cero cambios de código de app.

| Fallos | Causa real | Arreglo |
|--------|------------|---------|
| agenda ×2 | Spec leía la clave plana `sts4_v1`; la app usa schema 2 `sts4_v1:{workspace}` | `readCalDay` usa `readStoredDb` (clave namespaced) |
| video-corrections ×5, rh-tables ×4, flyback (y hoja-firmas, que ya pasaba, por consistencia) | La semilla escribía `sts4_v1` plano; sin `workspace_activo_id` en la sesión mock la app lo deja en `legacy_pending` y el cliente no carga | `seed-local-db.js`: semilla schema 2 (`sts4_schema`, `sts4_active_workspace`, `sts4_v1:{ws}`, `sts4_account`) + sesión con workspace; opción `workspaceId` |
| rh-tables ×4, flyback, money-box | El worksheet pide `/catalogo?prospectId=…` (0224158) y el glob `**/catalogo` no casa con query | Glob `**/catalogo**` |
| video-corrections Survey (Cambio 1, 4, móvil) | Sin flag `survey` el gate redirige a `/tools` | Opción `flags` en `mockAuthenticatedSession` (solo si se pasa; sin ella sigue el modo legacy) + flags `survey.*` |
| video-corrections Cambio 3 | El ethic-box "Código ético" es intencional (b82f928, posterior al spec) | Se exige que exista y contenga "Código ético"; los avisos obsoletos siguen prohibidos |
| video-corrections Cambio 4 | La tarjeta "Últimas 3 vacaciones" vive en la pestaña "Gastos de viaje" y el tabpanel también es `.card` | Pulsar la pestaña + `.card:not(.disc-tab-panel)` |
| video-corrections móvil | "Datos del prospecto" está colapsada a menos de 769px | Expandir la tarjeta antes de "Editar datos" |
| rh-pm ×5 | `RhToolFlagGate` exige `worksheet.royal_holiday`; además selectores ambiguos ("Confirmar invitación", título "Nueva pareja — OLA 2") | Flag en los mocks + selectores acotados a `opc-expediente-tabs` / título del modal |
| money-box | Pestañas del worksheet embebido migraron a la bandeja del expediente (4703d65) | Selector `navigation "Pestañas worksheet"` → queda el fallo (c) descrito arriba |

Comparador: `fromJsonReport` ahora arma la clave igual que la baseline (ruta desde la raíz del repo, título con los `describe`) y cuenta como fallo solo `status: "unexpected"` (un flaky que pasa en el retry no bloquea, igual que el exit code de Playwright).

## Clasificación previa (propuesta original)

Ningún fallo del conjunto se clasifica como **(c) regresión real de app con impacto en usuarios** atribuible a Tramo B / Etapa 2 / locks: el set entero ya falla en `eeb90b9`.

| # | Spec | Clase | Evidencia / arreglo propuesto |
|---|------|-------|-------------------------------|
| 1–2 | `agenda-entry-modal` :108,:142 | **(b)** clave almacenamiento | Spec lee `localStorage.getItem("sts4_v1")`; app usa schema 2 `sts4_v1:{workspaceId}` (`apps/web/src/lib/storage/keys.ts`). **Fix:** `readCalDay` → leer clave namespaced (o helper de e2e). |
| 3 | `money-box-routing` :48 sala RH | **(b)** flags/semilla CI | Mock de session + catálogo; tab embebido depende de flags RH + montaje worksheet. **Fix:** alinear mock/`seedLocalDatabase`/rutas con gate real del worksheet. |
| 4 | `rh-flyback-carga` :136 | **(b)** entorno RH | Worksheet RH + flags; casillas flyback. **Fix:** flags + seed `worksheet.rh*` en helper CI. |
| 5–9 | `rh-pm-form-layout` (5) | **(a)/(b)** UI+entorno | Espera `[data-testid=rh-pm-page]` / layout móvil; falla si página no monta o markup cambió. **Fix:** confirmar selector/testid actual; si UI OK, mock flags ops RH en workflow. |
| 10–13 | `rh-tables-mobile` :187 ×4 | **(b)** flags/viewport | Membresías/escenarios RH en viewports. **Fix:** mismos flags/semilla que RH ops; no es regresión de producto reciente. |
| 14–16 | `video-corrections` :20,:57,:69 | **(a)/(b)** UI+semilla | Espera botón `/Editar datos/i` y cards Survey; i18n sigue teniendo la cadena, pero seed/ruta puede no exponer el CTA. **Fix:** actualizar spec a selector estable (`exp.prospect.edit` / testid) + seed cliente completo. |
| 17–18 | `video-corrections` móvil :97,:123 | **(a)/(b)** layout+semilla | Apilado Country/City; depende de que el modal/Survey monten. **Fix:** tras arreglar 14–16, revalidar geometría; ajustar selectores `.prospect-geo-row` / `#svp-*` si el DOM migró. |

**Orden sugerido de saneamiento (cuando se autorice):** (1) agenda `readCalDay` namespaced — alto ROI, cambio solo e2e; (2) helpers RH flags en workflow/`prepareAuthenticatedPage`; (3) video-corrections selectores. Sin tocar producción.
