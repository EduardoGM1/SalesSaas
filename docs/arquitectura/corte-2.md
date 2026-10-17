# Corte 2 — post survey 5b.6

Fecha de corte: post-deploy API+web **`eeb90b9`** (survey config preguntas).  
Sin iniciar money-box en este documento (solo inventario de deuda). Solo documentación.

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

Detalles: `docs/arquitectura/migraciones/{geo-fx,moneda,metas,vacaciones,survey}.md`.

## 2. Archivos aún fuera de `modulos/` (conteo al corte `eeb90b9`)

### Web (`apps/web/src`) — **310** fuera / **43** dentro (total 353)

| Carpeta | Archivos |
|---------|----------|
| lib | 135 |
| components | 104 |
| pages | 30 |
| hooks | 26 |
| actions / layouts / routes / stores | ~13 |

### API (`apps/api/src`) — **122** fuera / **23** dentro (total 145)

| Carpeta | Archivos |
|---------|----------|
| services | 35 |
| lib | 29 |
| routes | 24 |
| controllers | 21 |
| repositories / middleware | 8 |

## 3. Deuda consolidada

| Tema | Dónde | Notas |
|------|-------|-------|
| Sync / outbox / `cloud-persist` / `tool-calculations-api` / `db-store` / `saveBucket` | compartido | Fuera de módulos tools; no migrar en money-box salvo deuda explícita |
| Adaptadores legacy | metas: `lib/calculations/calendar.ts` (si sigue) | Vacaciones: eliminado |
| Survey collab **5b.7** | field ids / realtime en Survey | No iniciado |
| Wrapper i18n Discovery | `scripts/build-survey-discovery-i18n.mjs` | Temporal; reexporta canónico en `modulos/survey/i18n/` |
| Permiso PUT preguntas | `docs/arquitectura/pendiente-permiso-configurar-preguntas.md` | GET sin flag; PUT solo flag `survey`, no `herramientas:survey_configurar_preguntas` |
| Bloqueo campos / 0090 | `docs/arquitectura/pendiente-bloqueo-campos-collab.md` | KNOWN GAP; sin policy broadcast en prod |
| Money-box / worksheet RH | aún en `components/calculators` + `lib/calculations` | Siguiente módulo (6) |
| Paridad permissions | web↔shared | Divergencia documentada en check-shared-parity |

## 4. Estado de suites (al corte / post-deploy 5b.6)

| Suite | Estado |
|-------|--------|
| Workflow **Arquitectura** en `eeb90b9` | verde |
| `verificar:arquitectura:checks` + build CI | verde (sesión 5b.6) |
| `test:security` (incl. mvc + caracterización questions-config) | verde |
| `test:web` / `test:survey` / vacaciones / metas / moneda / geo-fx / rh-regalos | verde |
| Smoke UI Survey config QA + purga (`survey_preguntas_usuario=0`) | verde en prod |
| Gate collab Survey (prod) | verde (KNOWN GAP bloqueo) |
| Auditoría FX `usdToMxnRate <= 1` (día 3, 2026-10-17) | **0** filas malas |

## 5. Siguiente tramo (fuera de este doc)

**Módulo 6 — money-box** en rama `arquitectura/modulo-money-box`: dominio/cálculo + UI tool; no renombrar contratos; persistencia compartida = deuda; sin BD.
