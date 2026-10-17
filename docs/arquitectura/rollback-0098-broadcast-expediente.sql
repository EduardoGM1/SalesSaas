-- Rollback exacto de 0098_realtime_broadcast_expediente.sql
-- Restaura el estado post-incidente 2026-10-14 (sin policy broadcast).
-- presence_* y contactos quedan intactos.

DROP POLICY IF EXISTS "broadcast_expediente" ON realtime.messages;
