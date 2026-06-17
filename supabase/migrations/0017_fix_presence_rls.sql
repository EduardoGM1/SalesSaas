-- Corrige políticas RLS de Realtime Presence (sintaxis recomendada por Supabase + grants)

drop policy if exists "presence_track_own" on realtime.messages;
drop policy if exists "presence_listen_contacts" on realtime.messages;

-- Tolera topic con o sin prefijo interno "realtime:"
create or replace function public.presence_user_from_topic(topic text)
returns uuid
language sql
stable
as $$
  select (
    regexp_match(
      regexp_replace(coalesce(topic, ''), '^realtime:', ''),
      '^presence:user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$',
      'i'
    )
  )[1]::uuid;
$$;

grant execute on function public.presence_user_from_topic(text) to authenticated;

create policy "presence_track_own"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('presence')
  and public.presence_user_from_topic((select realtime.topic())) = (select auth.uid())
);

create policy "presence_listen_contacts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('presence')
  and public.presence_user_from_topic((select realtime.topic())) is not null
  and (
    public.presence_user_from_topic((select realtime.topic())) = (select auth.uid())
    or public.users_are_connected(
      (select auth.uid()),
      public.presence_user_from_topic((select realtime.topic()))
    )
  )
);

grant select, insert on table realtime.messages to authenticated;
