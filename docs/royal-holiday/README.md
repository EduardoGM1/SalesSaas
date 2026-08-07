# Worksheet Royal Holiday — patrón reutilizable

Primer Worksheet custom por empresa. La variante se activa con el flag `worksheet.royal_holiday` (custom, `punto_extension = worksheet.variante`) y lee un **catálogo versionado** en tablas estructuradas (`catalogo_configuracion` + hijas `rh_*`).

## Bootstrap

```bash
node scripts/bootstrap-royal-holiday.mjs
node scripts/seed-royal-holiday-catalog.mjs
npm run rh:flags
# schema:
npm run db:migrate -- 0076
npm run db:migrate -- 0077
```

Empresa de prueba: **Royal Holiday** · Sala: **Sala Royal Holiday** · Gerente: `eduardolalito99@hotmail.com`.

## Herramientas RH (Tools Hub)

Con flag `worksheet.royal_holiday` activo, Tools muestra:

- Worksheet (pestañas Datos Financiamiento / Datos Venta / Resumen / Pre VLO / Worksheet)
- Calculadora B. Lines · Comisiones · Créditos
- Calendario comisiones · Días de descanso
- Administrativo operaciones (`/ops/rh/*`): Premanifiesto, Línea, Resumen, Estadísticos, OKR, Descansos, Propinas

Flags hijos: `rh.tool.*` (semilla `npm run rh:flags`). Configuración de tablas: Admin → empresa → **Catálogo RH**.

## Cómo añadir otra empresa con Worksheet custom

1. Crear empresa/sala desde Admin → Empresas.
2. Crear flag custom `worksheet.<slug>` con `punto_extension = worksheet.variante` y `empresa_id`.
3. Incluir el flag en paquetes de acceso.
4. Sembrar `catalogo_configuracion` v1 (tablas hijas) — se puede clonar el seed Excel o publicar vía API.
5. La UI de Worksheet estándar no cambia; solo entra la variante si el flag está activo en sesión.

## Pendientes (no inventar valores)

| Tema | Estado |
|------|--------|
| Comisiones OPC / posición "X" | Schema listo; sin filas hasta % reales |
| Corte costo admin 15%–27.5% | Seed 15→750 y 27.5→950; UI advierte pendiente |
| Pestañas Resumen / Pre VLO | Placeholders "próxima iteración" |

## APIs

- `GET /api/v1/royal-holiday/:empresaId/catalogo`
- `POST /api/v1/royal-holiday/:empresaId/preview`
- `POST /api/v1/royal-holiday/:empresaId/ventas`
- `GET .../comisiones-movimientos`, `.../dias-descanso`, `.../resumen`, `.../okr`, `.../propinas`
- `GET/POST .../premanifiesto`, `.../linea/asignacion`, `.../linea/rotacion`
- `GET/PUT .../ops-config`
- `GET/POST /api/v1/admin/tenant/empresas/:id/catalogo-rh` (+ `/publish`)
- Cron: `GET/POST /api/v1/cron/rh-extra-dp` (diario 08:15 UTC)

## Caso de prueba de referencia

- 10 000 HC, 15% enganche, FTB → comisión **5.25%**
- Extra DP +10% cumplido → franja 25% FTB **8.5%**, diferencia **3.25%**
- Fecha pago: día 1–15 → 25 mismo mes; 16–31 → 10 mes siguiente
