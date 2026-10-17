# Permiso `herramientas:survey_configurar_preguntas` en API

**Estado:** CERRADO en código (rama `arquitectura/permiso-put-preguntas`). Pendiente de deploy API (sin cambios de BD).  
**Código:** `apps/api/src/modulos/survey/servicios/survey-questions-service.js`.  
**UI:** el botón/modal de config solo se muestra si `can("herramientas:survey_configurar_preguntas")` (`use-survey-questions`).

## Comportamiento vigente (post-arreglo)

| Operación | Auth HTTP | Flag workspace `survey` | Permiso `herramientas:survey_configurar_preguntas` |
|-----------|-----------|-------------------------|-----------------------------------------------------|
| `GET /api/v1/survey/questions-config` | Sesión requerida (401 sin token) | **No** | **No** |
| `PUT /api/v1/survey/questions-config` | Sesión requerida (401 sin token) | **Sí** (`requireWorkspaceFlag`) | **Sí** (`requireWorkspacePermission`) → 403 si falta |

- GET intacto: Survey de un usuario sin el permiso sigue leyendo banco + sus overrides.
- PUT: misma regla que la UI (roles por defecto, overrides aditivos, super admin vía RPC de workspace).
- Contrato: ruta, payload y códigos de éxito iguales; solo se agrega 403 por permiso.

## Alcance de los overrides

- Por **usuario** (`usuario_id` + `pregunta_id`), no por workspace ni por expediente.
- Afectan el banco fusionado que usa Survey para ese usuario.
- No hay filas de “config de sala”.

## Verificación

- `npm run test:security` (suite `survey-questions-service.test.mjs`: 401, 403 sin permiso, 200 con permiso, super admin, roles UI, paridad UI↔servidor).
- Smoke QA efímera con/sin permiso + purga `survey_preguntas_usuario` a 0.
- Deploy: solo API; backup + `ROLLBACK.md` + `pm2 reload` + sonda `/health`.

## Relación con 5b.6

El move a `modulos/survey` no alteró auth; este cierre alinea API y UI.
