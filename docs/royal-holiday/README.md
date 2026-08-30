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

- Worksheet (pestañas Datos Financiamiento / Datos Venta / **Money Box**¹ / Resumen / Pre VLO / Worksheet)
- Calculadora B. Lines · Comisiones · Créditos
- Calendario comisiones · Días de descanso
- Administrativo operaciones (`/ops/rh/*`): Premanifiesto, Línea, Resumen, Estadísticos, OKR, Descansos, Propinas

¹ Pestaña **Money Box RH** (`worksheet.royal_holiday.money_box`, hijo de RH). Réplica funcional del Money Box PRO (motor PMT en `money-box.ts`); planes y restricciones por empresa en `rh_money_box_config` (API `GET/PUT .../money-box-config`). **No** lee catálogo RH ni datos del expediente. Edición de planes: Admin → empresa → Catálogo RH → **Money Box — Planes de financiamiento**. Migraciones: `0085` (flag), `0086` (tabla config). Smoke: `node scripts/verify-rh-money-box-pmt.mjs`.

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
| Comisiones OPC / posición "X" | Schema listo; sin filas hasta % en Excel |
| Corte costo admin 15%–27.5% | **Confirmado:** 15%→750, 27.5%→950 (`rh_costo_administrativo`) |
| Fuente Excel canonical | Hojas dedicadas — ver [CATALOGO-EXCEL-FUENTE.md](./CATALOGO-EXCEL-FUENTE.md) |
| Extra DP 90 días | Implementado: validación fecha + forfeit (`RH_EXTRA_DP_PLAZO_DIAS`) |
| Pestaña Money Box RH | MVP: por enganche, monto contrato, paridad con Datos Financiamiento |
| Pestañas Resumen / Pre VLO | Placeholders "próxima iteración" |
| Premanifiesto Fase 1 (backend) | Migración `0087`: olas, flags, RPCs, RLS. Smoke: `node scripts/verify-rh-premanifiesto-fase1.mjs`. CSI capacitación: [PREMANIFIESTO-CSI-CAPACITACION.md](./PREMANIFIESTO-CSI-CAPACITACION.md). UI Fase 2 pendiente revisión. |

## APIs

- `GET /api/v1/royal-holiday/:empresaId/catalogo`
- `POST /api/v1/royal-holiday/:empresaId/preview`
- `POST /api/v1/royal-holiday/:empresaId/ventas`
- `GET .../comisiones-movimientos`, `.../dias-descanso`, `.../resumen`, `.../okr`, `.../propinas`
- `GET/POST .../premanifiesto` (compat), endpoints Fase 1 Premanifiesto:
  - `GET .../premanifiesto/dia?workspaceId=&fecha=` — calendario + olas + entradas (CSI condicional)
  - `GET .../premanifiesto/cupos?workspaceId=&fecha=` — resumen cupos por ola
  - `POST .../premanifiesto/registrar` — pareja con enforcement cupo (`409` si `PM_CUPO_LLENO`)
  - `POST .../premanifiesto/:rowId/tomar-caso` — rep toma caso
  - `PATCH .../premanifiesto/:rowId` — actualización controlada (comercial bloqueado, CSI gated)
- `GET/PUT /api/v1/admin/tenant/empresas/:id/premanifiesto-olas` — config olas (Admin → Catálogo RH)
- `GET/POST .../linea/asignacion`, `.../linea/rotacion`
- `GET/PUT .../ops-config`
- `GET/POST /api/v1/admin/tenant/empresas/:id/catalogo-rh` (+ `/publish`)
- Cron: `GET/POST /api/v1/cron/rh-extra-dp` (diario 08:15 UTC)

## Caso de prueba de referencia

- 10 000 HC, 15% enganche, FTB → comisión **5.25%**
- Extra DP +10% cumplido → franja 25% FTB **8.5%**, diferencia **3.25%**
- Fecha pago: día 1–15 → 25 mismo mes; 16–31 → 10 mes siguiente
