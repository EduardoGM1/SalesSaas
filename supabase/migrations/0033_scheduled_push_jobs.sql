-- Cola de push programados (follow-ups / notas a hora exacta).
-- OneSignal send_after no es fiable en web push; enviamos al vencer vía flush (mismo canal que mensajes).

create table if not exists public.scheduled_push_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  send_at      timestamptz not null,
  push_type    text not null,
  title        text not null,
  body         text not null,
  path         text not null default '/',
  tag          text not null,
  entry_key    text,
  status       text not null default 'pending'
                 check (status in ('pending', 'sent', 'cancelled', 'failed')),
  attempts     int not null default 0,
  last_error   text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists scheduled_push_jobs_due_idx
  on public.scheduled_push_jobs (status, send_at)
  where status = 'pending';

create index if not exists scheduled_push_jobs_user_idx
  on public.scheduled_push_jobs (user_id, created_at desc);

alter table public.scheduled_push_jobs enable row level security;

-- Solo service role escribe/lee para flush; usuarios no necesitan acceso directo.
drop policy if exists "Users read own scheduled push" on public.scheduled_push_jobs;
create policy "Users read own scheduled push"
  on public.scheduled_push_jobs for select to authenticated
  using (user_id = auth.uid());

grant select on public.scheduled_push_jobs to authenticated;
grant all on public.scheduled_push_jobs to service_role;

comment on table public.scheduled_push_jobs is
  'Cola de avisos push a hora exacta (follow-up / notas). Flush por cron o cliente.';
