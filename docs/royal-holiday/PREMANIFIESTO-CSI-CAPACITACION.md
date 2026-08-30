# Premanifiesto RH — Notas CSI para capacitación del equipo

> Documento de **proceso**, no de implementación. La Fase 1 ya protege `notas_csi` en base de datos; este material es para cuando entrenes a Marketing, OPC, Reps y Gerentes.

## Qué es CSI en Premanifiesto

- **`notes`**: notas operativas visibles según permisos generales del módulo.
- **`notas_csi`**: información sensible de contexto comercial / lobby (motivos de rechazo, objeciones, perfil del huésped, etc.).

La columna CSI **nunca** aparece en SELECT genérico ni en listados sin autorización. Solo se proyecta vía RPC cuando el caller pasa la matriz de acceso.

## Matriz de acceso (resumen)

| Rol / flag | Ve `notas_csi` | Edita registro |
|------------|----------------|----------------|
| Marketing (`rh.tool.premanifiesto.marketing`) | Sí, todo el día | Sí |
| Gerente (rol `gerente` en sala, vía `rh.tool.ops`) | Sí, su equipo / día | Solo lectura calendario; crear/editar exige flag marketing |
| Rep asignado (`rh.tool.premanifiesto.rep`) | Solo su caso | Sí en su caso (comercial al tomar caso) |
| OPC (`rh.tool.premanifiesto.opc`) | Solo invitaciones propias pendientes | Solo su invitación pendiente |
| Delegación CSI (`rh.tool.premanifiesto.csi`) | Según fila autorizada | Según PATCH permitido |

## Riesgo conversacional (proceso, no código)

Aunque la base de datos oculte CSI a quien no corresponde, **el riesgo principal es humano**:

1. **Reenvío verbal o por chat** — Un rep o gerente puede repetir en voz alta lo que leyó en CSI durante la reunión de olas.
2. **Capturas de pantalla** — Marketing con acceso total puede compartir pantalla con datos CSI visibles.
3. **Mezcla de canales** — Copiar/pegar `notas_csi` en WhatsApp, email o notas del prospect en CRM sin clasificar.

### Recomendaciones para el entrenamiento

- Tratar `notas_csi` como **confidencial interno**: no leer en voz alta en lobby ni frente a huéspedes.
- En sala, usar lenguaje neutral (“pareja calificada”, “pendiente de show”) sin detallar objeciones CSI.
- No pegar CSI en campos públicos del CRM; si hace falta contexto comercial, usar campos privados del prospect **después** de vincularlo explícitamente.
- El flag `.csi` es para **delegaciones puntuales** (supervisión, auditoría), no para ampliar acceso por comodidad.
- OPC: recordar que solo ven CSI de **sus** invitaciones mientras están pendientes; al tomar el caso un rep, el contexto CSI pasa al circuito rep/gerente/marketing.

## Prospectos y lobby

- OPC **no** crea prospect automático al guardar invitación; solo `prospect_nombre`.
- El prospect en CRM se crea/vincula cuando Marketing o el Rep asignado lo hace **explícitamente** al tomar el caso.
- Evita llenar el CRM con conversaciones de lobby que nunca llegaron a sala.

## Cancelaciones y cupo

- `status = cancelado` **libera cupo** de la ola (no cuenta en el enforcement transaccional).
- Marketing o rep asignado pueden cancelar según permisos del RPC.

## Referencia técnica (Fase 1)

- RPC enforcement: `rh_premanifiesto_registrar_pareja` + `pg_advisory_xact_lock` → error `PM_CUPO_LLENO`.
- Proyección condicional: `rh_premanifiesto_row_json` + `rh_premanifiesto_can_view_csi`.
- Campos comerciales bloqueados con `comercial_bloqueado` hasta que el rep toma el caso.
