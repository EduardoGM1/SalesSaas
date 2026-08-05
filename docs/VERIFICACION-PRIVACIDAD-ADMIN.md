# Verificación privacidad Admin / Superadmin

**Fecha:** 2026-08-05T11:16:04.476Z
**Actor:** eduardolalito99@hotmail.com (super=true, role=admin)
**Base:** https://saletse.vercel.app

## Matriz (infografía: Ventas / Expedientes / Módulos = ❌ para Superadmin y Admin)

| Capacidad | Resultado real |
|---|---|
| Ventas fila a fila cross-empresa | PASS — solo workspace activo o vacío |
| Expedientes fila a fila cross-empresa | PASS — acotado a workspace activo |
| Overview admin | PASS — respuesta agregada / sin listados CRM |

## Evidencia API

```json
{
  "prospects_status": 200,
  "prospects_count": 13,
  "sales_status": 200,
  "sales_count": 0,
  "overview_status": 200,
  "overview_keys": [
    "data"
  ]
}
```

## Conclusión

Superadmin/Admin de plataforma no tienen lectura CRM global fila a fila. GET /prospects y /sales usan el workspace del caller (RLS + scope). Si el actor también es miembro de una sala, verá esa sala como cualquier miembro — no como bypass admin.
