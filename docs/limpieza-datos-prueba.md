# Limpieza de datos de prueba

**Fecha:** 2026-08-06  
**Script:** `scripts/cleanup-test-data.mjs`  
**Backup:** `docs/limpieza-datos-prueba-backup.json`

## Eliminado

### Usuarios (19) — dominios de prueba
- `@test.saletse.com` (vendedores/gerente demo)
- `@demo.salesapp.test`
- `@salesapp.test` (QA workflow)

### Empresas (2)
- `saletse test`
- `Empresa QA Workflow`

### Salas (2)
- `sala 1`
- `Sala QA Norte`

También: workspaces personales de esos usuarios, prospects/workflows/chats/ventas asociados.

## Conservado

| Tipo | Valor |
|---|---|
| Empresa | `salesgroup` |
| Sala | `salesroom1` |
| Usuarios | `eduardolalito99@hotmail.com` (superadmin), `prueba@hola.com`, `santvalero8@gmail.com`, `azaheljared@hotmail.com`, `chriissua@gmail.com`, `ela.ruizm@gmail.com`, `cuentapremium4minecrafted@gmail.com`, `michell.ruiz.t@gmail.com` |

> `prueba@hola.com` no coincide con los dominios de prueba y se dejó intacto.


## Segunda pasada (salesgroup + prueba@hola.com)

```json
{
  "deleted_auth_users": 1,
  "auth_errors": [],
  "remaining_profiles": [
    {
      "email": "santvalero8@gmail.com",
      "full_name": "Santiago Valero",
      "is_super_admin": false
    },
    {
      "email": "azaheljared@hotmail.com",
      "full_name": "azahel alcocer",
      "is_super_admin": false
    },
    {
      "email": "eduardolalito99@hotmail.com",
      "full_name": "Eduardo",
      "is_super_admin": true
    },
    {
      "email": "chriissua@gmail.com",
      "full_name": "Christian suarez gaona",
      "is_super_admin": false
    },
    {
      "email": "cuentapremium4minecrafted@gmail.com",
      "full_name": "Agustin alberto abinadi",
      "is_super_admin": false
    },
    {
      "email": "ela.ruizm@gmail.com",
      "full_name": "Ela RM",
      "is_super_admin": false
    },
    {
      "email": "michell.ruiz.t@gmail.com",
      "full_name": "Michell Ruiz",
      "is_super_admin": false
    }
  ],
  "remaining_empresas": [],
  "remaining_salas": []
}
```
