# Roles y permisos — vista actual

Documento para **entender de un vistazo** cómo funciona hoy el acceso en Saletse (cualquier empresa) y las extensiones Royal Holiday.

**Fecha:** 2026-09-09.  
**Qué no es:** no sustituye el detalle de RPC, RLS ni catálogo de claves. Si este archivo y el código discrepan, gana el código.

| Si necesitas… | Ve a |
|---------------|------|
| Fórmula RBAC, atajos, fail-closed | [`INFORMACION-TECNICA-SISTEMA.md`](./INFORMACION-TECNICA-SISTEMA.md) §5 · migración [`0090`](../supabase/migrations/0090_empresa_admin_exclude_capa_admin.sql) · [`0063`](../supabase/migrations/0063_rbac_additive_overrides.sql) |
| Recorrido de pantallas CRM (histórico 2026-09-02) | [`FLUJO-USUARIO-POR-ROL.md`](./FLUJO-USUARIO-POR-ROL.md) |
| Recorrido RH (tools, Premanifiesto, `rh_ventas`) | [`FLUJO-USUARIO-ROYAL-HOLIDAY.md`](./FLUJO-USUARIO-ROYAL-HOLIDAY.md) |
| Mapa del sistema | [`MAPA-GENERAL-SISTEMA.md`](./MAPA-GENERAL-SISTEMA.md) |

> **Nota:** varios docs enlazan `docs/RBAC-ADDITIVE.md`. Ese archivo **no está en el repo** (se citó y se corrigió en la ficha técnica). La fórmula vigente está en INFORMACION-TECNICA §5.2 y en las migraciones `0063` / `0090`.

---

## 1. Dos dimensiones distintas (lo más importante)

| Dimensión | Qué controla | Dónde vive | Ejemplo |
|-----------|--------------|------------|---------|
| **Flags / paquetes** | Qué **módulos y herramientas** aparecen (tarjetas, rutas `/tools/*`, `/ops/rh/*`) | `paquetes_acceso` + `paquete_flags` + `flag_reglas` → sesión `flags` | `worksheet.royal_holiday` muestra Worksheet RH |
| **Permisos de acción** (`permission_keys`) | Qué **puede hacer** el API (crear expediente, cancelar venta, ver equipo) | `rol_permisos` ∪ overrides aditivos → `effective_workspace_permissions` | `expedientes:crear`, `ventas:cancelar` |

Tener el flag de Worksheet RH **no** da `ventas:cancelar`. Tener `expedientes:crear` **no** abre Premanifiesto. El menú (sidebar) es una **tercera** capa: casi no se recorta por `expedientes:*`; en sala RH sí se recorta para Liner/Cerrador/OPC (ver §5).

La API **no se fía del menú**: `requireWorkspacePermission` / `requireWorkspaceFlag` fallan cerrado (403 / 503). Un botón visible puede recibir 403.

```
         flags / paquete          permission_keys
              │                         │
              ▼                         ▼
     “¿se ve Worksheet RH?”    “¿puede crear expediente?”
              │                         │
              └──────────┬──────────────┘
                         ▼
              menú + home (sesión + workspace activo)
```

---

## 2. Cómo se calcula el set efectivo de permisos

Fórmula real (aditiva; **no** hay `techo_plataforma ∩ techo_empresa`):

```
efectivo = permisos(rol del workspace) ∪ overrides(otorgado=true) ∪ atajos
```

- **Overrides:** solo suman (`0063`). El deny quedó deprecado.
- **Superadmin** (`profiles.is_super_admin`): catálogo completo de `permisos`.
- **Admin de empresa** (`empresa_miembros.es_admin`): atajo a **todas las claves `capa: app`**. Migración **`0090`**: ese atajo **ya no incluye `capa: admin`** (panel de plataforma: Usuarios, Roles, Logs, exports sensibles, etc.).
- **Admin de plataforma** (`profiles.role = admin`): `admin_permissions` por sección; no puede mutar a otro Admin.
- **Asistentes:** sin `rol_permisos` de fábrica; viven de `permisos_delegados` (techo = lo que ya tiene el delegante).

Fail-closed: si el RPC de permisos/flags de sala no responde, no se “abre todo”; la UI muestra reintentar y el API niega.

---

## 3. Roles / puestos GENERALES (cualquier empresa)

No son “niveles de un mismo usuario”. Un usuario tiene **workspace activo**; el puesto es el `roles.slug` de `workspace_miembros.role_id` en esa sala (más flags/paquete).

| Quién | Qué es | Default de fábrica (seed `ensureEmpresaOperationalRoles`) | Home |
|-------|--------|-----------------------------------------------------------|------|
| **Liner** | Puesto de sala (ex-Vendedor, `0069`) | Flags: Survey + Vacaciones. Permisos: base Liner de plataforma + `workflow:ver` / `avanzar`. **Sin** `*:ver_equipo`. | Agenda `/` |
| **Cerrador** | Puesto de sala | Paquete `cierre`: módulos base **incluyendo Money Box**. Extra: `workflow:cerrar`. Sin `ver_equipo`. | Agenda `/` |
| **Gerente** | Puesto de sala | Paquete `operacion-base`. Extra: `expedientes/ventas/dashboard/metas:ver_equipo`, `workflow:revisar`, `workflow:asignar_cerrador`. Menú **Mi equipo**. | Agenda `/` |
| **Admin de empresa** | **No es slug de sala**: `empresa_miembros.es_admin` | Atajo `capa:app` (`0090`). Panel tenant: Resumen + Empresas (catálogo, puestos, branding). El CRM sigue el workspace activo. | Agenda `/` (el CRM no se vuelve panel) |
| **Admin de plataforma** | `profiles.role = admin` | Pestañas según `admin_permissions`. No muta peers. | Agenda `/` + ítem Admin |
| **Superadmin** | `is_super_admin` (un registro) | Todo el catálogo. Único que otorga claves sensibles y muta Admins. | Agenda `/` + Admin completo |
| **Asistente sala / empresa** | Puestos seed `delegatedOnly` | 0 permisos de catálogo; solo delegación. | Agenda `/` |
| **Soporte** | Rol plataforma | Tickets. Ver Admin **sin confirmar** si no tiene `role = admin`. | — |

En **workspace personal** (el de alta): Red + Mensajes; sin Mi equipo; flags de **plan/membresía**, no del paquete de sala.

---

## 4. Extensiones ESPECÍFICAS de Royal Holiday

Son **puestos de sala y/o flags** de la empresa RH. No es una app aparte: mismo login; cambia el **workspace activo**.

| Nombre | ¿Rol aparte o flag? | Relación con Liner/Cerrador | Qué habilita |
|--------|---------------------|-----------------------------|--------------|
| **OPC** | Puesto `opc` + paquete `opc-lobby` **o** flag `rh.tool.premanifiesto.opc` encima de otro puesto | Es un puesto propio de fábrica. También se puede pegar el flag a alguien que no sea `opc`. | Invitar pareja (origen `opc`). En sala RH: sidebar recortado + aterrizaje Premanifiesto. |
| **Marketing** | Puesto `marketing` + paquete `marketing` + flag `.marketing` | Puesto propio. | Registrar pareja (origen marketing). |
| **Rep** | **No es slug de puesto.** Flag `rh.tool.premanifiesto.rep` **encima** de Liner/Cerrador/otro | Se agrega a un puesto existente. | Botón **Tomar caso** en Premanifiesto. |
| **Ops** | Flag `rh.tool.ops` (en paquetes RH de Gerente/Cerrador/Liner/Marketing/OPC) | No es un puesto. | Hub `/ops/rh` (línea, OKR, descansos, propinas, Premanifiesto padre). |
| **CSI** | Flag `rh.tool.premanifiesto.csi` (delegación) | No es un puesto. | Notas CSI según RPC; sin tarjeta propia en el hub. |

Jerarquía de flags (si el padre está off, el hijo está off):

```
worksheet
 └── worksheet.royal_holiday
      ├── worksheet.royal_holiday.money_box
      └── rh.tool.*
           └── rh.tool.premanifiesto
                ├── .marketing
                ├── .opc
                ├── .rep
                └── .csi
```

En la sala RH el **Liner de fábrica no es “solo Survey”**: el bootstrap + `0085` le pone Worksheet RH y `rh.tool.*` (sin hijos de Premanifiesto). Eso **difiere** del Liner genérico de cualquier otra empresa.

---

## 5. Navegación: menú y aterrizaje

El home **ya no es Agenda para todos**. Código: `getRhOpcHomeHref` / `shouldCompactRhFloorNav` (`apps/web/src/lib/rh-opc-home.js`, `nav-config.js`).

### 5.1 Sidebar recortado (sala RH)

Aplica a **Liner, Cerrador y OPC** (y a quien tenga flags `.opc` o `.rep`) cuando el workspace activo es sala **y** la empresa es RH (`empresa_id` o flag `worksheet.royal_holiday`). **No** aplica a Gerente ni Admin.

Tres ítems fijos (`RH_COMPACT_NAV_HREFS`):

| Ítem | OPC en sala RH | Liner / Cerrador en sala RH |
|------|----------------|-----------------------------|
| 1 | **Calendario** → `/ops/rh/premanifiesto` | **Agenda** → `/` |
| 2 | Clientes | Clientes |
| 3 | Metas | Metas |

Herramientas, Dashboard, Ventas y Mi equipo **no** están en ese rail. Se llega por expediente, URL, o cambiando de workspace. El **mismo usuario OPC en otra empresa** (o en personal) ve el **sidebar completo** y aterriza en Agenda.

### 5.2 Aterrizaje post-login y avatar

| Condición | Destino |
|-----------|---------|
| Sala RH + puesto/flag OPC | `/ops/rh/premanifiesto` |
| Cualquier otro caso | `/` (Agenda) |

El avatar del sidebar usa el mismo `homeHref` (ya no es un `Link to="/"` ciego).

### 5.3 Menú completo (fuera del recorte RH)

Definido en `NAV_GROUPS`. Ningún ítem principal se oculta por `expedientes:crear`. Sí se ocultan:

- **Mi equipo:** solo `rol_en_workspace === gerente` en sala.
- **Ventas:** `sales:history`.
- **Red / Mensajes:** solo workspace personal.
- **Chat equipo:** solo sala.
- **Admin:** `/admin/me` OK.

---

## 6. Tabla cruzada — roles reales

Retrato **de fábrica** en sala. Una empresa puede haber recortado paquetes; entonces la pantalla cambia.

| Rol | Qué ve en el menú (workspace = esa sala) | Qué puede hacer (default) | Dónde aterriza |
|-----|------------------------------------------|---------------------------|----------------|
| **Liner** (empresa genérica) | Agenda, Metas, Clientes, Dashboard, Herramientas, Ventas si `sales:history`. Sin Mi equipo. | Survey, Vacaciones; crear/editar **propios**; no ve equipo. | Agenda |
| **Liner** (sala RH) | **3 ítems:** Agenda, Clientes, Metas | Lo anterior **más** Worksheet RH / tools RH (flags). Premanifiesto en **lectura**. | Agenda |
| **Cerrador** (genérico) | Igual que Liner genérico | Worksheet + Money Box; cierre; sin `ver_equipo`. | Agenda |
| **Cerrador** (sala RH) | **3 ítems:** Agenda, Clientes, Metas | Tools RH + Guardar `rh_ventas` si `can_edit`. | Agenda |
| **Gerente** | Menú **completo** de sala + Mi equipo (+ Admin si `es_admin` o contexto tenant) | `ver_equipo`; asignar liner/cerrador; no publica catálogo RH salvo admin de empresa. | Agenda |
| **OPC** (sala RH) | **3 ítems:** Calendario (= Premanifiesto), Clientes, Metas | Invitar pareja (modal); crea expediente al confirmar; comercial bloqueado. | **Premanifiesto** |
| **OPC** (otra empresa / personal) | Sidebar **completo** de sala o personal | Según flags de esa empresa (sin compact RH). | Agenda |
| **Marketing** | Menú completo de sala (no entra al recorte compact salvo que también tenga `.opc`/`.rep`) | Registrar pareja marketing; **no** crea ficha CRM al registrar. | Agenda |
| **Rep** (flag sobre Liner/Cerrador/…) | El menú del puesto base; en RH compact si el puesto es Liner/Cerrador/OPC | **Tomar caso** en filas pendientes sin `rep_id`. | El del puesto base (Agenda, salvo si también es OPC) |
| **Admin de empresa** | CRM del workspace activo + Admin (Resumen, Empresas) | Puestos, catálogo RH, branding. Sin `capa:admin`. | Agenda |
| **Superadmin** | Según workspace activo + Admin completo | Todo. | Agenda |

---

## 7. Huecos abiertos (estado actual vs. lo que falta)

Esto es **inventario**, no un plan de trabajo.

| Tema | Estado hoy | Qué falta / matiz |
|------------------|-------------------|
| **Tomar caso (Rep)** | Botón + API `.../tomar-caso` **sí existen**. Toast «Caso tomado». | No abre `/clients/:id`. No hay flujo de **reasignar** si otro Rep ya tomó (`rep_id` ocupado → el botón no sale). Qué se desbloquea en el CRM al tomar: no hay enlace automático. |
| **Alta Premanifiesto vs CRM** | OPC (modal) **sí** crea expediente (`POST /prospects`) y registra la pareja. | Marketing **Registrar pareja** sigue sin crear ficha en Clientes (solo `prospect_nombre`). Hay que crear el expediente a mano. |
| **Dos pipelines de venta** | `sales` (Dashboard) y `rh_ventas` (Guardar Worksheet RH) conviven. | No hay wizard que los unifique. Guardar RH **no** alimenta Dashboard `/goals`. |
| **Docs de flujo 2026-09-02** | [`FLUJO-USUARIO-POR-ROL.md`](./FLUJO-USUARIO-POR-ROL.md) dice que **todos** aterrizan en Agenda y que el menú RH “casi no cambia”. | Desactualizado respecto al compact nav y al home OPC. Usar **este** archivo para menú/home. |
| **`RBAC-ADDITIVE.md`** | Enlazado desde README / mapa / ficha técnica. | **Archivo ausente** en el repo. El contenido útil está en INFORMACION-TECNICA §5. |
| **Puesto OPC en staging** | Cuenta de prueba opera con **flag overrides** + permisos de workspace. | El rol `opc` en staging puede quedar con `paquete_id` null (en prod sí liga `opc-lobby`). No bloquea el smoke si hay overrides; sí es un hueco de seed. |
| **Asistentes** | Seed sin `rol_permisos`. | Mapa de flags de un asistente recién creado: sin confirmar. |
| **Soporte vs ícono Admin** | Rol `soporte` + `gestionar_soporte`. | Sin confirmar que vea Admin si `profiles.role` no es `admin`. |
| **Herramientas fuera del rail RH** | Liner/Cerrador/OPC en sala RH no tienen Herramientas en el sidebar. | Acceso a Survey/Worksheet es por expediente o URL. Si el piso necesita el hub `/tools`, hoy no está en esos 3 iconos. |

---

## 8. Qué no se tocó en este recorte

Este archivo es **solo documentación**. No cambia seeds, RPC ni flags. Ajustes de producto (p. ej. ligar `opc` → `opc-lobby` en staging, o meter Herramientas en el compact nav) van en una tarea aparte.
