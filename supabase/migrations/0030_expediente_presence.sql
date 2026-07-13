-- Presencia Realtime por expediente + cooldown de push de cambios.

-- Extrae prospect_id del topic expediente:{uuid}
create or replace function public.presence_prospect_from_topic(topic text)
returns uuid
language sql
immutable
as $$
  select case
    when topic ~ '^expediente:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substring(topic from 'expediente:(.+)$')::uuid
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
  select exists (
    select 1 from public.prospects p
    where p.id = prospect_id and p.user_id = uid
  )
  or exists (
    select 1 from public.prospect_shares ps
    where ps.prospect_id = prospect_id and ps.shared_with_id = uid
  );
$$;

revoke all on function public.user_can_access_prospect(uuid, uuid) from public;
grant execute on function public.user_can_access_prospect(uuid, uuid) to authenticated;

create policy "presence_track_expediente"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and public.presence_prospect_from_topic(realtime.topic()) is not null
  and public.user_can_access_prospect(
    auth.uid(),
    public.presence_prospect_from_topic(realtime.topic())
  )
);

create policy "presence_listen_expediente"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and public.presence_prospect_from_topic(realtime.topic()) is not null
  and public.user_can_access_prospect(
    auth.uid(),
    public.presence_prospect_from_topic(realtime.topic())
  )
);

-- Throttle de push: key = recipient:prospect:section
create table if not exists public.notification_cooldowns (
  key text primary key,
  last_sent_at timestamptz not null default now()
);

comment on table public.notification_cooldowns is
  'Cooldown server-side para agrupar push de cambios de expediente (30s).';

alter table public.notification_cooldowns enable row level security;
-- Solo service role (bypass RLS); sin policies para authenticated.
