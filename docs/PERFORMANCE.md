# Informe de performance y consumo de datos — Saletse

Fecha: julio 2026 · Entorno medido: build Vercel (`saletse.vercel.app`) + código local.

## 1. Diagnóstico (baseline vs optimizado)

### 1.1 Carga inicial (bundle JS/CSS)

| Métrica | Antes | Después | Δ |
|---------|-------|---------|---|
| Chunk principal `index-*.js` | **1 242 KB** (gzip ~359 KB) | **936 KB** (gzip ~270 KB) | **−25 % raw / −25 % gzip** |
| CSS global | 242 KB (gzip 43 KB) | sin cambio | — |
| Recharts (Dashboard/admin) | embebido en `index` | chunk aparte **397 KB** (gzip 117 KB) | solo se descarga al abrir gráficas |
| Precache PWA total | ~2,3 MB (47 entradas) | ~2,1 MB (más chunks pequeños) | menor bloque inicial |

**Pantallas pesadas (chunks lazy, solo al navegar):**

| Ruta | Chunk | Tamaño (gzip) |
|------|-------|---------------|
| Survey | `survey-page-*.js` | 73 KB (~20 KB) |
| Money Box | `money-box-page-*.js` | 17 KB (~5 KB) |
| Client detail | `client-detail-*.js` | 42 KB (~12 KB) |
| Settings | `settings-page-*.js` | 40 KB (~10 KB) |
| Messages / chat | `MessagesPage-*.js` | 16 KB (~5 KB) |
| Admin overview | `AdminOverviewPage-*.js` + `recharts` | 9 KB + 397 KB |

La **Agenda** (`CalendarPage`) sigue en el bundle inicial por ser la ruta `/` — trade-off aceptable para la pantalla de arranque.

### 1.2 Code-splitting

**Ya existía:** calculadoras, panel admin.

**Implementado en esta iteración:** lazy load de Clientes, detalle de expediente, Mensajes, Red, Equipo, Ventas, Settings, Metas, Dashboard de metas, Hub de herramientas, Contacto.

**`manualChunks`:** `recharts`, `lucide-react` (icons), `@dnd-kit`, `@sentry` separados del bundle principal.

### 1.3 Realtime en reposo

Canales activos típicos (usuario logueado, app en primer plano):

| Canal | Tráfico en reposo | Notas |
|-------|-------------------|-------|
| `presence:user:{self}` | heartbeat ~cada 45 s | WebSocket; payload mínimo |
| `presence:user:{peer}` × N contactos | 1 canal/contacto aceptado | **Mayor coste en Red** si hay muchos contactos |
| `dashboard-data:{userId}` | silencioso sin cambios DB | Solo tráfico ante INSERT/UPDATE en prospects/sales/goals/calendar |
| `expediente:{id}` + `expediente-data:{id}` | silencioso sin edición | Solo en detalle de expediente abierto |
| `group-chat:{convId}` | silencioso sin mensajes | Solo en chat de equipo activo |
| `in-app-notifications:{userId}` | silencioso sin eventos | Desktop; varias tablas escuchadas |

**Conclusión:** no hay polling HTTP continuo; el tráfico en reposo es **mantenimiento WebSocket + heartbeats de presencia**. No se observó spam de eventos sin cambios reales en DB. El coste dominante en campo suele ser **N canales de presencia por contacto** en `/network`.

**Implementado:** en conexiones `2g`/`3g`/`saveData`:
- No suscribir presencia de contactos (solo canal propio).
- Heartbeat de presencia cada **120 s** (antes 45 s).
- Dashboard Realtime no arranca con pestaña oculta en red lenta.

### 1.4 Compresión API

- **Vercel edge:** comprime estáticos y respuestas serverless (gzip/brotli) por defecto.
- **Express:** añadido middleware `compression()` para respuestas JSON grandes (`/api/v1/sync`, admin, etc.) en runtime Node.

Verificar en producción:
```bash
curl -sI -H "Accept-Encoding: gzip, br" https://saletse.vercel.app/health
# Esperado: Content-Encoding: br o gzip
```

### 1.5 Over-fetching (sync y API)

| Área | Antes | Después |
|------|-------|---------|
| `pullAll` (sync) | `select('*')` × 6 tablas | columnas explícitas (`sync-columns.js`) |
| `listProspects` | `select('*')` | columnas de listado |
| `getSharedProspect` | prospect + sales + activities `*` | columnas acotadas |

El sync sigue trayendo **tool_calculations.data** completo (JSON de Survey/Worksheet) — necesario para offline; es el mayor payload por expediente.

---

## 2. Optimizaciones aplicadas

### Alto impacto / bajo esfuerzo ✅
1. **Compresión gzip** en Express (`compression` middleware).
2. **Queries acotadas** en sync bulk, listados y expediente compartido.
3. **Avatares:** `loading="lazy"`, `decoding="async"`.

### Alto impacto / esfuerzo medio ✅
4. **Code-splitting** de rutas core + `manualChunks` (recharts, icons, dnd-kit).
5. **Caché de catálogos admin** (`fetch-cache.js`): roles/módulos 15 min, sellers 5 min.
6. **Paginación:** Clientes (50 filas + “Ver más”), Logs admin (50/página server-side).

### Impacto medio ✅
7. **Realtime adaptativo** a red lenta (`connection-profile.js`).
8. **Service Worker:** `StaleWhileRevalidate` para JS/CSS, `CacheFirst` para imágenes de marca (14 días).

---

## 3. Estimación de ahorro por optimización

| Optimización | Ahorro estimado en datos móviles |
|--------------|----------------------------------|
| Code-splitting (carga inicial) | **~90 KB gzip** en primera visita (no descarga Messages/Settings/ClientDetail hasta usarlos) |
| Sync columnas acotadas | **10–30 %** del payload sync según nº de columnas legacy/null en DB |
| Compresión API | **60–80 %** en JSON grande (sync, admin lists) |
| Caché catálogos admin | **Elimina 2–4 requests** por sesión admin (~5–50 KB) |
| Paginación clientes (DOM) | Sin ahorro de red (datos ya en Zustand); **menor memoria/render** |
| Realtime en 3G | **~50–70 %** menos heartbeats + **0 canales peer** en red lenta |
| SW cache-first assets | **Revisitas:** JS/CSS desde disco (~900 KB evitados si no hay deploy nuevo) |

---

## 4. Modo “Ahorro de datos” explícito — ¿siguiente fase?

**Recomendación: sí, pero después de estabilizar lo anterior.**

| Función del toggle | Depende de | Ahorro adicional estimado |
|--------------------|------------|---------------------------|
| Pausar auto-refresh Dashboard | flag + `connection-profile` | Bajo (solo si hay cambios ajenos frecuentes) |
| No precargar adjuntos chat | UI MessagesPage | Medio en salas con muchos archivos |
| Calidad imagen reducida | proxy/CDN o query `?w=` | Medio-alto si hay muchos avatares/adjuntos |
| Desactivar presencia “viendo ahora” | ya parcial en 3G | Bajo-medio |

**Implementación sugerida:** toggle en Configuración → persiste en `profiles.settings.dataSaver` → reutiliza `connection-profile` + flag explícito (independiente de `effectiveType`).

**ROI:** mayor valor para usuarios en **3G/saveData** o planes con tope de GB; estimación global **5–15 %** adicional sobre usuario promedio de sala.

---

## 5. Casos de prueba

### Carga inicial
1. DevTools → Network → Disable cache → Slow 3G → cargar `/`.
2. Verificar que `index-*.js` < 950 KB y que **no** se descargan `MessagesPage`, `settings-page`, `client-detail` hasta navegar.

### Pantallas pesadas
1. Abrir `/clients/:id/survey` → debe cargar `survey-page-*.js` bajo demanda.
2. Abrir `/goals` → debe cargar `recharts-*.js` solo entonces.

### Realtime reposo
1. Abrir `/` con Network → WS filtrado; esperar 2 min sin interactuar.
2. Confirmar frames periódicos de heartbeat (no flood de eventos postgres).

### Compresión API
```bash
curl -sI -H "Accept-Encoding: gzip" https://saletse.vercel.app/api/v1/health
```

---

## 6. Pendientes (fuera de alcance actual)

- Sync paginado / incremental (delta sync) — mayor refactor.
- Server-side paginación de Clientes (hoy datos viven en Zustand post-sync).
- `srcset`/WebP para logos white-label (requiere pipeline de assets).
- Modo ahorro de datos con toggle de usuario.
- Eliminar `prospect-realtime.js` huérfano (código muerto).
