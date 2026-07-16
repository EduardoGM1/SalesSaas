-- Planes, membresías e catálogo de funciones premium (fase 1: solo money_box).

create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  precio numeric(12, 2) not null default 0,
  moneda text not null default 'USD',
  frecuencia_cobro text not null default 'mensual'
    check (frecuencia_cobro in ('mensual', 'anual', 'unico', 'ninguna')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.membresias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.planes(id),
  estado text not null default 'activa'
    check (estado in ('activa', 'vencida', 'cancelada', 'en_prueba')),
  fecha_inicio timestamptz not null default now(),
  fecha_proximo_cobro timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists membresias_usuario_idx
  on public.membresias (usuario_id, fecha_inicio desc);

create index if not exists membresias_usuario_estado_idx
  on public.membresias (usuario_id, estado);

create table if not exists public.funciones_premium (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre_visible text not null,
  herramienta_padre text not null,
  plan_minimo_requerido uuid not null references public.planes(id),
  created_at timestamptz not null default now()
);

insert into public.planes (nombre, precio, moneda, frecuencia_cobro, activo)
values
  ('basico', 0, 'USD', 'ninguna', true),
  ('pro', 0, 'USD', 'mensual', true)
on conflict (nombre) do nothing;

insert into public.funciones_premium (clave, nombre_visible, herramienta_padre, plan_minimo_requerido)
select
  'money_box',
  'Money Box',
  'worksheet',
  p.id
from public.planes p
where p.nombre = 'pro'
on conflict (clave) do nothing;

-- Backfill: usuarios sin membresía activa → básico.
insert into public.membresias (usuario_id, plan_id, estado, fecha_inicio)
select pr.id, pl.id, 'activa', now()
from public.profiles pr
cross join public.planes pl
where pl.nombre = 'basico'
  and not exists (
    select 1 from public.membresias m
    where m.usuario_id = pr.id
      and m.estado in ('activa', 'en_prueba')
  );

alter table public.planes enable row level security;
alter table public.membresias enable row level security;
alter table public.funciones_premium enable row level security;

drop policy if exists "Authenticated read planes" on public.planes;
create policy "Authenticated read planes"
  on public.planes for select to authenticated
  using (true);

drop policy if exists "Authenticated read funciones_premium" on public.funciones_premium;
create policy "Authenticated read funciones_premium"
  on public.funciones_premium for select to authenticated
  using (true);

drop policy if exists "Users read own membresias" on public.membresias;
create policy "Users read own membresias"
  on public.membresias for select to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "Admins read all membresias" on public.membresias;
create policy "Admins read all membresias"
  on public.membresias for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_super_admin = true or p.role = 'admin')
    )
  );

grant select on public.planes to authenticated;
grant select on public.funciones_premium to authenticated;
grant select on public.membresias to authenticated;
grant all on public.planes to service_role;
grant all on public.membresias to service_role;
grant all on public.funciones_premium to service_role;

-- Plan vigente del usuario (última activa/en_prueba).
create or replace function public.current_membership(p_user_id uuid)
returns table (
  plan_nombre text,
  membresia_estado text,
  fecha_inicio timestamptz,
  fecha_proximo_cobro timestamptz,
  plan_id uuid,
  membresia_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pl.nombre,
    m.estado,
    m.fecha_inicio,
    m.fecha_proximo_cobro,
    pl.id,
    m.id
  from public.membresias m
  join public.planes pl on pl.id = m.plan_id
  where m.usuario_id = p_user_id
    and m.estado in ('activa', 'en_prueba')
  order by m.fecha_inicio desc
  limit 1;
$$;

grant execute on function public.current_membership(uuid) to authenticated;
grant execute on function public.current_membership(uuid) to service_role;

comment on table public.planes is 'Catálogo de planes (basico, pro, …).';
comment on table public.membresias is 'Histórico de membresías por usuario; el vigente es la última activa/en_prueba.';
comment on table public.funciones_premium is 'Catálogo extensible de features PRO; fase 1 solo money_box.';
