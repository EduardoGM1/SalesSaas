# Parte 2 — Candidatos a “custom por tenant” (además de módulos completos)

Basado en el modelo real ya documentado y el código.

| Área | Estado hoy | Recomendación |
|---|---|---|
| **Módulos UI completos** | Flags globales + paquetes por empresa | Extender con `tipo=custom` + `modulo_custom_datos` (hecho en 0067) |
| **Reglas de comisión por sala** | Mencionadas en negocio; no hay tabla genérica | Candidato fuerte: JSONB en `workspaces.settings` o `modulo_custom_datos` con `punto_extension` propio futuro `sala.comisiones` |
| **Campos extra en prospects / workflows** | Columnas fijas en SQL | Usar `modulo_custom_datos.entidad_relacionada_id = prospect_id` + schema_ui — **evitar** ALTER TABLE por cliente |
| **Terminología de roles (Liner renombrable)** | Ya soportado: roles tenant con `nombre` editable por empresa | No requiere custom modules; documentar en UI Empresas → Acceso |
| **Flujos de aprobación Contratos / bottom line** | Paquete Premium / flags | Mejor como **flag estándar** + reglas; el flujo de estados sí puede ser schema_ui en un módulo custom de contratos si el tenant lo pide |
| **Survey questions** | Ya hay overrides por usuario (`0045`) | Extender overrides por `empresa_id` antes de inventar otro motor |
| **Columnas lista Clientes** | Fijas en UI | Hook `clientes.columna` ya definido en extension-points |

## Puntos de extensión permitidos (código)

Definidos en `apps/web/src/lib/custom-modules/extension-points.js`:

1. `expediente.tab` — pestaña adicional en detalle de expediente  
2. `dashboard.sala.bloque` — bloque en dashboard de sala  
3. `clientes.columna` — columna en lista de Clientes  

**Regla:** un módulo custom nunca modifica pantallas fuera de estos hooks.
