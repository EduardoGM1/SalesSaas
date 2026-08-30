-- Fix 42P17: chat_members_select_peer se auto-referenciaba en EXISTS.
-- Helper SECURITY DEFINER evita recursión RLS en chat_members / chat_conversations / chat_messages.

create or replace function public.user_is_active_chat_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_conversation_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.chat_members m
      where m.conversation_id = p_conversation_id
        and m.usuario_id = auth.uid()
        and m.left_at is null
    );
$$;

revoke all on function public.user_is_active_chat_member(uuid) from public;
grant execute on function public.user_is_active_chat_member(uuid) to authenticated, service_role;

comment on function public.user_is_active_chat_member(uuid, uuid) is
  'Comprueba membresía activa en chat de expediente sin disparar RLS recursivo.';

drop policy if exists "chat_members_select_peer" on public.chat_members;
create policy "chat_members_select_peer" on public.chat_members
  for select to authenticated
  using (public.user_is_active_chat_member(conversation_id));

drop policy if exists "chat_conversations_select_member" on public.chat_conversations;
create policy "chat_conversations_select_member" on public.chat_conversations
  for select to authenticated
  using (public.user_is_active_chat_member(id));

drop policy if exists "chat_messages_select_member" on public.chat_messages;
create policy "chat_messages_select_member" on public.chat_messages
  for select to authenticated
  using (public.user_is_active_chat_member(conversation_id));

drop policy if exists "chat_messages_insert_member" on public.chat_messages;
create policy "chat_messages_insert_member" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.user_is_active_chat_member(conversation_id)
  );
