import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const q = require("../apps/web/src/lib/survey/discovery-questions.js");

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function j(o) {
  return esc(JSON.stringify(o));
}

const rows = [];
let orden = 10;
for (const item of q.MOTIVACIONES_BEFORE_STYLE) {
  rows.push({
    clave: item.id,
    seccion: "motivaciones",
    bloque: "before_style",
    texto: item.title,
    label_corto: null,
    tipo: item.max === 1 ? "chip_unico" : "chip_multiple",
    max: item.max,
    opciones: item.options,
    orden,
    with_context: true,
    numero: item.number,
  });
  orden += 10;
}
orden = 100;
for (const item of q.STYLE_QUESTIONS) {
  rows.push({
    clave: item.id,
    seccion: "motivaciones",
    bloque: "style",
    texto: item.label,
    label_corto: item.label,
    tipo: "chip_unico",
    max: item.max,
    opciones: item.options,
    orden,
    with_context: false,
    numero: null,
  });
  orden += 10;
}
orden = 200;
for (const item of q.MOTIVACIONES_AFTER_STYLE) {
  rows.push({
    clave: item.id,
    seccion: "motivaciones",
    bloque: "after_style",
    texto: item.title,
    label_corto: null,
    tipo: item.max === 1 ? "chip_unico" : "chip_multiple",
    max: item.max,
    opciones: item.options,
    orden,
    with_context: true,
    numero: item.number,
  });
  orden += 10;
}
orden = 10;
for (const item of q.TIMESHARE_QUESTIONS) {
  rows.push({
    clave: item.id,
    seccion: "timeshare",
    bloque: "main",
    texto: item.title,
    label_corto: null,
    tipo: item.max === 1 ? "chip_unico" : "chip_multiple",
    max: item.max,
    opciones: item.options,
    orden,
    with_context: true,
    numero: item.number,
  });
  orden += 10;
}
const h = q.HAS_TS_QUESTION;
rows.push({
  clave: h.id,
  seccion: "timeshare",
  bloque: "has_ts",
  texto: h.title,
  label_corto: null,
  tipo: "chip_unico",
  max: h.max,
  opciones: h.options,
  orden: 1000,
  with_context: false,
  numero: null,
});

const values = rows
  .map(
    (r) =>
      `  ('${esc(r.clave)}', '${r.seccion}', '${r.bloque}', '${esc(r.texto)}', ${
        r.label_corto ? `'${esc(r.label_corto)}'` : "null"
      }, '${r.tipo}', ${r.max}, '${j(r.opciones)}'::jsonb, ${r.orden}, ${r.with_context}, ${
        r.numero ?? "null"
      }, true)`,
  )
  .join(",\n");

const sql = `-- Survey preguntas (banco global) + overrides por usuario (Nivel A)
-- Seed desde discovery-questions.js (claves estables p1/t1/style*/hasTs)

create table if not exists public.survey_preguntas (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  seccion text not null check (seccion in ('motivaciones', 'timeshare')),
  bloque text not null,
  texto text not null,
  label_corto text,
  tipo_respuesta text not null check (tipo_respuesta in ('chip_unico', 'chip_multiple')),
  max_seleccion int not null default 1 check (max_seleccion >= 1),
  opciones jsonb not null default '[]'::jsonb,
  orden int not null default 0,
  with_context boolean not null default true,
  numero int,
  es_global boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.survey_preguntas_usuario (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  pregunta_id uuid not null references public.survey_preguntas(id) on delete cascade,
  activa boolean not null default true,
  orden int,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, pregunta_id)
);

create index if not exists survey_preguntas_seccion_orden_idx
  on public.survey_preguntas (seccion, orden);
create index if not exists survey_preguntas_usuario_usuario_idx
  on public.survey_preguntas_usuario (usuario_id);

drop trigger if exists trg_survey_preguntas_updated on public.survey_preguntas;
create trigger trg_survey_preguntas_updated
  before update on public.survey_preguntas
  for each row execute function public.set_updated_at();

drop trigger if exists trg_survey_preguntas_usuario_updated on public.survey_preguntas_usuario;
create trigger trg_survey_preguntas_usuario_updated
  before update on public.survey_preguntas_usuario
  for each row execute function public.set_updated_at();

alter table public.survey_preguntas enable row level security;
alter table public.survey_preguntas_usuario enable row level security;

drop policy if exists survey_preguntas_select_auth on public.survey_preguntas;
create policy survey_preguntas_select_auth on public.survey_preguntas
  for select to authenticated
  using (true);

drop policy if exists survey_preguntas_usuario_all_own on public.survey_preguntas_usuario;
create policy survey_preguntas_usuario_all_own on public.survey_preguntas_usuario
  for all to authenticated
  using (auth.uid() = usuario_id)
  with check (auth.uid() = usuario_id);

grant select on public.survey_preguntas to authenticated;
grant select, insert, update, delete on public.survey_preguntas_usuario to authenticated;

insert into public.permisos (clave, nombre_visible, modulo, capa) values
  ('herramientas:survey_configurar_preguntas', 'Configurar preguntas del Survey', 'herramientas', 'app')
on conflict (clave) do nothing;

insert into public.rol_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
cross join public.permisos p
where p.clave = 'herramientas:survey_configurar_preguntas'
  and r.slug in ('vendedor', 'admin', 'superadmin')
on conflict do nothing;

insert into public.survey_preguntas
  (clave, seccion, bloque, texto, label_corto, tipo_respuesta, max_seleccion, opciones, orden, with_context, numero, es_global)
values
${values}
on conflict (clave) do update set
  seccion = excluded.seccion,
  bloque = excluded.bloque,
  texto = excluded.texto,
  label_corto = excluded.label_corto,
  tipo_respuesta = excluded.tipo_respuesta,
  max_seleccion = excluded.max_seleccion,
  opciones = excluded.opciones,
  orden = excluded.orden,
  with_context = excluded.with_context,
  numero = excluded.numero,
  es_global = excluded.es_global,
  updated_at = now();
`;

fs.writeFileSync(new URL("../supabase/migrations/0043_survey_preguntas.sql", import.meta.url), sql);
console.log("ok rows=", rows.length);
