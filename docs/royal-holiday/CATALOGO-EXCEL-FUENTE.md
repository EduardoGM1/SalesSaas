# Catálogo Royal Holiday — fuente Excel

## Fuente de verdad

El archivo **`Configuracion Proyecto.xlsx`** es la fuente funcional/numérica. Para **seed, auditoría y re-cargas** usar las **hojas dedicadas**:

| Hoja | Tabla destino |
|------|----------------|
| `Financiamiento` | `rh_financiamiento` |
| `Comisiones` | `rh_comisiones` |
| `Botton lines` | `rh_bottom_line` (solo columnas: Membresía, Créditos, Precio mín sin/con IVA, M.Fee) |
| `Regalos ` | `rh_regalos` |

La hoja **`Catalogo proyecto`** es consolidado de referencia; puede tener columnas desplazadas respecto a las hojas dedicadas. **No usar** su bloque de financiamiento para seed hasta corregir el Excel.

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
| All inclusive / Cert. vuelo | `venta_min_usd`, `venta_max_usd` (rango 500–1000) |
| Move In | `moneda_costo: "MXN"` |
| Bono de créditos | `vigencia_meses: 18`, `hc_tiers: [10000,15000,30000]` |

## Scripts

```bash
node scripts/seed-royal-holiday-catalog.mjs   # seed idempotente (sin catálogo vigente)
node scripts/audit-rh-excel-fidelity.mjs        # auditoría Excel vs prod (reporte)
```

Migración **0079**: `fecha_venta`, forfeit Extra DP, parche regalos en catálogo vigente RH.
