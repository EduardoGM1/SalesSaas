-- Chat tipado + negociación de permisos + invites externos
-- message_type / metadata en direct_messages
-- share_permission_requests (un pending por share)
-- prospect_share_invites (token con permiso)

alter table public.direct_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'direct_messages_message_type_check'
  ) then
    alter table public.direct_messages
      add constraint direct_messages_message_type_check
      check (message_type in ('text', 'access_granted', 'permission_request', 'permission_response'));
  end if;
end $$;

comment on column public.direct_messages.message_type is
  'text | access_granted | permission_request | permission_response';
comment on column public.direct_messages.metadata is
  'Payload estructurado para tarjetas de share/permisos';

-- ---------- Solicitudes de cambio de permiso ----------

create table if not exists public.share_permission_requests (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.prospect_shares(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  from_permission public.share_permission not null,
  to_permission public.share_permission not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  request_message_id uuid references public.direct_messages(id) on delete set null,
  response_message_id uuid references public.direct_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint share_permission_requests_escalation check (from_permission is distinct from to_permission)
);

create unique index if not exists share_perm_req_one_pending
  on public.share_permission_requests (share_id)
  where status = 'pending';

create index if not exists share_perm_req_owner_idx
  on public.share_permission_requests (owner_id, status);

create index if not exists share_perm_req_requester_idx
  on public.share_permission_requests (requester_id, status);

alter table public.share_permission_requests enable row level security;

create policy "share_perm_req_select_participant" on public.share_permission_requests
  for select using (auth.uid() = owner_id or auth.uid() = requester_id);

create policy "share_perm_req_insert_requester" on public.share_permission_requests
  for insert with check (
    auth.uid() = requester_id
    and exists (
      select 1 from public.prospect_shares ps
      where ps.id = share_id
        and ps.shared_with_id = auth.uid()
        and ps.owner_id = owner_id
        and ps.prospect_id = prospect_id
    )
  );

create policy "share_perm_req_update_owner" on public.share_permission_requests
  for update using (auth.uid() = owner_id);

-- ---------- Invites externos (token + permiso) ----------

create table if not exists public.prospect_share_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  permission public.share_permission not null default 'view',
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  redeemed_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists prospect_share_invites_owner_idx
  on public.prospect_share_invites (owner_id);

create index if not exists prospect_share_invites_prospect_idx
  on public.prospect_share_invites (prospect_id);

alter table public.prospect_share_invites enable row level security;

-- Dueño gestiona sus invites
create policy "share_invites_select_owner" on public.prospect_share_invites
  for select using (auth.uid() = owner_id);

create policy "share_invites_insert_owner" on public.prospect_share_invites
  for insert with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.prospects pr
      where pr.id = prospect_id and pr.user_id = auth.uid()
    )
  );

create policy "share_invites_update_owner" on public.prospect_share_invites
  for update using (auth.uid() = owner_id);

-- Lectura pública del token activo (solo para canje autenticado vía API;
-- RLS permite SELECT por token a autenticados; el redeem usa service role o esta policy)
create policy "share_invites_select_active_token" on public.prospect_share_invites
  for select using (
    auth.uid() is not null
    and revoked_at is null
    and expires_at > now()
  );

comment on table public.share_permission_requests is
  'Solicitudes de escalado de permiso negociadas en el chat.';
comment on table public.prospect_share_invites is
  'Invites por link externo con permiso predefinido.';
