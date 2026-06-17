-- La política SELECT con `extension in ('presence')` puede fallar en la autorización
-- de join (antes de que exista mensaje con extension). Simplificamos SELECT por topic.

drop policy if exists "presence_listen_contacts" on realtime.messages;

create policy "presence_listen_contacts"
on realtime.messages
for select
to authenticated
using (
  public.presence_user_from_topic((select realtime.topic())) is not null
  and (
    public.presence_user_from_topic((select realtime.topic())) = (select auth.uid())
    or public.users_are_connected(
      (select auth.uid()),
      public.presence_user_from_topic((select realtime.topic()))
    )
  )
);

-- INSERT sigue exigiendo extension presence (publicar estado)
drop policy if exists "presence_track_own" on realtime.messages;

create policy "presence_track_own"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('presence')
  and public.presence_user_from_topic((select realtime.topic())) = (select auth.uid())
);

grant usage on schema realtime to authenticated, service_role;
grant select, insert on table realtime.messages to authenticated, service_role;
