-- Tombstones de expedientes borrados.
-- AFTER DELETE los registra. BEFORE INSERT impide que un sync los vuelva a crear.
-- La retención es 90 días. La limpieza mensual corre si pg_cron está disponible.

create table if not exists public.prospects_deleted (
  prospect_id uuid primary key,
  user_id uuid,
  prospect_code text,
  deleted_at timestamptz not null default now()
);

create unique index if not exists prospects_deleted_user_code_uidx
  on public.prospects_deleted (user_id, prospect_code)
  where user_id is not null and prospect_code is not null;

create index if not exists prospects_deleted_deleted_at_idx
  on public.prospects_deleted (deleted_at);

alter table public.prospects_deleted enable row level security;
alter table public.prospects_deleted force row level security;

revoke all on public.prospects_deleted from public, anon, authenticated;
grant select on public.prospects_deleted to authenticated, service_role;

drop policy if exists prospects_deleted_select_own on public.prospects_deleted;
create policy prospects_deleted_select_own
  on public.prospects_deleted
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.prospects_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.prospects_deleted (prospect_id, user_id, prospect_code, deleted_at)
  values (old.id, old.user_id, old.prospect_code, now())
  on conflict (prospect_id) do update
    set user_id = excluded.user_id,
        prospect_code = excluded.prospect_code,
        deleted_at = excluded.deleted_at;
  return old;
end;
$$;

create or replace function public.prospects_deleted_block_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.prospects_deleted d where d.prospect_id = new.id
  ) or exists (
    select 1
    from public.prospects_deleted d
    where d.user_id = new.user_id
      and d.prospect_code is not null
      and d.prospect_code = new.prospect_code
  ) then
    raise exception 'prospect_tombstone'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists prospects_deleted_after_delete on public.prospects;
create trigger prospects_deleted_after_delete
  after delete on public.prospects
  for each row execute function public.prospects_deleted_record();

drop trigger if exists prospects_deleted_before_insert on public.prospects;
create trigger prospects_deleted_before_insert
  before insert on public.prospects
  for each row execute function public.prospects_deleted_block_insert();

create or replace function public.purge_prospect_tombstones()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.prospects_deleted
  where deleted_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_prospect_tombstones() from public;
grant execute on function public.purge_prospect_tombstones() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('purge-prospect-tombstones');
    exception when others then
      null;
    end;
    perform cron.schedule(
      'purge-prospect-tombstones',
      '0 4 1 * *',
      'select public.purge_prospect_tombstones()'
    );
  end if;
end $$;
