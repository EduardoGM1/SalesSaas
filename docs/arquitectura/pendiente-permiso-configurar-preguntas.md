# Pendiente: permiso `herramientas:survey_configurar_preguntas` en API

**Estado:** KNOWN GAP. Congelado por pruebas de caracterización en 5b.6; **no cambiar** en el refactor de arquitectura.  
**Código:** `apps/api/src/modulos/survey/servicios/survey-questions-service.js` (antes `services/survey-questions-service.js`).  
**UI:** el botón/modal de config solo se muestra si `can("herramientas:survey_configurar_preguntas")` (`use-survey-questions`).

## Qué se observa hoy

| Operación | Auth HTTP | Flag workspace `survey` | Permiso `herramientas:survey_configurar_preguntas` |
|-----------|-----------|-------------------------|-----------------------------------------------------|
| `GET /api/v1/survey/questions-config` | Sesión requerida (401 sin token) | **No** | **No** |
| `PUT /api/v1/survey/questions-config` | Sesión requerida (401 sin token) | **Sí** (`requireWorkspaceFlag`) | **No** |

- Autenticado con flag `survey` puede **escribir** overrides aunque la UI le oculte el modal.
- Autenticado **sin** flag puede **leer** banco global + sus overrides (GET no llama a `requireWorkspaceFlag`).
- Aislamiento actual: filas en `survey_preguntas_usuario` por **`usuario_id`** (no por `workspace_id` / sala / empresa). Otro usuario no ve ni sobrescribe los overrides de A vía el filtro del service; no hay aislamiento “por sala” en este endpoint.

## Alcance de los overrides

- Por **usuario** (`usuario_id` + `pregunta_id`), no por workspace ni por expediente.
- Afectan el banco fusionado que usa Survey (orden, activa, `texto_override`, `opciones_override`) para ese usuario en cualquier contexto donde cargue `questions-config`.
- No hay filas de “config de sala”: un compañero de la misma empresa/sala tiene su propia fila (o ninguna).

## Opciones de arreglo (solo diseño — no implementar aquí)

1. **PUT: exigir el mismo permiso que la UI**  
   Tras auth + flag `survey`, `requireWorkspacePermission` / equivalente con `herramientas:survey_configurar_preguntas`.  
   - Efecto: alinea API y UI; quien no puede abrir el modal tampoco persiste vía curl/cliente.  
   - Riesgo bajo si el producto ya asume ese permiso para “configurar preguntas”.

2. **GET: exigir flag `survey` (y opcionalmente el permiso de lectura implícito del módulo)**  
   - Efecto: sin módulo survey no se entrega banco/overrides.  
   - Matiz: hoy el Survey puede degradar a banco local de respaldo si GET falla; habría que validar UX offline / sin flag.

3. **GET: exigir permiso configurar para devolver overrides (banco global sí / overrides no)**  
   - Efecto: lectura del catálogo global separada de la personalización.  
   - Más complejo (respuesta parcial o dos contratos); probablemente innecesario si (1)+(2) bastan.

4. **Aislamiento por workspace** (cambio de modelo de datos)  
   - Efecto: config compartida por sala/empresa.  
   - **Fuera de este pendiente** salvo producto lo pida: implica columnas/migraciones y no es “solo auth del endpoint”.

## Verificación al retomar

Reutilizar `apps/api/src/modulos/survey/servicios/survey-questions-service.test.mjs` y ampliar casos de permiso (rol sin clave → 403) **cuando** se decida el arreglo. Hasta entonces esos tests documentan el comportamiento actual (incluido el gap).

## Relación con 5b.6

El move a `modulos/survey` **no** altera auth. Cualquier cierre de este gap es tarea de producto/seguridad aparte, con OK explícito.
