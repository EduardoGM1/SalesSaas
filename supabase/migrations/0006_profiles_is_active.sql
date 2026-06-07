-- Cuenta activa/desactivada (bloqueo sin eliminar auth.users ni datos).

alter table public.profiles
  add column if not exists is_active boolean not null default true;

create index if not exists profiles_is_active_idx on public.profiles (is_active);
