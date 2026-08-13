# Catálogo Royal Holiday — fuente Excel

## Fuente de verdad

El archivo **`Saletse-Royal-Holiday.xlsx`** (hojas BL, Comisiones, Regalos, Worksheet) es la fuente de regalos, BL y comisiones. El archivo **`Configuracion Proyecto.xlsx`** sigue usándose para financiamiento (plazos/tasas) y costo admin.

| Hoja (Saletse) | Tabla destino |
|----------------|----------------|
| `BL - Financiamientos` | `rh_bottom_line` |
| `Comisiones` | `rh_comisiones` |
| `Regalos` + `Worksheet` | `rh_regalos` |

La hoja **`Catalogo proyecto`** del Excel viejo es consolidado de referencia. **No usar** su bloque de financiamiento para seed.

## Reglas de negocio (Excel → código)

| Regla | Constante / función |
|-------|---------------------|
| Extra DP: plazo máximo 90 días para cobrar diferencial | `RH_EXTRA_DP_PLAZO_DIAS`, `extraDpFechaDentroPlazo`, `plazoExtraDpVencido` |
| Cancelación post-activación (~3 meses) | `RH_VENTANA_CANCELACION_DIAS`, `dentroVentanaCancelacion` — **regla distinta** |
| Fecha pago comisión (día 1–15 → 25; 16–30 → 10 mes sig.) | `calcularFechaPagoComision` |
| FTB = Liner + Closer | Validado al publicar catálogo (`validarComisionesFtb`) |
| Costo admin | 750 USD (enganche ≥15%), 950 USD (enganche ≥27.5%) — confirmado |

## Regalos — restricciones JSON

| Regalo | `restricciones` |
|--------|-----------------|
| All inclusive (crédito) / Cert. vuelo | `cantidad_es_monto`, `grupo_tope: ai_vuelo`, `grupo_tope_usd: 1500` |
| Flyback | `venta_minima_usd: 19167.58`, `cantidad_default: 2` |
| Prevelige Member | `venta_minima_hc: 15000`, carga `sin_costo` |
| Move In | `moneda_costo: "MXN"`, costo 4000 |
| Cert. multidestino | costo 0, `activacion_usd: 399` (paga el socio) |
| Bono de créditos | `costo_es_cuota_anual`, `hc_bonus_factor: 2`, `hc_bonus_max: 60000` |
| Tours / All inclusive noches | `cantidad_es_monto` (el usuario captura el monto) |

## Scripts

```bash
node scripts/seed-royal-holiday-catalog.mjs   # seed idempotente (sin catálogo vigente)
node scripts/sync-rh-regalos-excel.mjs         # actualiza regalos del catálogo vigente
node scripts/test-rh-regalos-excel.mjs         # motor vs reglas Excel
node scripts/audit-rh-excel-fidelity.mjs        # auditoría Excel vs prod (reporte)
```

Migración **0079**: `fecha_venta`, forfeit Extra DP, parche regalos en catálogo vigente RH.
