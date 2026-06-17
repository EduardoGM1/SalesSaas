-- Presencia de contactos: última conexión + autorización Realtime Presence

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is 'Última desconexión; visible solo a contactos aceptados.';

-- Extrae el user_id del topic presence:user:{uuid}
create or replace function public.presence_user_from_topic(topic text)
returns uuid
language sql
immutable
as $$
  select case
    when topic like 'presence:user:%'
    then substring(topic from 'presence:user:(.+)$')::uuid
    else null
  end;
$$;

-- ---------- Realtime Authorization (Presence privado) ----------

create policy "presence_track_own"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and realtime.topic() = 'presence:user:' || auth.uid()::text
);

create policy "presence_listen_contacts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and public.presence_user_from_topic(realtime.topic()) is not null
  and (
    public.presence_user_from_topic(realtime.topic()) = auth.uid()
    or public.users_are_connected(
      auth.uid(),
      public.presence_user_from_topic(realtime.topic())
    )
  )
);
