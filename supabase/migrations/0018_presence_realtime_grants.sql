-- Grants de schema + función SECURITY DEFINER para evaluar presencia sin fallos de permisos cruzados

grant usage on schema realtime to authenticated, service_role;
grant select, insert on table realtime.messages to authenticated, service_role;

create or replace function public.can_access_presence_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  peer_id uuid;
  viewer_id uuid;
begin
  viewer_id := auth.uid();
  if viewer_id is null then
    return false;
  end if;

  peer_id := public.presence_user_from_topic(p_topic);
  if peer_id is null then
    return false;
  end if;

  if peer_id = viewer_id then
    return true;
  end if;

  return public.users_are_connected(viewer_id, peer_id);
end;
$$;

grant execute on function public.can_access_presence_topic(text) to authenticated;

drop policy if exists "presence_track_own" on realtime.messages;
drop policy if exists "presence_listen_contacts" on realtime.messages;

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
  and public.can_access_presence_topic((select realtime.topic()))
);
