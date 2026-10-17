# Corte 2 — post money-box

Fecha de corte: post-deploy web **`a81578c`** (money-box módulo 6).  
Solo documentación. Sin iniciar notificaciones/recordatorios en este documento más allá del puntero al inventario.

## 1. Módulos migrados

| # | Módulo | SHA deploy (main) | Ámbito | Archivos movidos (resumen) | Neto producción (aprox.) |
|---|--------|-------------------|--------|----------------------------|--------------------------|
| 1 | **geo-fx** | `054f0ab` | API + web | dominio catalogo/tipo-cambio, servicios, controladores, rutas; web sync FX + provider | ~+291/−219 en `apps/` (piloto) |
| 2 | **moneda** | `4d3c231` (+ smoke `d60c8a4`) | web | `conversion-nucleo`, `moneda-servicio`, normalizar tasa, captura RH | ~+226/−165 |
| 3 | **metas** | `19586a0` | API + web | API CRUD metas; web KPIs / periodo | ~+402/−191 |
| 4 | **vacaciones** | `92e569f` | web | `calculo-vacaciones` + fachada | ~+110/−10 |
| 5a | **survey** dominio | `ba34a70` (merge vía tramos UI) | web | `calculo-survey` + fachada | bajo (1 archivo cálculo) |
| 5b.1–3 | **survey** UI | `ed6b3b0` | web | paneles + `SurveyPage` lazy vía fachada | ~+125/−14 (tramo UI) |
| 5b.4–5 | **survey** i18n + banco | `17066f1` | web | catálogo Discovery, build script, resolve/fallback/banco | ~+1108/−28 (incl. catálogo generado) |
| 5b.6 | **survey** config | `eeb90b9` | web + API | modal/hook/api-client; `survey-questions-service` + rutas GET/PUT | API prod neta ~+43/−16; web move + smoke |
| 6 | **money-box** | `a81578c` | web | `calculo-money-box`, UI calculator/page/panel RH, redirect, fachada | ~+102/−7 prod web (+ docs/smoke); API vacío |

Detalles: `docs/arquitectura/migraciones/{geo-fx,moneda,metas,vacaciones,survey,money-box}.md`.

## 2. Archivos aún fuera de `modulos/` (conteo al SHA `a81578c`)

### Totales bajo `src/`

| App | Fuera de `modulos/` | Dentro de `modulos/` | Total |
|-----|--------------------:|---------------------:|------:|
| Web (`apps/web/src`) | **308** | **49** | 357 |
| API (`apps/api/src`) | **122** | **23** | 145 |

### Contención legacy (carpetas congeladas = baseline CI)

`scripts/architecture/legacy-baseline.json`: **411** archivos (web congelado **298** + API congelado **113**).  
`check-legacy-containment`: OK (411 en disco = 411 baseline, 0 excepciones).

#### Web — carpetas congeladas (298)

| Carpeta | Archivos |
|---------|----------|
| lib | 134 |
| components | 101 |
| pages | 30 |
| hooks | 26 |
| actions | 4 |
| stores | 3 |

*(Además fuera de `modulos/` pero no en baseline: `routes` 2, `layouts` 3 → explican 308 − 298.)*

#### API — carpetas congeladas (113)

| Carpeta | Archivos |
|---------|----------|
| services | 35 |
| lib | 29 |
| routes | 24 |
| controllers | 21 |
| repositories | 4 |

*(middleware 4 + otros bajo `src/` fuera de `modulos/` explican 122 − 113.)*

## 3. Deuda consolidada

| Tema | Dónde | Notas |
|------|-------|-------|
| Sync / outbox / `cloud-persist` / `tool-calculations-api` / `db-store` / `saveBucket` | compartido | Incl. settings `moneyBoxConfig` (money-box PRO) |
| Adaptadores legacy | metas: `lib/calculations/calendar.ts` (si sigue) | Vacaciones: eliminado |
| Survey collab **5b.7** | field ids / realtime en Survey | No iniciado |
| Wrapper i18n Discovery | `scripts/build-survey-discovery-i18n.mjs` | Temporal; reexporta canónico en `modulos/survey/i18n/` |
| Permiso PUT preguntas | `docs/arquitectura/pendiente-permiso-configurar-preguntas.md` | GET sin flag; PUT solo flag `survey`, no `herramientas:survey_configurar_preguntas` |
| Bloqueo campos / 0090 | `docs/arquitectura/pendiente-bloqueo-campos-collab.md` | KNOWN GAP; sin policy broadcast en prod |
| Money-box acoplamiento RH / API config | `rh_money_box_config`, worksheet, flags | Dominio+UI web migrados; API RH y persistencia settings = deuda |
| Paridad permissions | web↔shared | Divergencia documentada en check-shared-parity |
| Recordatorios / notificaciones / OneSignal SW | ver inventario | Módulo 7 — solo inventario |

## 4. Estado de suites (al corte / post-deploy money-box `a81578c`)

| Suite | Estado |
|-------|--------|
| Workflow **Arquitectura** en `a81578c` | **por verificar manualmente en GitHub Actions** (`gh` sin sesión en el deploy; no dar por verde) |
| `verificar:arquitectura:completo` (local) | verde (sesión deploy money-box) |
| `test:security` / `test:web` / money-box / survey / vacaciones / metas / moneda / geo-fx / rh-regalos | verde (local) |
| Smoke UI money-box matriz a/b/c/d + purga | verde en prod |
| Smoke UI Survey config QA + purga | verde en prod |
| Gate collab Survey (prod) | verde (KNOWN GAP bloqueo) |
| Auditoría FX `usdToMxnRate <= 1` (día 3, 2026-10-17) | **0** filas malas |

## 5. Siguiente tramo

**Módulo 7 — recordatorios/notificaciones:** inventario en `docs/arquitectura/migraciones/notificaciones-inventario.md` (sin mover código).
