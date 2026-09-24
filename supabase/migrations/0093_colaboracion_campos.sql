-- Cambio 4 (SDD-03): colaboración en columnas propias.
-- No modifica políticas RLS: las filas de prospect_workflows siguen las políticas vigentes.
-- No vacía gerente_id. El vacío por defecto lo aplica el alta nueva, no esta migración.
-- Calificación Final, Estatus tour y Estatus venta quedan sin catálogo hasta que Mich lo defina.

alter table public.prospect_workflows
  add column if not exists hostes_id uuid references public.profiles (id),
  add column if not exists filtro_id uuid references public.profiles (id),
  add column if not exists opc_id uuid references public.profiles (id),
  add column if not exists liner_id uuid references public.profiles (id),
  add column if not exists ftb_id uuid references public.profiles (id),
  add column if not exists inhouse_closer1_id uuid references public.profiles (id),
  add column if not exists inhouse_closer2_id uuid references public.profiles (id),
  add column if not exists imagen_id uuid references public.profiles (id),
  add column if not exists self_gen_id uuid references public.profiles (id),
  add column if not exists members_closer1_id uuid references public.profiles (id),
  add column if not exists members_closer2_id uuid references public.profiles (id),
  add column if not exists contrato text,
  add column if not exists vlo text,
  add column if not exists resultado_prospect_id text,
  add column if not exists calificacion_final text,
  add column if not exists estatus_tour text,
  add column if not exists estatus_venta text;

comment on column public.prospect_workflows.contrato is
  'Identificador de contrato. Letras y números, columna propia.';
comment on column public.prospect_workflows.vlo is
  'Identificador VLO. Letras y números, columna propia.';
comment on column public.prospect_workflows.resultado_prospect_id is
  'Prospect ID de colaboración (texto). No es el uuid del expediente.';
comment on column public.prospect_workflows.calificacion_final is
  'Pendiente de catálogo (Mich). Sin valores hasta que se definan.';
comment on column public.prospect_workflows.estatus_tour is
  'Pendiente de catálogo (Mich). Sin valores hasta que se definan.';
comment on column public.prospect_workflows.estatus_venta is
  'Pendiente de catálogo (Mich). Sin valores hasta que se definan.';
