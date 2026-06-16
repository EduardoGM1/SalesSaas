-- ============================================================
-- MVP red social: contactos, mensajes y compartir expedientes
-- ============================================================

create type public.connection_status as enum ('pending', 'accepted', 'blocked');

create table if not exists public.user_connections (
  id             uuid primary key default gen_random_uuid(),
  requester_id   uuid not null references public.profiles(id) on delete cascade,
  addressee_id   uuid not null references public.profiles(id) on delete cascade,
  status         public.connection_status not null default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint user_connections_no_self check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create index if not exists user_connections_requester_idx on public.user_connections (requester_id);
create index if not exists user_connections_addressee_idx on public.user_connections (addressee_id);
create index if not exists user_connections_status_idx on public.user_connections (status);

create trigger user_connections_set_updated_at
  before update on public.user_connections
  for each row execute function public.set_updated_at();

create table if not exists public.direct_messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  body          text not null check (char_length(trim(body)) > 0),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint direct_messages_no_self check (sender_id <> recipient_id)
);

create index if not exists direct_messages_recipient_idx
  on public.direct_messages (recipient_id, created_at desc);
create index if not exists direct_messages_sender_idx
  on public.direct_messages (sender_id, created_at desc);

-- ---------- Helpers ----------

create or replace function public.users_are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_connections c
    where c.status = 'accepted'
      and (
        (c.requester_id = a and c.addressee_id = b)
        or (c.requester_id = b and c.addressee_id = a)
      )
  );
$$;

create or replace function public.search_profiles(search_q text, result_limit int default 20)
returns table (
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  connection_status public.connection_status,
  connection_direction text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q text := trim(coalesce(search_q, ''));
  lim int := least(greatest(coalesce(result_limit, 20), 1), 50);
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if length(q) < 2 then
    return;
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.email,
    p.avatar_url,
    c.status as connection_status,
    case
      when c.requester_id = uid then 'outgoing'
      when c.addressee_id = uid then 'incoming'
      else 'none'
    end as connection_direction
  from public.profiles p
  left join lateral (
    select uc.status, uc.requester_id, uc.addressee_id
    from public.user_connections uc
    where (uc.requester_id = uid and uc.addressee_id = p.id)
       or (uc.requester_id = p.id and uc.addressee_id = uid)
    limit 1
  ) c on true
  where p.id <> uid
    and coalesce(p.is_active, true) = true
    and (
      coalesce(p.full_name, '') ilike '%' || q || '%'
      or coalesce(p.email, '') ilike '%' || q || '%'
    )
  order by p.full_name nulls last, p.email
  limit lim;
end;
$$;

grant execute on function public.users_are_connected(uuid, uuid) to authenticated;
grant execute on function public.search_profiles(text, int) to authenticated;

-- Perfiles visibles para contactos y solicitudes pendientes
create policy "profiles_select_network" on public.profiles
  for select using (
    auth.uid() = id
    or public.users_are_connected(auth.uid(), id)
    or exists (
      select 1
      from public.user_connections c
      where c.status in ('pending', 'accepted')
        and (
          (c.requester_id = auth.uid() and c.addressee_id = profiles.id)
          or (c.addressee_id = auth.uid() and c.requester_id = profiles.id)
        )
    )
  );

-- ---------- RLS ----------

alter table public.user_connections enable row level security;
alter table public.direct_messages enable row level security;
alter table public.prospect_shares enable row level security;

create policy "connections_select_participant" on public.user_connections
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "connections_insert_requester" on public.user_connections
  for insert with check (auth.uid() = requester_id and status = 'pending');

create policy "connections_update_participant" on public.user_connections
  for update using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "connections_delete_participant" on public.user_connections
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "messages_select_participant" on public.direct_messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "messages_insert_sender" on public.direct_messages
  for insert with check (
    auth.uid() = sender_id
    and public.users_are_connected(sender_id, recipient_id)
  );

create policy "messages_update_recipient_read" on public.direct_messages
  for update using (auth.uid() = recipient_id);

create policy "shares_select_participant" on public.prospect_shares
  for select using (auth.uid() = owner_id or auth.uid() = shared_with_id);

create policy "shares_insert_owner" on public.prospect_shares
  for insert with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.prospects pr
      where pr.id = prospect_id and pr.user_id = auth.uid()
    )
    and public.users_are_connected(auth.uid(), shared_with_id)
  );

create policy "shares_update_owner" on public.prospect_shares
  for update using (auth.uid() = owner_id);

create policy "shares_delete_owner" on public.prospect_shares
  for delete using (auth.uid() = owner_id);

create policy "prospects_select_shared" on public.prospects
  for select using (
    exists (
      select 1 from public.prospect_shares ps
      where ps.prospect_id = prospects.id
        and ps.shared_with_id = auth.uid()
    )
  );

create policy "prospects_update_shared_edit" on public.prospects
  for update using (
    exists (
      select 1 from public.prospect_shares ps
      where ps.prospect_id = prospects.id
        and ps.shared_with_id = auth.uid()
        and ps.permission = 'edit'::public.share_permission
    )
  );

comment on table public.user_connections is 'Solicitudes y contactos entre vendedores.';
comment on table public.direct_messages is 'Mensajes directos entre contactos aceptados.';
