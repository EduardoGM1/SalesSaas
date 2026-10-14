# Contención legacy y fachadas de módulo

**Rama:** `arquitectura/contencion-y-fachadas`  
**Objetivo:** congelar el crecimiento de carpetas legacy y obligar a que el código nuevo viva en `modulos/`, con imports cruzados solo por fachada pública.

## Contención (CI)

Carpetas congeladas (lista base en `scripts/architecture/legacy-baseline.json`):

| App | Carpetas |
|-----|----------|
| web | `components`, `lib`, `pages`, `hooks`, `actions`, `stores` |
| API | `routes`, `controllers`, `services`, `repositories`, `lib` |

**Regla:** un archivo **nuevo** en esas carpetas que no esté en la lista base → fallo de `check-legacy-containment` (parte de `verificar:arquitectura:checks` y de `architecture.yml`).

- La lista base **solo puede encogerse** (al migrar a `modulos/`). Actualízala en el mismo PR de migración.
- **Nunca** amplíes la baseline para “acomodar” código nuevo: ponlo en `apps/*/src/modulos/<nombre>/`.

### Excepción justificada

1. Abre PR con el archivo bajo legacy **solo** si no hay alternativa razonable en un módulo.
2. Añade entrada en `scripts/architecture/legacy-containment-exceptions.json`:

```json
{
  "files": [
    { "file": "apps/web/src/lib/ejemplo-//justificado.ts", "reason": "…" }
  ]
}
```

3. `reason` es obligatoria. CI sigue fallando si falta.

## Fachadas

Cada módulo migrado expone un archivo de entrada en la raíz del módulo.  
**Regla:** un archivo fuera del módulo (u otro módulo) solo importa esa fachada (`@/modulos/<nombre>` o `../modulos/<nombre>`), nunca `dominio/`, `servicios/`, `rutas/`, etc.

Check: `scripts/architecture/check-module-facades.mjs`.

### Convención de nombres

| Contexto | Archivo | Por qué |
|----------|---------|---------|
| **Web (Vite)** | `index.ts` (o `index.js` si el módulo es solo JS) | Vite resuelve `@/modulos/<nombre>` → `index.*`. Preferir **`.ts`** cuando hay tipos. |
| **API (Node ESM)** | `index.js` | Node no resuelve directorios a `index` sin extensión; el montaje (`routes/v1.js`) importa `../modulos/<nombre>/index.js`. |
| **Node sin bundler (web)** | `fachada-node.js` | Solo si un `.js` del árbol web se carga con `node` (p. ej. tests de `settings-scope`) y necesita un export del módulo. **No** llamar a este archivo `index.js`: Vite prioriza `index.js` sobre `index.ts` y el build de producción falla (caso moneda / consolidación). |

| Módulo | Web | API |
|--------|-----|-----|
| geo-fx | `index.js` | `index.js` |
| moneda | `index.ts` + `fachada-node.js` | — |
| metas | `index.ts` | `index.js` |
| vacaciones | `index.ts` | — |
| survey (5a) | `index.ts` | — (preguntas API = deuda 5b) |

Dentro del mismo módulo, los paths internos siguen permitidos (p. ej. `captura` → `servicios`).

### Build en CI

`npm run build:web:ci` (Vite con `VITE_*` placeholder) corre en `verificar:arquitectura:completo` y en `architecture.yml` para atrapar roturas de fachada/import antes del deploy.
## Cómo crear un módulo nuevo

Plantilla (español en carpetas internas; contratos HTTP/BD sin renombrar):

```
apps/web/src/modulos/<nombre>/
  index.ts          # fachada pública (obligatoria)
  dominio/          # puro, sin I/O
  servicios/        # orquestación / adaptadores
  (api|captura|proveedores|…)  # según necesidad

apps/api/src/modulos/<nombre>/   # si hay API
  index.js          # fachada (exporta routers, etc.)
  dominio/
  servicios/
  repositorio/
  controladores/
  rutas/
```

Pasos:

1. Caracterización / tests del dominio.
2. Extraer lógica pura → `dominio/`.
3. Mover a `modulos/<nombre>/` (`git mv`); exports públicos solo en `index`.
4. Actualizar consumidores para importar la fachada.
5. Reducir `legacy-baseline.json` si salieron archivos de carpetas congeladas.
6. `npm run verificar:arquitectura:checks` + suites del módulo.

## test:security

Vive en el workspace API:

```bash
npm run test:security -w @salesapp/api
# alias raíz (añadido en consolidación):
npm run test:security
```

Cubre unitarios: `app.security`, `security-lib`, `rate-limit`, `patch-whitelist`, workspace-scope, prospect-edit-access, mvc-contract, caches RH/workspace.  
La Fase 1 (`baseline-fase1.md`) reportó **PASS** con ese comando de workspace; el raíz no tenía el script hasta este tramo.  
También corre dentro de `verificar:arquitectura:completo` y en `architecture.yml`.
