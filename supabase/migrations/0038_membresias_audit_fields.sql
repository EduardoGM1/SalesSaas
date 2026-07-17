-- Auditoría de asignación de plan (quién cambió y cuándo).
alter table public.membresias
  add column if not exists cambiado_por uuid references public.profiles(id) on delete set null;

alter table public.membresias
  add column if not exists fecha_cambio timestamptz;

comment on column public.membresias.cambiado_por is 'Usuario (admin) que asignó esta membresía; puede ser el mismo usuario (autoasignación).';
comment on column public.membresias.fecha_cambio is 'Momento en que se registró la asignación/cambio de plan.';
