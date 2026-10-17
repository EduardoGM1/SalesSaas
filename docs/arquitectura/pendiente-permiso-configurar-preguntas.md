# Permiso `herramientas:survey_configurar_preguntas` en API

**Estado:** CERRADO en código (rama `arquitectura/permiso-put-preguntas`). Pendiente deploy **API+web** (sin cambios de BD).  
**Código API:** `apps/api/src/modulos/survey/servicios/survey-questions-service.js` (`assertCanConfigureSurveyQuestions`).  
**Código UI:** `apps/web/src/modulos/survey/hooks/use-survey-questions.js` (`canConfigureSurveyQuestions`).

## Regla de producto

| Contexto | Botón UI | PUT |
|----------|----------|-----|
| Workspace **personal propio** del dueño (`ensure_personal_workspace` = activo) | Visible | 200 si flag `survey` (sin exigir la clave; altas sin `role_id`) |
| Workspace **sala** | Solo si la clave está en el set efectivo del RPC | 403 sin clave; 200 con clave |
| Personal ajeno (guest) | N/A típico | Misma regla que sala (exige clave) |
| Sin token | — | 401 |
| Flag `survey` off | — | 403 FLAG_DENIED |

GET intacto: sin flag ni permiso configurar.

## Por qué se exceptúa el personal

Los overrides viven en `survey_preguntas_usuario` por `usuario_id` (datos del dueño). El alta (`handle_new_user`) no asigna `role_id`. Exigir la clave en personal rompería el flujo que hoy usan todos los usuarios personales.

## Verificación

- `npm run test:security` — matriz personal/sala/guest/flag/401.
- Smoke QA: `smoke-survey-config-ui-qa.mjs` (personal sin role_id → visible/200 + purga).
- `npm run test:web`, `npm run verificar:arquitectura:completo`.

## Deploy

Ver `docs/arquitectura/deploy-permiso-put-preguntas.md` + `ROLLBACK.md` en el mismo directorio del backup en VPS. **No ejecutar** sin OK explícito.
