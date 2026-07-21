-- 0052: Chats grupales (reutilizan message_type/metadata) + sync con grupos de vendedores
-- Direct 1:1 sigue en direct_messages. Grupos usan chat_conversations/messages.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  name text,
  grupo_id uuid unique references public.grupos(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz null,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_chat_participants_user on public.chat_participants (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  message_type text not null default 'text'
    check (message_type in ('text', 'access_granted', 'permission_request', 'permission_response')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_conversation_created
  on public.chat_messages (conversation_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

create or replace function public.is_chat_participant(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_participants
    where conversation_id = p_conversation_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_chat_participant(uuid, uuid) to authenticated;

drop policy if exists chat_conv_select on public.chat_conversations;
create policy chat_conv_select on public.chat_conversations
  for select to authenticated
  using (public.is_chat_participant(id) or public.is_super_admin());

drop policy if exists chat_conv_insert on public.chat_conversations;
create policy chat_conv_insert on public.chat_conversations
  for insert to authenticated
  with check (created_by = auth.uid() or public.is_super_admin());

drop policy if exists chat_conv_update on public.chat_conversations;
create policy chat_conv_update on public.chat_conversations
  for update to authenticated
  using (public.is_chat_participant(id) or public.is_super_admin());

drop policy if exists chat_part_select on public.chat_participants;
create policy chat_part_select on public.chat_participants
  for select to authenticated
  using (public.is_chat_participant(conversation_id) or public.is_super_admin());

drop policy if exists chat_part_all_super on public.chat_participants;
create policy chat_part_all_super on public.chat_participants
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Participantes pueden actualizar su last_read_at
drop policy if exists chat_part_update_self on public.chat_participants;
create policy chat_part_update_self on public.chat_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists chat_msg_select on public.chat_messages;
create policy chat_msg_select on public.chat_messages
  for select to authenticated
  using (public.is_chat_participant(conversation_id) or public.is_super_admin());

drop policy if exists chat_msg_insert on public.chat_messages;
create policy chat_msg_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_chat_participant(conversation_id)
  );

-- Sync chat grupal al crear/actualizar grupo (SECURITY DEFINER)
create or replace function public.sync_grupo_chat(p_grupo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
  v_nombre text;
  v_gerente uuid;
begin
  select nombre, gerente_id into v_nombre, v_gerente
  from public.grupos where id = p_grupo_id;
  if not found then
    raise exception 'Grupo no encontrado';
  end if;

  select id into v_conv from public.chat_conversations where grupo_id = p_grupo_id;
  if v_conv is null then
    insert into public.chat_conversations (kind, name, grupo_id, created_by)
    values ('group', coalesce(v_nombre, 'Equipo'), p_grupo_id, v_gerente)
    returning id into v_conv;
  else
    update public.chat_conversations
    set name = coalesce(v_nombre, name)
    where id = v_conv;
  end if;

  -- Gerente + miembros
  insert into public.chat_participants (conversation_id, user_id)
  values (v_conv, v_gerente)
  on conflict do nothing;

  insert into public.chat_participants (conversation_id, user_id)
  select v_conv, m.usuario_id
  from public.grupo_miembros m
  where m.grupo_id = p_grupo_id
  on conflict do nothing;

  -- Quitar quienes ya no están (excepto si no hay miembros, conservar gerente)
  delete from public.chat_participants cp
  where cp.conversation_id = v_conv
    and cp.user_id <> v_gerente
    and not exists (
      select 1 from public.grupo_miembros m
      where m.grupo_id = p_grupo_id and m.usuario_id = cp.user_id
    );

  return v_conv;
end;
$$;

grant execute on function public.sync_grupo_chat(uuid) to authenticated;

-- Extender admin_upsert_grupo para sincronizar chat
create or replace function public.admin_upsert_grupo(
  p_id uuid,
  p_nombre text,
  p_gerente_id uuid,
  p_organizacion_id uuid default null,
  p_miembro_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org uuid;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'No autorizado';
  end if;

  v_org := coalesce(
    p_organizacion_id,
    (select organizacion_id from public.profiles where id = p_gerente_id),
    'b0000000-0000-4000-8000-000000000001'::uuid
  );

  if p_id is null then
    insert into public.grupos (organizacion_id, nombre, gerente_id)
    values (v_org, trim(p_nombre), p_gerente_id)
    returning id into v_id;
  else
    update public.grupos
    set nombre = trim(p_nombre),
        gerente_id = p_gerente_id,
        organizacion_id = v_org
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Grupo no encontrado'; end if;
    delete from public.grupo_miembros where grupo_id = v_id;
  end if;

  insert into public.grupo_miembros (grupo_id, usuario_id)
  select v_id, unnest(coalesce(p_miembro_ids, '{}'))
  on conflict do nothing;

  perform public.sync_grupo_chat(v_id);
  return v_id;
end;
$$;

grant execute on function public.admin_upsert_grupo(uuid, text, uuid, uuid, uuid[]) to authenticated;

-- Backfill chats para grupos existentes
do $$
declare
  g record;
begin
  for g in select id from public.grupos loop
    perform public.sync_grupo_chat(g.id);
  end loop;
end $$;

-- Realtime (si la publicación existe)
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null;
  when undefined_object then null;
  end;
end $$;

comment on table public.chat_conversations is 'Conversaciones: group (equipo) o future direct. 1:1 legacy sigue en direct_messages.';
comment on table public.chat_messages is 'Mensajes de chat grupal; mismos message_type/metadata que direct_messages.';
