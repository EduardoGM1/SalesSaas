# Glosario ES / EN (migración)

Términos aprobados en `decisiones.md`. Los contratos HTTP/BD/settings/`sts4_*` **no** se traducen.

| Concepto | UI (usuario) | Código de dominio (interno) | Contrato API / BD / settings |
|----------|--------------|-----------------------------|------------------------------|
| prospect / client | expediente | prospecto | `prospect`, columnas `prospect_*` |
| workspace (sala) | sala | sala | `workspace` |
| sale | venta | venta | `sale` / `sales` |
| calendar / agenda | agenda | agenda | `calendar_entries` |
| settings | configuración | configuración | `settings`, claves JSON existentes |
| survey | Survey (marca) | encuesta (solo código nuevo) | `survey`, tool slug `survey` |
| worksheet | Worksheet (marca) | hoja | `worksheet` |
| Money Box | Money Box | caja-dinero / money-box según contexto | flags `worksheet.money_box`, settings `moneyBoxConfig` |
| Royal Holiday | Royal Holiday | (marca) | paths `/royal-holiday`, flags RH |
| goals | metas | metas (`modulos/metas`) | `goals`, `/api/v1/goals`, columnas `vol`/`tours`/`ventas`/`dias`/`descansos` |
| geo / countries | país / ciudad | geo, país, ciudad | `/api/v1/geo/*`, `COUNTRY_CITY` |
| exchange rate | tipo de cambio | tipo-cambio | `/api/v1/exchange-rates`, `exchangeRate`, `usdToMxnRate`, `exchangeMode` |
| currency | moneda | moneda (`modulos/moneda`) | `currency` en settings |
| captura FX USD→MXN | tipo de cambio captura | normalizar/resolver tasa | `usdToMxnRate` (nunca ≤ 1 persistido) |

## Reglas

1. UI de marca (Survey, Worksheet, Money Box, Royal Holiday) se mantiene.
2. Identificadores **nuevos** en módulos migrados: español.
3. Paths HTTP, columnas SQL, claves `sts4_*` y settings persistidos: **inglés técnico estable**.
4. Ante duda de renombre de contrato → no renombrar; preguntar.
