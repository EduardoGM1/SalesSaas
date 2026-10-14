# Migración — survey (fase **5a**)

**Rama:** `arquitectura/modulo-survey`  
**Alcance 5a:** dominio/cálculo puro + fachada. Sin merge/deploy hasta OK.  
**API:** no tocada en 5a (solo consumers web del cálculo).

## Inventario real (antes de 5a)

| Grupo | Archivos (aprox. líneas) | 5a |
|-------|--------------------------|----|
| **Dominio/cálculo** | `lib/calculations/survey.ts` (~72) | **movido** |
| **UI** | `survey-page.jsx` (~554) + paneles `survey/*` (~916) | no (deuda 5b) |
| **Config preguntas** | `configure-questions-modal` (~677), `lib/survey/*` resolve/fallback/discovery (~~1141), hook + API client (~119), API `survey-questions-service` (~167) | no (deuda 5b) |
| **i18n** | `i18n-survey-discovery-catalog.js` (~625), script build (~691) | no |
| **Collab / realtime** | usos en `survey-page` + `collab-field` / form-merge (compartido) | no |
| **Persistencia** | `tool_calculations` / `saveBucket` / db-store (compartido) | no |
| **Fixture / tests** | `fixtures/.../survey.json`, `test-survey-calc.mjs` | actualizados |

**Por qué auditoría ~40–60 vs estimación 15–25:** la auditoría sumaba **toda** la superficie Survey+Discovery (UI, banco de preguntas, i18n, API overrides, migraciones SQL, scripts). La estimación 15–25 miraba solo “archivos de módulo a mover” en un tramo completo y **subestimó** discovery/i18n/config. Para **5a** el núcleo real es **1 archivo de cálculo** (+ fachada/tests).

## Estructura 5a

```
apps/web/src/modulos/survey/
  index.ts
  dominio/calculo-survey.ts (+ tests)
```

## Mapeo

| Antes | Después |
|-------|---------|
| `lib/calculations/survey.ts` | `modulos/survey/dominio/calculo-survey.ts` |

| Interno | Nuevo (+ alias) |
|---------|-----------------|
| `computeSurvey` | `calcularSurvey` (+ alias `computeSurvey`) |
| `surveyHasData` | `encuestaTieneDatos` (+ alias `surveyHasData`) |

## Contratos **no** renombrados

- Tool slug `survey`; rutas `/clients/:id/survey`, `/tools/survey`
- Claves `tool_calculations.data` (`total`, `hpct`, `nights`, `sh*`, `sf*`, `stype`, `disc_json`, moneda, …)
- Field ids collab `collabFieldId("survey", …)`
- Fixture `scripts/architecture/fixtures/tool-data/survey.json`
- Flags / permisos / i18n keys de producto
- Rutas API de preguntas (sin tocar en 5a)

## Deuda — fase 5b

- UI paneles + `survey-page` (move / fachada UI)
- Collab / realtime (field ids, events)
- Persistencia compartida (`cloud-persist`, `tool-calculations-api`, `db-store`)
- Configuración de preguntas (`lib/survey/*`, modal, `survey-questions-service`, overrides settings/DB)
- i18n Discovery catalog

## Consumidores 5a (vía fachada)

- `components/calculators/survey-page.jsx`
- `components/calculators/analysis-page.jsx`
- `components/sales/sale-detail-modal.jsx` (Ventas → interfaz pública; al migrar Ventas no importar `dominio/`)

## Reversión

```bash
git checkout main
# o descartar rama arquitectura/modulo-survey
```

## Deploy (cuando OK)

Solo **web** (API diff vacío en 5a).
