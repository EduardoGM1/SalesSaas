-- Fix autorización Presence de expediente (mismo patrón que 0019).
-- SELECT en join falla si se exige extension='presence' antes de existir mensaje.

create or replace function public.presence_prospect_from_topic(topic text)
returns uuid
language sql
immutable
as $$
  select case
    when regexp_replace(coalesce(topic, ''), '^realtime:', '')
      ~ '^expediente:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substring(regexp_replace(topic, '^realtime:', '') from 'expediente:(.+)$')::uuid
    else null
  end;
$$;

create or replace function public.user_can_access_prospect(uid uuid, prospect_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    uid is not null
    and prospect_id is not null
    and (
      exists (
        select 1 from public.prospects p
        where p.id = prospect_id and p.user_id = uid
      )
      or exists (
        select 1 from public.prospect_shares ps
        where ps.prospect_id = prospect_id and ps.shared_with_id = uid
      )
    );
$$;

revoke all on function public.presence_prospect_from_topic(text) from public;
revoke all on function public.user_can_access_prospect(uuid, uuid) from public;
grant execute on function public.presence_prospect_from_topic(text) to authenticated, service_role;
grant execute on function public.user_can_access_prospect(uuid, uuid) to authenticated, service_role;

drop policy if exists "presence_listen_expediente" on realtime.messages;
drop policy if exists "presence_track_expediente" on realtime.messages;

-- JOIN / lectura: solo topic + acceso (sin exigir extension)
create policy "presence_listen_expediente"
on realtime.messages
for select
to authenticated
using (
  public.presence_prospect_from_topic((select realtime.topic())) is not null
  and public.user_can_access_prospect(
    (select auth.uid()),
    public.presence_prospect_from_topic((select realtime.topic()))
  )
);

-- Track / escritura: sí exige extension presence
create policy "presence_track_expediente"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('presence')
  and public.presence_prospect_from_topic((select realtime.topic())) is not null
  and public.user_can_access_prospect(
    (select auth.uid()),
    public.presence_prospect_from_topic((select realtime.topic()))
  )
);

grant usage on schema realtime to authenticated, service_role;
grant select, insert on table realtime.messages to authenticated, service_role;

-- Cooldown por si 0030 no se aplicó completo
create table if not exists public.notification_cooldowns (
  key text primary key,
  last_sent_at timestamptz not null default now()
);

alter table public.notification_cooldowns enable row level security;
