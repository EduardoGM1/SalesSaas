# Visibilidad de expedientes en sala (diagnóstico — Fase 1)

**Fecha:** 2026-11-10 (actualizado 2026-11-11, prod Etapas 1–3)  
**Ramas / prod:** diagnóstico `bc1e067` (main); entrega visibilidad **`c9c1dfd`** (API + web, 2026-11-11). Etapa 1: migraciones `0101` + `0102`. Etapas 2–3: mismo SHA; backups `api/pre-20261111-104024`, `web-dist/pre-20261111-104134`.  
**Regla de negocio confirmada (usuario):** en un workspace `sala_de_venta`, un usuario solo ve y puede abrir los expedientes en los que está **asignado como colaborador**. **Excepción:** gerentes, asistentes de sala y administradores ven todos.  
**Evidencia de incidente:** en prod, un usuario sin asignación ve los 9 expedientes de Sala Royal Holiday en Clientes y abre la ficha en solo lectura (“Sin permiso de edición”).

### Estado de etapas

| Etapa | Estado | Notas |
|-------|--------|-------|
| Diagnóstico | Cerrado en main | Docs; E2E main en 0 (`92f76bd`) tras fix seed Sync T2 |
| **Etapa 1** servidor/BD | **Aplicada prod** (2026-11-11) | `0101` + hotfix `0102`; API con predicado; matriz QA efímera post-apply OK |
| **Etapa 2** sync/caché | **Desplegada prod** (`c9c1dfd`) | Pull teamScope filtrado + purge blob; backup `api/pre-20261111-104024` |
| **Etapa 3** UI | **Desplegada prod** (`c9c1dfd`) | Lista/buscador/ficha “sin acceso”; backup `web-dist/pre-20261111-104134` |

**Residuales post-`c9c1dfd` (rama `arquitectura/visibilidad-residuos`):** allowlist UI vía caché del último `GET /prospects` + purge mirror; Agenda/Metas con `scopeClientsForDerivedViews` / `scopeCalMonthForDerivedViews`; seed `ver_equipo` estrecha en código (strip no-gerente) + plan RO `scripts/architecture/plan-estrechar-ver-equipo-seed-ro.md` (sin apply prod aún); matriz §6.4 residual OK (prospects+sync; realtime SKIP). Hook `use-visible-clients.js` sin imports hoy (huérfano; no borrar).

Conteos de impacto: consultas RO en producción (`BEGIN READ ONLY` … `ROLLBACK`), agregados sin ids ni emails.

---

## 1. Definición de “asignado”

### 1.1 Dónde viven los campos (hoy)

No hay tabla `prospect_participants`. El store es **`public.prospect_workflows`** (1:1 con `prospects`).

| Etiqueta UI (Colaboración) | Columna | Migración | ¿Abre listado REST hoy? | ¿Abre edición ficha hoy? | ¿Chat expediente hoy? |
|----------------------------|---------|-----------|-------------------------|--------------------------|------------------------|
| Gerente | `gerente_id` | 0055 | No | Solo si rol/permiso gerente (`workflow:revisar` / `rol_en_workspace=gerente`) | Sí (`sync_prospect_chat_members`) |
| Hostes | `hostes_id` | 0093 | No | No | No |
| Filtro | `filtro_id` | 0093 | No | No | No |
| OPC | `opc_id` | 0093 | No | No | No |
| Liner | `liner_id` | 0093 | No | No | No |
| FTB | `ftb_id` | 0093 | No | No | No |
| Closer 1 / 2 (In House) | `inhouse_closer1_id`, `inhouse_closer2_id` | 0093 | No | No | No |
| Imagen | `imagen_id` | 0093 | No | No | No |
| Self-Gen | `self_gen_id` | 0093 | No | No | No |
| Closer 1 / 2 (Members) | `members_closer1_id`, `members_closer2_id` | 0093 | No | No | No |
| **Vendedor** | `representante_id` | 0055 | **Sí** (`listProspects`) | **Sí** | Sí |
| **Cerrador** | `cerrador_id` | 0055 | **Sí** | **Sí** | Sí |
| Textos | `contrato`, `vlo`, `resultado_prospect_id` | 0093 | N/A | N/A | N/A |
| Catálogos | `calificacion_final`, `estatus_tour`, `estatus_venta` | 0093 | N/A | N/A | N/A |

**Dueño / creador**

| Concepto | Tabla.columna |
|----------|----------------|
| Dueño del expediente | `prospects.user_id` |
| Workspace | `prospects.workspace_id` |
| Alta workflow | `prospect_workflows.created_by` (+ `representante_id` inicial = actor en sala) |

Tras `assign_prospect_representante`, `prospects.user_id` se alinea con el vendedor (0062 / 0100).

**Sharing (paralelo, no es “colaboración de sala”)**

| Pieza | Dónde |
|-------|--------|
| Share | `prospect_shares` (`shared_with_id`, `permission`) |
| Invite | `prospect_share_invites` |
| Permisos wire | `view` \| `edit` \| `comment` \| `workspace` |
| App permission | `expedientes:compartir` |

UI de grupos: `apps/web/src/modulos/expediente/ui/prospect-collaboration-groups.jsx`.  
Columnas collab en API: `COLAB_USER_COLUMNS` en `apps/api/src/services/prospect-participants-service.js` (no incluye `gerente_id` / `representante_id` / `cerrador_id` en el PATCH collab; vendedor/cerrador van por RPC).

### 1.2 ¿Hay una función única “este usuario participa”?

**No.** Capas distintas:

| Capa | Función | Predicado |
|------|---------|-----------|
| Realtime / presence | `user_can_access_prospect(uid, prospect_id)` (0052 vigente) | Miembro del workspace del expediente (o share **con** membresía). **No mira** asignación. |
| Lista REST | `listProspects` | Sin `teamScope`: `user_id` **o** `representante_id`/`cerrador_id`. Con `teamScope` (`dashboard:ver_equipo`): **todos** del workspace. |
| Detalle REST | `getProspect` | Solo workspace + permiso de vista; **sin** filtro de asignación; se apoya en RLS. |
| RLS SELECT prospects | `prospects_select_tenant_role` (0056) | Miembro ∧ (`user_id` ∨ `expedientes:ver_equipo` ∨ cerrador ∨ share). **No** incluye representante ni collab 0093. |
| Edición | `canEditProspectRecord` | Dueño+`editar` ∨ rep ∨ cerrador ∨ gerente/`workflow:revisar` ∨ (`editar`+`ver_equipo`). |
| Inbox | `listActiveProspects` | Gerente/`ver_equipo`: todos; si no: rep/cerrador. |

### 1.3 Definición propuesta para la regla nueva (“asignado”)

Un usuario está **asignado** a un expediente de sala si cumple **cualquiera**:

1. `prospects.user_id = actor` (dueño), **o**
2. aparece en **cualquier** columna de persona de `prospect_workflows` listada en §1.1 (incl. collab 0093 + gerente + vendedor + cerrador), **o**
3. tiene un `prospect_shares` activo hacia ese expediente (lectura según permission del share).

**D1 (decidido):** collab 0093 **sí** cuenta como asignado para ver/abrir (junto con gerente/rep/cerrador + dueño + share).

---

## 2. Excepciones (sin renombrar contratos)

Regla: gerentes, asistentes de sala y administradores ven **todos**.

| Rol de producto | Señal existente hoy (preferida) | Notas |
|-----------------|----------------------------------|-------|
| Gerente de sala | `workspace_miembros.rol_en_workspace = 'gerente'` **y/o** slug de puesto `gerente` | Seed trae `*:ver_equipo` + `workflow:revisar` |
| Asistente de sala | slug `asistente_sala` (+ permisos vía `permisos_delegados`, no `rol_permisos`) | Sin puesto seed de permisos fijos |
| Asistente de empresa | slug `asistente_empresa` + delegación a nivel `empresa_id` | Mismo modelo de delegados |
| Administrador de empresa | `empresa_miembros.es_admin = true` | No es slug de puesto de sala |
| Superadmin | `profiles.is_super_admin` | Fuera del alcance de sala, pero debe seguir viendo |

### 2.1 Permisos existentes relevantes

| Clave | Uso hoy |
|-------|---------|
| `dashboard:ver_equipo` | Enciende `teamScope` en API/sync (`getRequestWorkspaceContext`) |
| `expedientes:ver_equipo` | Lista/detalle con teamScope; RLS SELECT de prospects/tools del equipo |
| `expedientes:ver_propios` | Lista/detalle sin teamScope |
| `expedientes:editar` | Escritura ficha |
| `workflow:revisar` | Edición tipo gerente |
| `workflow:ver` / `avanzar` / `cerrar` / `asignar_cerrador` | Workflow, no listado global |

### 2.2 Propuesta (sin crear claves nuevas todavía)

**Preferir señales de rol/slug/admin** para la excepción “ver todos”, **no** reutilizar a ciegas `expedientes:ver_equipo` / `dashboard:ver_equipo`: en Sala RH **los 3 miembros** tienen ambas claves hoy (seed o delegación), así que `ver_equipo` **no discrimina** gerente vs cerrador/liner.

Si más adelante se quiere una capacidad explícita y auditable:

- Propuesta (NO crear aún): `expedientes:ver_todos` — otorgada solo a gerente / asistente / admin.  
- Requiere migración de catálogo + seed + OK explícito + backup/rollback.

**Decisión pendiente (D2):** excepción = ¿solo rol/slug/`es_admin`, o también quien tenga `expedientes:ver_equipo` tras limpiar el seed?

---

## 3. Superficies de acceso (mapa)

Leyenda: **Abierta** = un no asignado puede ver/abrir datos ajenos hoy. **Cerrada** = bloqueada.  
Perfiles: **A** = miembro sin teamScope; **T** = con `dashboard:ver_equipo` (teamScope).

| # | Superficie | Archivo / función | Capa | A (sin teamScope) | T (con teamScope) |
|---|------------|-------------------|------|-------------------|-------------------|
| a | Lista Clientes + buscador | `clients-page.jsx` → `GET /prospects` (`listProspects`); buscador `filterAndSortClients` (cliente) | Servidor + UI | Cerrada (solo propios/asignados operativos) | **Abierta** (toda la sala → store) |
| b | Ficha `/clients/:id` + `?tab=`/`?sub=` | `client-detail.jsx`; deep links solo nav | Cliente + `getProspect` | Cerrada vía RLS si no hay blob; **abre si el UUID ya está en local** | **Abierta** |
| c1 | `GET /prospects` | `prospectos-servicio.js` `listProspects` | Servidor | Cerrada a no asignados | **Abierta** |
| c2 | `GET /prospects/:id` | `getProspect` (sin filtro asignación) | Servidor + RLS | Cerrada salvo owner/cerrador/share/`ver_equipo` | **Abierta** |
| c3 | `GET /prospects/active` | `listActiveProspects` | Servidor | Cerrada | **Abierta** (manager) |
| d | `GET/PUT /sync` pull TEAM_TABLES | `packages/shared/src/data/sync.js` `pullAll` | Servidor | Cerrada (`user_id=self`) | **Abierta** (workspace entero → blob) |
| e1 | RLS prospects | 0056 | BD | Cerrada a ajenos (salvo cerrador/share) | **Abierta** con `expedientes:ver_equipo` |
| e2 | `user_can_access_prospect` | 0052 | BD | **Abierta** (cualquier miembro del WS) | Igual |
| f | Realtime `expediente:{uuid}` presence/broadcast | `expediente-realtime.js` + 0031/0098 | BD Realtime | **Abierta** (si conoce UUID) | Abierta |
| f2 | `expediente-data:{uuid}` postgres_changes | mismo | RLS tabla | Cerrada a filas ajenas | Abierta |
| g | Chat expediente | `ensureProspectConversation` / `chat_members` | Servidor | Cerrada | Solo participantes/gerente |
| h1 | Agenda | `calendar-page.jsx` + REST agenda | Cliente blob + servidor | Tours ajenos solo si están en blob | **Abierta** |
| h2 | Metas / Dashboard | KPIs sobre `db.clients` | Cliente | Spillover si blob team | **Abierta** |
| h3 | Premanifiesto | RPC `rh_premanifiesto_dia` | Servidor (flag RH) | **Abierta** a quien tenga el flag (nombres del día) | Igual |
| h4 | Notificaciones | eventos dirigidos + label prospect | Servidor + RLS | No lista ajenos | — |
| i | Caché `sts4_v1:{workspaceId}` | `local-storage-adapter.ts` | Cliente | Persistencia ciega de lo sync/mirror | Blob = sala |

**Lectura del incidente (capturas):** badge “Sin permiso de edición” = `can_edit=false` (`canEditProspectRecord`), **no** = “sin permiso de ver”. Con teamScope + `ver_equipo`, la lista y la ficha de lectura quedan abiertas.

---

## 4. Casos borde (decisión propuesta)

| Caso | Decisión propuesta |
|------|---------------------|
| Expediente nuevo creado por el usuario | Queda asignado: `user_id` + `representante_id`/`created_by` en alta sala. Visible de inmediato. |
| Reasignación (deja de estar asignado) | Pierde ver/abrir en API/RLS en la Etapa 1. Etapa 2: purge del blob local de filas ya no visibles; ficha abierta → 404/“sin acceso” al refrescar. |
| Share sin ser colaborador de workflow | Sigue viendo según `prospect_shares` (excepción de la regla de asignación). |
| Guest = miembro WS sin puesto de sala | Hoy: si tiene `ver_equipo`, ve todos (fuga). Bajo regla: **no** ve ajenos salvo share o excepción. Cierra el hallazgo de canales si se estrecha `user_can_access_prospect`. |
| Varios roles / dual puesto | Unión de señales; excepción si **alguna** lo califica como gerente/asistente/admin. |
| Vendedor que registró la venta | Visible si sigue como `representante_id` o `user_id`; venta sola no otorga ver si ya no está asignado (**D3** confirmar). |
| Premanifiesto / Marketing | **D4:** ¿sigue viendo nombres de todos los tours del día (flag RH) o solo asignados? Propuesta por defecto: **mantener Premanifiesto como superficie aparte** (calendario operativo), documentada como excepción de producto, no como “ver ficha CRM”. |
| Offline-first con blob viejo | Tras Etapa 2, al hidratar/sync se eliminan ajenos del store; hasta entonces spillover local posible. |
| Rendimiento | Predicado SQL por fila (EXISTS sobre `prospect_workflows` + share) + índice por columnas de persona; evitar N+1 en lista (mismo patrón que `listProspects` con `assignedIds`). |

---

## 5. Impacto medido (Sala Royal Holiday, RO 2026-11-10)

| Métrica | Valor |
|---------|------:|
| Expedientes en la sala | **9** |
| Miembros del workspace | **3** |
| Shares | **0** |
| `rol_en_workspace` | gerente 1 · vendedor 2 |
| Puestos | gerente 1 · liner 1 · cerrador 1 |
| Admins empresa en la sala | 1 |
| Con `dashboard:ver_equipo` | **3** (todos) |
| Con `expedientes:ver_equipo` | **3** (todos) |
| Excepción propuesta (gerente/asistente/admin) | **2** |
| TeamScope **sin** excepción propuesta | **1** (pierde “ver todos”) |
| Miembros sin ninguna columna collab/owner/share | **1** |
| Relleno collab | representante **9/9**; resto de campos **0** |

### Hoy vs regla nueva (por puesto)

| Puesto | Miembros | Hoy (avg / max visibles) | Nueva (avg / max) | Pierden acceso parcial | Pierden todos |
|--------|---------:|--------------------------:|------------------:|-----------------------:|--------------:|
| gerente | 1 | 9 / 9 | 9 / 9 | 0 | 0 |
| liner | 1 | 9 / 9 | 9 / 9 | 0 | 0 |
| cerrador | 1 | 9 / 9 | 1 / 1 | **1** | 0 |

**Interpretación:** hoy **los tres** ven los 9 porque todos tienen teamScope/`ver_equipo`. Bajo la regla (asignación collab + excepciones de rol), el **cerrador no asignado** pasa de 9 → 1 (conserva 1 vínculo operativo residual) y es el perfil del incidente (“ve todo, no edita”). El liner sigue en 9 porque es `representante_id` de los 9. El gerente sigue en 9 por excepción.

---

## 6. Diseño propuesto (sin implementar)

### 6.1 Defensa en profundidad

1. **BD / RLS (fuente de verdad de lectura):** estrechar `prospects_select_*` (y tablas hijas alineadas) a: excepción (gerente/asistente/admin) **∨** dueño **∨** asignación en `prospect_workflows` (conjunto acordado en D1) **∨** share.  
2. **`user_can_access_prospect`:** alinear con el mismo predicado (cierra el hallazgo de guests/canales — ver backlog §1). **Requiere migración + OK.**  
3. **API:** `listProspects` / `getProspect` / `listActiveProspects` deben filtrar por el mismo predicado (no solo confiar en RLS); `getProspect` hoy **no** filtra asignación.  
4. **Sync:** con teamScope, el pull no puede seguir siendo “todo el workspace” para no-excepciones.  
5. **Cliente:** filtrar lista/buscador; mensaje “Sin acceso” en ficha; **no** es frontera de seguridad.

### 6.2 Sync y guards (regresión octubre)

| Artefacto | ¿Hay que tocarlo? |
|-----------|-------------------|
| `packages/shared/src/data/sync.js` | **Sí**, si el pull teamScope debe devolver solo asignados/excepciones. Vigilado por `check-sync-shared-guard` / `sync-shared-files.json` (`sharedOnlyNoted`). |
| `sync-columns.js` | Solo si cambian columnas de pull. |
| Rama `arquitectura/expediente-*` | `check-expediente-shared-guard` **prohíbe** tocar `packages/shared/src/data/*`. El cambio de sync debe ir en **rama sync dedicada** o etapa explícita con guards en verde. |
| `dbToRows` / reconcile | No reintroducir estampado de `user_id` ajeno; conservar omisión de filas ajenas (Tramo 1). |

### 6.3 Limpieza de caché local

- Tras pull filtrado: `replaceDb` / merge que **elimine** clients (y sales/activities/tools/cal ligadas) fuera del set visible.  
- Al perder asignación: mismo purge en el siguiente sync.  
- No borrar el blob entero del workspace (rompe offline de lo propio).

### 6.4 Pruebas con QA efímeras (sin dispositivo personal)

Cuentas `@saletse-test.com`, contraseña aleatoria fuera del repo, purga a 0.

| Actor | GET lista | GET ficha ajena | sync pull ajeno | realtime presence ajeno | UI Clientes |
|-------|-----------|-----------------|-----------------|-------------------------|-------------|
| Gerente | todos | 200 | sí | sí (excepción) | todos |
| Asistente sala | todos | 200 | sí | sí | todos |
| Admin empresa | todos | 200 | sí | sí | todos |
| Colaborador asignado | solo suyos | 200 suyos / 404 ajenos | solo suyos | solo suyos | solo suyos |
| Sin asignación | vacío / sin ajenos | 404 | vacío ajenos | denegado | vacío |
| Share view | el compartido | 200 | el compartido | según predicado | el compartido |
| Guest sin rol | como sin asignación | 404 | no | denegado | vacío |

Matriz contra prod solo con QA + purga; no usar cuentas reales.

**Residual post-`c9c1dfd` (2026-11-11):** smoke QA efímera OK — gerente/asignado/sin/share en `GET /prospects` + `GET /sync` clients; ficha ajena 404; realtime ⊘ SKIP; purga a 0. Script/reporte fuera del repo (`~/.saletse-ops`). Gaps documentados: asistente/admin empresa y presence realtime en runner in-repo pendiente.

---

## 7. Plan por etapas + rollback

### Etapa 1 — Servidor / BD (requiere OK de migración)

| | |
|--|--|
| Cambio | Predicado compartido; RLS prospects (+ hijas); `user_can_access_prospect`; `listProspects`/`getProspect`/`listActiveProspects` |
| Backup | Dump lógico RO de policies/funciones + `pg_dump` schemas afectados; stamp en backups VPS |
| Rollback | SQL `rollback-0xxx-visibilidad-expedientes.sql` (restaurar función 0052 + policies 0056) + redeploy API anterior |
| CI | `test:security`, checks arquitectura, E2E 0 fallos del SHA |
| Prueba | Matriz QA efímera §6.4 (API + realtime) |
| **OK usuario** | **Hecho** (D6). Apply prod 2026-11-11: `0101` + hotfix `0102` (dueño en SELECT para INSERT RETURNING). API desplegada con predicado. |

### Etapa 2 — Sync / caché

| | |
|--|--|
| Cambio | `pullAll` teamScope filtrado; purge blob de no visibles; sin reescribir ownership |
| Backup | Código + dist; no BD obligatoria si Etapa 1 ya aplicada |
| Rollback | `git revert` + redeploy API/web; blob se rehidrata en siguiente sync |
| CI | Guards sync verdes; smoke sync roundtrip QA |
| Prueba | teamScope gerente vs liner vs cerrador; offline reopen |
| Sync.js | Sí se toca → rama/`arquitectura/sync-*` o etapa con guard consciente |
| **OK usuario / deploy** | **Hecho** (2026-11-11). API + web `c9c1dfd`; rollback vía backup `api/pre-20261111-104024` + `web-dist/pre-20261111-104134` |

### Etapa 3 — UI

| | |
|--|--|
| Cambio | Lista/buscador; empty state; ficha “sin acceso”; no mostrar ajenos en Agenda/Metas derivados del blob |
| Backup | `web-dist` pre-deploy |
| Rollback | Restaurar dist anterior |
| CI | test:web + E2E |
| Prueba | Captura incidente (cerrador sin asignación) → 0 ajenos en Clientes |
| **OK usuario / deploy** | **Hecho** (2026-11-11), junto con Etapa 2 en `c9c1dfd` (ver fila deploy Etapa 2) |

**Orden:** 1 → 2 → 3. No desplegar UI antes del servidor (daría falsa sensación de seguridad). **Prod:** secuencia completada 2026-11-11.

---

## 8. Decisiones D1–D6 (cerradas 2026-11-10)

| ID | Decisión |
|----|----------|
| D1 | Collab 0093 **sí** cuenta como asignado |
| D2 | Excepción **solo** `rol_en_workspace=gerente`, slug `asistente_sala`/`asistente_empresa`, `empresa_miembros.es_admin`, superadmin. **Nunca** por `ver_equipo` |
| D3 | Venta sin asignación **no** otorga ver |
| D4 | Premanifiesto sigue aparte (excepción de producto) |
| D5 | **No** crear `expedientes:ver_todos`; función SQL `es_gerente_asistente_o_admin(uid, workspace)` |
| D6 | **OK** apply Etapa 1 (2026-11-11): `0101` + hotfix `0102` |

---

## 9. Relación con backlog de seguridad

El hallazgo [`backlog-seguridad.md`](./backlog-seguridad.md) §1 quedó **cerrado** (2026-11-11): Etapa 1 (`0101`/`0102`) + Etapas 2–3 en prod `c9c1dfd` (pull sync filtrado + purge blob `visibilityPurge`; UX ficha/lista “Sin acceso” / empty sala).

Hotfix `0102`: atajo dueño en SELECT para `INSERT … RETURNING`.

Impacto post-apply (Sala RH, RO): cerrador 9→1; gerente/asistente sin pérdida.

**Residuales post-cierre** (rama `arquitectura/visibilidad-residuos`): allowlist UI + Agenda/Metas scoped; seed strip `ver_equipo` en código + plan RO (apply prod pendiente); matriz §6.4 residual OK (realtime SKIP).

---

## 10. Fuera de alcance de este documento

- Runbooks de deploy/rollback recurrentes y cambios de seed en prod (la ejecución de Etapas 1–3 en prod quedó registrada en §7).  
- Zelle / pagos.  
- Unificar `sales` / `rh_ventas`.
