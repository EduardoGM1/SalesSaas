# Baseline E2E (fallos conocidos en `main`)

**Estado:** baseline congelada para deploys de arquitectura.  
**Regla de deploy:** workflow **Arquitectura** en VERDE + E2E con exactamente este conjunto de fallos (ninguno nuevo, ningún spec adicional en rojo).  
**Última verificación local (bisect worktree, `CI=true`, sin `PLAYWRIGHT_BASE_URL`):** 2026-10-18.

## Contexto

El job CI `.github/workflows/e2e.yml` corre `npm run test:e2e` (suite completa Playwright).  
El gate local `verificar:arquitectura:completo` solo ejecuta `e2e/smoke.spec.js` cuando hay stack local — **no** es la suite de CI.

Historial público de Actions en `main`: **ningún run E2E en verde** al menos desde `ac75b5d` (2026-10-10). Los 18 fallos son **preexistentes** (reproducidos en `eeb90b9`, `a81578c`, `503928f`; ver matriz abajo).

## Los 18 tests fallidos (identidad estable)

Clave de comparación = `archivo:línea › título` (viewport incluido cuando aplica).

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

Primer SHA donde aparece cada fallo del conjunto: **ya en `eeb90b9`** (anterior a Tramo B y Etapa 2). No es regresión de `503928f` / `aab2714`.  
Comparación automatizada: `npm run e2e:comparar-baseline -- --strict-missing <log|json>` → exit 0 en los cuatro SHAs.

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

## Saneamiento (Etapa 5 — propuesta, sin aplicar)

Ver sección en el reporte de incidente / corte posterior. Clasificación tentativa:

| Grupo | Hipótesis | Clase |
|-------|-----------|-------|
| agenda-entry-modal | `readCalDay` espera `db.cal[YYYY-MM].days[d]` en `sts4_v1`; UI muestra texto pero shape/key distinta | (b) semilla/clave almacenamiento |
| money-box-routing sala RH | tab gated por `useFlag(worksheet.royal_holiday.money_box)` + `hasCatalog`; mock sesión vs workspace | (b) flags/semilla CI |
| rh-pm / flyback / rh-tables | `rh-pm-page` / worksheet RH no montan (gate flags / ruta / seed) | (a)/(b) UI+entorno |
| video-corrections | botón «Editar datos» / cards Survey no visibles con seed mínimo | (a)/(b) UI+semilla |
