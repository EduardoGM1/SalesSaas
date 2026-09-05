# Hallazgos de limpieza — resuelto 2026-09-02

Registro de lo que se **limpió** y lo que se **dejó a propósito** para no romper flujos. El pase original está en el historial git de este archivo.

---

## Hecho (sin quitar capacidad real)

1. **Pipeline de workflow** — Rutas `POST …/advance|send-review|review` (410) y `workflow-service.js` eliminados. GET/assign de participantes **siguen**. Claves `workflow:*` **siguen** (el API de participantes las usa).
2. **Pestañas Resumen / Pre VLO** — Quitadas del Worksheet RH. Un bucket con `rhTab` viejo cae a la primera pestaña visible.
3. **`menuHidden`** — Rama muerta en `nav-config.js`.
4. **Rutas Admin CRM legacy** — **Se mantienen** (`AdminLegacyRedirect`). No son archivos muertos; evitan 404 de URLs antiguas.
5. **Eliminar en lista Clientes** — Misma regla que la ficha: personal, o gerente en sala. El API ya 403 al liner de sala.
6. **`LINER_DEFAULT_PERMISSIONS`** — Nombre canónico. `VENDEDOR_DEFAULT_PERMISSIONS` queda como alias deprecado.
7. **Catálogo `GET /api/v1`** — Incluye `cron.rhExtraDp` y un índice `royalHoliday`.
8. **Hub RH** — Título «Herramientas Royal Holiday». Rutas `/tools/rh/*` y `/ops/rh/*` usan `RhToolFlagGate` (Premanifiesto sigue con su gate de lectura).
9. **OKR** — Copy «OKR de sala»; no implica Dashboard `/goals`.
10. **Scripts `_diag-*` / `_debug-*` / `_test-superadmin-leak.mjs`** — One-shots de diagnóstico; no formaban parte del producto.

Archivos muertos retirados: `apps/api/src/services/workflow-service.js`, `apps/web/src/lib/workflow-api.js`, alias `workflowApi` / `ProspectWorkflowPanel`.

---

## Dejado (no era código muerto, o cambiarlo sí altera el producto)

| Ítem | Por qué se dejó |
|------|-----------------|
| **Analysis** | Página, flag `analysis` y permiso `herramientas:analysis` existen. No está en el hub; se llega por URL. Quitarla borra una herramienta. |
| **Claves de catálogo que no ocultan botones** (`expedientes:crear`, `ventas:cancelar`, …) | El API las aplica. Esconder todos los botones sería un recorte de UX, no limpieza de archivos. |
| **Admin para Gerente** (`ver_resumen`) | Comportamiento actual de `/admin/me`. |
| **`cloudOnly`** | Sigue distinguiendo «hay Supabase». |
| **Puestos `asistente_*`** | Semilla de producto (delegación). |
| **Liner RH vs Liner genérico** | Bootstrap RH añade flags a propósito. |
| **CSI / Premanifiesto** | Acceso por flags; el doc de capacitación ya lo dice. |

---

Si reaparece un placeholder o un stub 410, no reintroducirlo: o se implementa o no se muestra.
