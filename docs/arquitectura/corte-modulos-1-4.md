# Corte intermedio — módulos 1–4

Fecha de corte: post-deploy web del módulo **vacaciones**.  
Sin iniciar módulo 5. Solo documentación.

## 1. Módulos migrados

| # | Módulo | SHA deploy (main) | Ámbito | Archivos movidos (resumen) | Neto producción (aprox.) |
|---|--------|-------------------|--------|----------------------------|--------------------------|
| 1 | **geo-fx** | `054f0ab` | API + web | API: catalogo/tipo-cambio + rutas; web: sync FX + provider | ~piloto completo (dominio+servicios+controladores+rutas) |
| 2 | **moneda** | `4d3c231` (+ smoke fix `d60c8a4`) | web | `conversion-nucleo`, `moneda-servicio`, normalizar tasa, captura RH | Bajo: extracción + imports UI |
| 3 | **metas** | `19586a0` | API + web | API: metas CRUD; web: KPIs + semanas tablero | Medio: API move + dominio web |
| 4 | **vacaciones** | `92e569f` | web | `calculo-vacaciones.ts`; UI no movida | ~+13/−9 código app (sin adaptador legacy; aliases EN eliminados) |

Detalles por módulo: `docs/arquitectura/migraciones/{geo-fx,moneda,metas,vacaciones}.md`.

## 2. Deuda abierta consolidada

| Tema | Dónde | Notas |
|------|-------|-------|
| Sync / outbox / `cloud-persist` / `tool-calculations-api` / `db-store` | compartido | No migrado en vacaciones ni tools; FK smoke requiere `seed-prospect` en QA personal |
| Adaptadores legacy | metas: `lib/calculations/calendar.ts` | Vacaciones: **eliminado** (sin consumidores) |
| Dependencias entre módulos | ventas → vacaciones | `sale-detail-modal.jsx` importa `calcularVacaciones` de `dominio/`; al migrar Ventas → interfaz pública |
| Moneda ↔ tools | vacaciones/survey/worksheet | Captura FX vía `modulos/moneda`; UI tools aún en `components/calculators/` |
| Paridad permissions | web↔shared | Divergencia documentada en check-shared-parity |
| UI tools sin move | vacaciones, survey, worksheet | Solo dominio/cálculo migrado donde aplica |

## 3. Estado de verificación (al corte)

Re-ejecutar en el working tree final antes del commit de vacaciones (valores del reporte de sesión):

| Suite | Estado esperado |
|-------|-----------------|
| `verificar:arquitectura:completo` | verde (checks 1–5 + verify local + e2e smoke) |
| `test:vacaciones` | verde |
| `test:metas` / `test:moneda` / `test:geo-fx` / `test:rh-regalos` | verde |
| `test:web` / `test:security` | verde |
| Smoke UI QA vacaciones + purga `tool_calculations=0` | verde (post-deploy en prod URL) |

## 4. Archivos aún fuera de `modulos/` (aprox., sin tests)

### Web (`apps/web/src`) — **326** fuera / **13** dentro

| Carpeta | Archivos |
|---------|----------|
| lib | 139 |
| components | 112 |
| pages | 30 |
| hooks | 27 |
| actions / layouts / routes / stores / styles / root | ~18 |

### API (`apps/api/src`) — **111** fuera / **16** dentro

| Carpeta | Archivos |
|---------|----------|
| services | 32 |
| routes | 24 |
| lib | 24 |
| controllers | 21 |
| repositories / middleware / root | ~10 |

## 5. Propuesta siguiente tramo (sin ejecutar)

### Opción A — Survey + money box (tools)

- **Pros:** mismo patrón que vacaciones (dominio puro + contratos `tool_calculations`); fixture survey/money-box ya en Fase 1.
- **Riesgos:** money box acoplado a worksheet RH y permisos empresa; survey tiene configuración de preguntas + shared/collab; más superficie UI sin mover aún.
- **Mitigación:** caracterización + contratos primero; no tocar sync; UI queda hasta tramo UI.

### Opción B — Consolidar (deuda + interfaces públicas)

- **Pros:** elimina adaptador calendar/metas; publica API de vacaciones para ventas; reduce imports cruzados `dominio/` desde fuera.
- **Riesgos:** poco “avance de módulo” visible; tentación de tocar sync (prohibido en este tramo).
- **Mitigación:** PR pequeño solo adaptadores + `modulos/*/index` exports.

**Recomendación:** un sprint corto de **consolidación (B)** antes de survey/money-box (A), para no acumular aliases/paths internos; luego survey (más acotado que money box RH).
