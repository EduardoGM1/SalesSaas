-- Requerido para canales private + Presence (Realtime Authorization)
-- Sin esto, las políticas de 0015 no se aplican y la presencia queda siempre "desconectado".

alter table if exists realtime.messages enable row level security;
