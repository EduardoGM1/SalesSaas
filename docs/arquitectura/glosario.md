# Glosario ES / EN (migración)

Términos aprobados en `decisiones.md`. Los contratos HTTP/BD/settings/`sts4_*` **no** se traducen.

| Concepto | UI (usuario) | Código de dominio (interno) | Contrato API / BD / settings |
|----------|--------------|-----------------------------|------------------------------|
| prospect / client | expediente | prospecto | `prospect`, columnas `prospect_*` |
| workspace (sala) | sala | sala | `workspace` |
| sale | venta | venta | `sale` / `sales` |
| calendar / agenda | agenda | agenda | `calendar_entries` |
| settings | configuración | configuración | `settings`, claves JSON existentes |
| survey | Survey (marca) | encuesta / survey (`modulos/survey`, 5a cálculo) | `survey`, tool slug `survey`, data `total`/`hpct`/`sh*`/`sf*`/… |
| vacaciones / vacation projection | Proyección de vacaciones | vacaciones (`modulos/vacaciones`) | tool slug `vacaciones`, data `vv`/`vc`/`va`/`vi` |
| worksheet | Worksheet (marca) | hoja | `worksheet` |
| Money Box | Money Box | money-box (`modulos/money-box`) | flag `worksheet.money_box`, RH `worksheet.royal_holiday.money_box`, settings `moneyBoxConfig`, rutas `/tools/money-box` |
| Royal Holiday | Royal Holiday | (marca) | paths `/royal-holiday`, flags RH |
| goals | metas | metas (`modulos/metas`) | `goals`, `/api/v1/goals`, columnas `vol`/`tours`/`ventas`/`dias`/`descansos` |
| geo / countries | país / ciudad | geo, país, ciudad | `/api/v1/geo/*`, `COUNTRY_CITY` |
| exchange rate | tipo de cambio | tipo-cambio | `/api/v1/exchange-rates`, `exchangeRate`, `usdToMxnRate`, `exchangeMode` |
| currency | moneda | moneda (`modulos/moneda`) | `currency` en settings |
| captura FX USD→MXN | tipo de cambio captura | normalizar/resolver tasa | `usdToMxnRate` (nunca ≤ 1 persistido) |
| notifications / reminders | notificaciones, recordatorios | notificaciones (`modulos/notificaciones`): `armarNotificacion`, `datosRespaldoDesdePush`, `armarProgramacionRecordatorio` | `PushType` (`message`, `follow_up_reminder`, …), `/api/v1/notifications/*`, `/api/v1/reminders`, prefs `notifications.*`, `sts4_reminder_digest_at` / `sts4_reminder_flush_at`, `scheduled_push_jobs` |
| toast | aviso | toast (`fachada-toast.js`), item del Toaster (`armarItemToast`) | — (solo cliente) |
| in-app notification | notificación en la app | tipo in-app (`mensaje_nuevo`, `expediente_compartido`, …) | sin contrato de red; se mapea desde `PushType` |

## Reglas

1. UI de marca (Survey, Worksheet, Money Box, Royal Holiday) se mantiene.
2. Identificadores **nuevos** en módulos migrados: español.
3. Paths HTTP, columnas SQL, claves `sts4_*` y settings persistidos: **inglés técnico estable**.
4. Ante duda de renombre de contrato → no renombrar; preguntar.
