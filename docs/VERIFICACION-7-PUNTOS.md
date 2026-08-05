# Verificación 7 puntos — estado real + acciones

**Fecha:** 2026-08-06  
**Commit base de trabajo:** tras este entregable

---

## 1. Roles Gerente/Liner/Cerrador/Admin — causa exacta

| Consulta BD (service role) | Resultado |
|---|---|
| Total `roles` | **17** |
| `empresa_id IS NULL` (plataforma) | **4** |
| `empresa_id NOT NULL` (tenant) | **13** |
| Slugs tenant | `gerente`×2, `liner`×3, `cerrador`×3, `vendedor`×2, + customs |

**Causa:** no hubo pérdida de datos. La migración `0066` + `roles-service.listRoles` + filtro UI en `AdminRolesPage` listaban **solo plataforma** a propósito. En Panel parecía que “faltaban” Gerente/Liner/Cerrador.

**Admin de Empresa:** no es fila `roles` global; es `empresa_miembros.es_admin = true` (tab Administradores).

**Acción tomada:** API `listRoles` (full) ahora une plataforma + tenant; UI muestra secciones **Globales** vs **Tenant** (tenant solo lectura, con empresa).

**Script:** `scripts/count-roles-tenant.mjs`

| Estado | ✅ Corregido (era bug de filtro UI/API, no pérdida) |

---

## 2. Money Box SDD

| Subpunto | Estado |
|---|---|
| Guardar Restricciones → `profiles.settings.moneyBoxConfig` | ✅ |
| Layout label\|input compacto | ✅ |
| Sin desc. secundarias; badges Plan origen/Mejor plan | ✅ |
| `↻ Generar más escenarios` + hint + conserva inputs | ✅ |

| Estado global | ✅ Sin cambios |

---

## 3. Survey acordeón + Guardar y continuar

| Subpunto | Estado |
|---|---|
| Acordeón exclusivo (1 abierta) Motivaciones/Timeshare | ✅ |
| CTA Guardar y continuar / finalizar + tabs + scroll | ✅ |

| Estado global | ✅ Sin cambios |

---

## 4. Capa de moneda

| Subpunto | Estado |
|---|---|
| `SelectorMoneda` único (select, no 2 tabs bandera) | ✅ |
| Labels resultados vía `fmtWithCurrencyCode` (no USD/MXN fijos) | ✅ |
| Matiz: Money Box matriz usa `$` sin código ISO | ⚠️ cosmético, no bloqueante |

| Estado global | ✅ (matiz documentado) |

---

## 5. Auditoría repositorio

| Subpunto | Estado | Acción |
|---|---|---|
| `.gitignore` | ✅ | — |
| Credenciales prod | ✅ ninguna en árbol | ⚠️ passwords demo en `seed-demo.mjs` / QA SQL (intencionales) |
| Deps | ⚠️ | Añadido `@supabase/ssr` a `apps/web/package.json` |
| README | ✅ | — |

| Estado global | ✅ / ⚠️ leve corregido |

---

## 6. Chat grupal por expediente

| Subpunto | Estado |
|---|---|
| Chat `tipo=expediente` (representante/gerente/cerrador) | ✅ |
| Sync al transferir / asignar / reasignar cerrador | ✅ |
| Tarjeta expediente en hilo | ✅ |

| Estado global | ✅ Sin cambios |

---

## 7. Vendedor y Soporte

| Decisión ejecutada (2026-08) | Detalle |
|---|---|
| **Vendedor → Liner** | Migración 0069: 18 perfiles; rol plataforma renombrado; tenant Vendedor eliminado. Ver `docs/migracion-vendedor-liner.md`. |
| **Soporte** | Sin cambios (verificado). |
---

## Resumen ejecutivo

| # | Punto | Antes | Ahora |
|---|---|---|---|
| 1 | Roles tenant en Panel | ❌ ocultos (filtro) | ✅ listados Globales/Tenant |
| 2 | Money Box | ✅ | ✅ |
| 3 | Survey | ✅ | ✅ |
| 4 | Moneda | ✅ | ✅ |
| 5 | Repo hygiene | ⚠️ | ✅ (+ssr en web) |
| 6 | Chat expediente | ✅ | ✅ |
| 7 | Vendedor/Soporte | 📋 pendiente | ✅ Vendedor→Liner ejecutado; Soporte intacto |
