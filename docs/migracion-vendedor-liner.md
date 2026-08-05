# Migración Vendedor → Liner — respaldo y registro

**Fecha snapshot:** 2026-08-05T23:25:38.816Z
**Decisión:** eliminar rol Vendedor; migrar usuarios a Liner (nunca a Cerrador). Soporte sin cambios.

## Hallazgo de permisos (antes de migrar)

| Ámbito | Comparación | Mitigación |
|---|---|---|
| Plataforma Vendedor | No existía Liner de plataforma | Se **renombra** el rol sistema `a0000000-0000-4000-8000-000000000003` de Vendedor→Liner **conservando UUID, permisos y flag_reglas** (survey, proyección, worksheet, analysis). Los perfiles no pierden módulos. |
| Tenant (saletse test / Empresa QA) | Liner carece de flags `analysis` y `worksheet` vs paquete operacion-base de Vendedor | **0** usuarios en `workspace_miembros`/`empresa_miembros` con `role_id` de Vendedor-tenant. Sin pérdida actual. Nuevas altas default usan Liner (Survey+Proyección). |

## Roles Vendedor en catálogo (pre-migración)

| id | capa | empresa |
|---|---|---|
| `a0000000-0000-4000-8000-000000000003` | plataforma | — |
| `e167e5a3-b065-4514-b326-8613137dc1bd` | tenant | saletse test |
| `8447f27f-62a3-4f95-9240-4de52b158ef2` | tenant | Empresa QA Workflow |

## Usuarios con `profiles.role_id` = Vendedor (plataforma)

| id | nombre | correo | workspaces |
|---|---|---|---|
| `b76adf52-723a-4d5d-a88a-760147d50c2f` | Vendedor Demo 07 | vendedor07@test.saletse.com | personal:Vendedor Demo 07 |
| `be9880d3-86f0-4a27-b028-a9079379a517` | Vendedor Demo 09 | vendedor09@test.saletse.com | personal:Vendedor Demo 09 |
| `bea4dd56-95c5-448d-84f6-09e6bc3e49d1` | eduardo | prueba@hola.com | personal:eduardo |
| `d8c3856f-19bf-44cb-910e-52c0117f2ee5` | Vendedor Demo 03 | vendedor03@test.saletse.com | personal:Vendedor Demo 03 |
| `e11d3a90-ae1a-46d9-9c4f-199c5f95548b` | Vendedor Demo 01 | vendedor01@test.saletse.com | personal:Vendedor Demo 01 |
| `fad1879a-7063-4236-9ef5-be358c6492b5` | Gerente Demo Norte | gerente01@test.saletse.com | personal:Gerente Demo Norte |
| `fe92d2b3-cb9d-491c-a0c6-0009579954b6` | Carlos López | carlos.lopez@demo.salesapp.test | personal:Carlos López |
| `0c003d3b-6fdd-4c39-9840-a16374bd90a6` | María García | maria.garcia@demo.salesapp.test | personal:María García |
| `673658c3-73ae-4afb-93b8-4df57de20d98` | Vendedor Demo 04 | vendedor04@test.saletse.com | personal:Vendedor Demo 04 |
| `72b10ac7-5e61-4f2e-9423-7ec10efa133c` | Ana Martínez | ana.martinez@demo.salesapp.test | personal:Ana Martínez |
| `9d9c7c60-54b7-43a5-8ffe-f066b1e581d1` | Vendedor Demo 02 | vendedor02@test.saletse.com | personal:Vendedor Demo 02 |
| `a4bb3d06-cc5c-480c-b8d3-0cbb016fa6ac` | Vendedor Demo 10 | vendedor10@test.saletse.com | personal:Vendedor Demo 10 |
| `b75a228b-6710-47ca-ae47-72f433e4e12d` | Vendedor Demo 08 | vendedor08@test.saletse.com | personal:Vendedor Demo 08 |
| `010b76be-d639-497c-9b35-dc93d72c4a92` | azahel alcocer | azaheljared@hotmail.com | personal:azahel alcocer |
| `000910a6-f5c4-46fa-9b2e-6171cf487132` | Vendedor Demo 05 | vendedor05@test.saletse.com | personal:Vendedor Demo 05 |
| `b4171918-8ba7-431e-8dda-03a089a767bf` | Vendedor Demo 06 | vendedor06@test.saletse.com | personal:Vendedor Demo 06 |
| `4132b3c4-c003-4d35-8868-324bd78a8d24` | Ela RM | ela.ruizm@gmail.com | personal:Ela RM |
| `4b48e210-203a-4e15-9690-310d7f0b6341` | Michell Ruiz | michell.ruiz.t@gmail.com | personal:Michell Ruiz |

**Total perfiles:** 18

## Membresías tenant con `role_id` Vendedor

- workspace_miembros: **0**
- empresa_miembros: **0**

## Soporte (verificación pre — no tocar)

```json
[
  {
    "id": "a0000000-0000-4000-8000-000000000004",
    "nombre": "Soporte",
    "slug": "soporte",
    "empresa_id": null
  }
]
```

profiles con Soporte: 0

## Nota sobre `rol_en_workspace = vendedor`

El enum `workspace_rol` solo admite `gerente|vendedor` (legacy). Ese valor **no** es el catálogo de roles; permanece como “no-gerente” en BD. La UI debe mostrar `roles.nombre` (Liner/Cerrador/…).

## Reversión

1. Renombrar rol plataforma `liner` → `vendedor` (mismo UUID `a0000000-0000-4000-8000-000000000003`).
2. Recrear roles tenant `slug=vendedor` por empresa desde seed o backup JSON.
3. Restaurar `profiles.role_id` desde `migracion_vendedor_liner_backup` / esta tabla.

---
*El resultado post-ejecución se añade al final por el script de migración.*

## Resultado de ejecución

```json
{
  "roles_vendedor_restantes": 0,
  "profiles_con_vendedor": 0,
  "platform_role": {
    "id": "a0000000-0000-4000-8000-000000000003",
    "nombre": "Liner",
    "slug": "liner"
  },
  "backup": [
    {
      "fuente": "profiles",
      "n": 18
    }
  ],
  "flag_reglas_on_platform_liner": 4,
  "audit_logs": 18,
  "soporte_pre": {
    "roles": [
      {
        "id": "a0000000-0000-4000-8000-000000000004",
        "nombre": "Soporte",
        "slug": "soporte"
      }
    ],
    "users": 0
  },
  "soporte_post": {
    "roles": [
      {
        "id": "a0000000-0000-4000-8000-000000000004",
        "nombre": "Soporte",
        "slug": "soporte"
      }
    ],
    "users": 0
  },
  "soporte_sin_cambios": true
}
```


## Verificación post-migración (API)

```json
{
  "vendedor_roles_left": 0,
  "platform_role": {
    "id": "a0000000-0000-4000-8000-000000000003",
    "nombre": "Liner",
    "slug": "liner"
  },
  "profiles_on_platform_liner": 18,
  "platform_liner_flags": [
    "survey",
    "proyeccion_vacaciones",
    "worksheet",
    "analysis"
  ],
  "soporte": {
    "id": "a0000000-0000-4000-8000-000000000004",
    "nombre": "Soporte",
    "slug": "soporte"
  },
  "backup_rows": 18
}
```

## Notificaciones a usuarios (opcional)

No se enviaron push/email: los 18 perfiles conservan los mismos `flag_reglas` y permisos (rename de UUID). El cambio visible es el nombre del rol (Vendedor → Liner).

Si el equipo quiere avisar: reutilizar el sistema de notificaciones in-app con copy tipo «Tu puesto pasó a llamarse Liner; tus módulos no cambian».
