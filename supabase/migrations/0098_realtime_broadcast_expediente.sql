-- 0098: INSERT broadcast en realtime.messages solo para topics expediente:{uuid}
-- con user_can_access_prospect. NO amplía presence ni canales de contactos.
--
-- ESTADO: versionada para revisión. NO aplicar en producción sin OK explícito,
-- snapshot de políticas y rollback listo (ver docs/arquitectura/pendiente-bloqueo-campos-collab.md).
--
-- Cambio vs prod actual (2026-10-17, SOLO LECTURA):
--   Hoy: 4 policies (presence_listen_contacts, presence_listen_expediente,
--         presence_track_expediente, presence_track_own). Sin broadcast_expediente.
--   Tras: +1 policy INSERT extension='broadcast' con el mismo predicado de acceso
--         que presence_track_expediente (user_can_access_prospect + topic expediente).

drop policy if exists "broadcast_expediente" on realtime.messages;

create policy "broadcast_expediente"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast')
  and public.presence_prospect_from_topic((select realtime.topic())) is not null
  and public.user_can_access_prospect(
    (select auth.uid()),
    public.presence_prospect_from_topic((select realtime.topic()))
  )
);

-- GRANT select/insert ya otorgados en 0031; no se amplían privilegios de tabla.
comment on policy "broadcast_expediente" on realtime.messages is
  'field_lock/field_unlock (broadcast) en expediente:{uuid}; mismo acceso que presence';
