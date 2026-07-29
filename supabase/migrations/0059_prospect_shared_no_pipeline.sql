-- ============================================================
-- 0059 — Expediente compartido sin pipeline + chat grupal
-- ------------------------------------------------------------
-- Elimina la semántica de etapas/workflow. Los participantes
-- (vendedor, gerente, cerrador) colaboran sobre el mismo
-- expediente. Chat grupal por expediente en la sala.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Asignar/reasignar Cerrador SIN avanzar etapas
-- ─────────────────────────────────────────────────────────────
create or replace function public.assign_prospect_closer(
  p_prospect_id uuid,
  p_actor_id uuid,
  p_cerrador_id uuid,
  p_actor_role text default 'gerente'
)
returns public.prospect_workflows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow public.prospect_workflows;
  v_prev uuid;
  v_is_reassign boolean := false;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_actor_id then
    raise exception 'No autorizado';
  end if;

  select * into v_workflow
  from public.prospect_workflows
  where prospect_id = p_prospect_id
  for update;
  if not found then raise exception 'Participantes del expediente no encontrados'; end if;
  if v_workflow.estado = 'cancelado' then
    raise exception 'El expediente está cancelado';
  end if;
  if not public.user_in_workspace(p_cerrador_id, v_workflow.workspace_id) then
    raise exception 'El cerrador no pertenece a esta sala';
  end if;

  v_prev := v_workflow.cerrador_id;
  v_is_reassign := v_prev is not null and v_prev is distinct from p_cerrador_id;

  if v_prev is not distinct from p_cerrador_id then
    return v_workflow;
  end if;

  update public.prospect_workflows
  set cerrador_id = p_cerrador_id,
      estado = case when estado = 'completado' then estado else 'en_progreso' end,
      version = version + 1,
      updated_at = now()
  where prospect_id = p_prospect_id
  returning * into v_workflow;

  insert into public.prospect_workflow_events (
    prospect_id, workspace_id, actor_id, actor_role, event_type,
    etapa_origen, etapa_destino, metadata
  ) values (
    p_prospect_id, v_workflow.workspace_id, p_actor_id, p_actor_role,
    case when v_is_reassign then 'cerrador_reasignado' else 'cerrador_asignado' end,
    null, null,
    jsonb_build_object(
      'cerrador_id', p_cerrador_id,
      'cerrador_anterior_id', v_prev
    )
  );

  return v_workflow;
end;
$$;

comment on function public.assign_prospect_closer(uuid, uuid, uuid, text) is
  'Asigna o reasigna Cerrador sobre el mismo expediente; no usa etapas de pipeline.';

-- Relajar check de etapas: ya no se usan para lógica de negocio.
-- Se mantienen columnas por compatibilidad; la app no las lee.
alter table public.prospect_workflows
  drop constraint if exists prospect_workflow_stage_check;

alter table public.prospect_workflows
  alter column etapa_actual set default 'abierto';

comment on column public.prospect_workflows.etapa_actual is
  'DEPRECATED: no usar. El expediente no tiene pipeline de etapas.';
comment on column public.prospect_workflows.estado is
  'Estado simple: en_progreso | completado | cancelado. Sin pipeline.';

-- ─────────────────────────────────────────────────────────────
-- 2) Chat grupal por expediente
-- ─────────────────────────────────────────────────────────────
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tipo text not null default 'expediente' check (tipo in ('expediente')),
  prospect_id uuid references public.prospects(id) on delete cascade,
  titulo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_conversations_prospect_unique unique (prospect_id)
);

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  rol text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (conversation_id, usuario_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  message_type text not null default 'text'
    check (message_type in ('text', 'prospect_card', 'system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_workspace_idx
  on public.chat_conversations (workspace_id, updated_at desc);
create index if not exists chat_members_user_idx
  on public.chat_members (usuario_id) where left_at is null;
create index if not exists chat_messages_thread_idx
  on public.chat_messages (conversation_id, created_at, id);

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_conversations_select_member" on public.chat_conversations;
create policy "chat_conversations_select_member" on public.chat_conversations
  for select to authenticated using (
    exists (
      select 1 from public.chat_members m
      where m.conversation_id = chat_conversations.id
        and m.usuario_id = auth.uid()
        and m.left_at is null
    )
  );

drop policy if exists "chat_members_select_peer" on public.chat_members;
create policy "chat_members_select_peer" on public.chat_members
  for select to authenticated using (
    exists (
      select 1 from public.chat_members me
      where me.conversation_id = chat_members.conversation_id
        and me.usuario_id = auth.uid()
        and me.left_at is null
    )
  );

drop policy if exists "chat_messages_select_member" on public.chat_messages;
create policy "chat_messages_select_member" on public.chat_messages
  for select to authenticated using (
    exists (
      select 1 from public.chat_members m
      where m.conversation_id = chat_messages.conversation_id
        and m.usuario_id = auth.uid()
        and m.left_at is null
    )
  );

drop policy if exists "chat_messages_insert_member" on public.chat_messages;
create policy "chat_messages_insert_member" on public.chat_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_members m
      where m.conversation_id = chat_messages.conversation_id
        and m.usuario_id = auth.uid()
        and m.left_at is null
    )
  );

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_members;
  exception when duplicate_object then null;
  end;
end $$;

-- Sincroniza miembros del chat con participantes del expediente.
create or replace function public.sync_prospect_chat_members(p_prospect_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wf public.prospect_workflows;
  v_conv_id uuid;
  v_titulo text;
  v_desired uuid[];
begin
  select * into v_wf from public.prospect_workflows where prospect_id = p_prospect_id;
  if not found then return null; end if;

  select coalesce(p.name1, p.name, p.prospect_code, 'Expediente')
  into v_titulo
  from public.prospects p where p.id = p_prospect_id;

  insert into public.chat_conversations (workspace_id, tipo, prospect_id, titulo)
  values (v_wf.workspace_id, 'expediente', p_prospect_id, v_titulo)
  on conflict (prospect_id) do update
    set titulo = excluded.titulo,
        workspace_id = excluded.workspace_id,
        updated_at = now()
  returning id into v_conv_id;

  v_desired := array_remove(array[
    v_wf.representante_id,
    v_wf.gerente_id,
    v_wf.cerrador_id
  ], null);

  -- Reactivar / insertar deseados
  insert into public.chat_members (conversation_id, usuario_id, rol, joined_at, left_at)
  select
    v_conv_id,
    uid,
    case
      when uid = v_wf.gerente_id then 'gerente'
      when uid = v_wf.cerrador_id then 'cerrador'
      else 'vendedor'
    end,
    now(),
    null
  from unnest(v_desired) as uid
  on conflict (conversation_id, usuario_id) do update
    set left_at = null,
        rol = excluded.rol,
        joined_at = case
          when public.chat_members.left_at is not null then now()
          else public.chat_members.joined_at
        end;

  -- Marcar salida de quienes ya no participan
  update public.chat_members
  set left_at = now()
  where conversation_id = v_conv_id
    and left_at is null
    and usuario_id <> all (v_desired);

  update public.chat_conversations set updated_at = now() where id = v_conv_id;
  return v_conv_id;
end;
$$;

revoke all on function public.sync_prospect_chat_members(uuid) from public;
grant execute on function public.sync_prospect_chat_members(uuid) to service_role;

-- Al crear participantes del expediente, crear chat (Gerente + Vendedor).
create or replace function public.prospect_participants_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_prospect_chat_members(new.prospect_id);
  return new;
end;
$$;

drop trigger if exists prospect_participants_chat_sync on public.prospect_workflows;
create trigger prospect_participants_chat_sync
after insert or update of representante_id, gerente_id, cerrador_id, workspace_id
on public.prospect_workflows
for each row execute function public.prospect_participants_after_insert();

comment on table public.chat_conversations is 'Chat grupal por expediente (sala); participantes = vendedor+gerente+cerrador.';
comment on table public.chat_members is 'Miembros activos/históricos del chat de expediente.';
comment on table public.chat_messages is 'Mensajes del chat grupal de expediente.';
