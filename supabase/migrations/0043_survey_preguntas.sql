-- Survey preguntas (banco global) + overrides por usuario (Nivel A)
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
  ('p1', 'motivaciones', 'before_style', '¿Qué buscan principalmente cuando salen de vacaciones?', null, 'chip_multiple', 2, '["Descansar y desconectarse","Pasar tiempo en familia","Reconectar como pareja","Crear recuerdos","Cuidar su salud o bienestar","Conocer nuevos destinos","Vivir aventuras","Celebrar momentos importantes","Disfrutar comodidad y buen servicio","Escapar de la rutina"]'::jsonb, 10, true, 1, true),
  ('p2', 'motivaciones', 'before_style', '¿Qué emoción esperan sentir durante unas buenas vacaciones?', null, 'chip_multiple', 2, '["Tranquilidad","Libertad","Alegría","Conexión familiar","Conexión de pareja","Diversión","Aventura","Renovación","Sentirse consentidos","Seguridad"]'::jsonb, 20, true, 2, true),
  ('p3', 'motivaciones', 'before_style', '¿Qué no puede faltar para considerar que una vacación realmente valió la pena?', null, 'chip_multiple', 3, '["Calidad del alojamiento","Buena ubicación","Espacio y privacidad","Buen servicio","Actividades para todos","Flexibilidad de fechas","Facilidad para reservar","Variedad de destinos","Seguridad","Comodidad para la familia","Costos claros","Buena relación precio–experiencia"]'::jsonb, 30, true, 3, true),
  ('p4', 'motivaciones', 'before_style', 'Si pudieran mejorar una sola cosa de sus futuras vacaciones, ¿cuál sería?', null, 'chip_unico', 1, '["Viajar más veces","Quedarse más noches","Mejorar la calidad","Tener más espacio","Conocer más destinos","Viajar con más integrantes de la familia","Organizar con menos esfuerzo","Conseguir mejores fechas","Tener mayor control del costo","Tener mayor flexibilidad"]'::jsonb, 40, true, 4, true),
  ('style1', 'motivaciones', 'style', 'Destinos', 'Destinos', 'chip_unico', 1, '["Conocidos","Nuevos","Combinan ambos"]'::jsonb, 100, false, null, true),
  ('style2', 'motivaciones', 'style', 'Planeación', 'Planeación', 'chip_unico', 1, '["Con anticipación","Meses antes","Cerca de la fecha"]'::jsonb, 110, false, null, true),
  ('style3', 'motivaciones', 'style', 'Ritmo', 'Ritmo', 'chip_unico', 1, '["Descanso","Actividades","Equilibrio"]'::jsonb, 120, false, null, true),
  ('style4', 'motivaciones', 'style', 'Prioridad', 'Prioridad', 'chip_unico', 1, '["Practicidad","Calidad y servicio","Costo–experiencia"]'::jsonb, 130, false, null, true),
  ('p21', 'motivaciones', 'after_style', '¿Qué suele dificultarles viajar como realmente quisieran?', null, 'chip_multiple', 2, '["Falta de tiempo","Trabajo","Presupuesto","Calendario escolar o familiar","Vuelos costosos","Falta de disponibilidad","Organización complicada","No encontrar alojamiento adecuado","Falta de espacio","Costos inesperados","Diferencias para ponerse de acuerdo","Situaciones personales, familiares o de salud","Desconfianza al reservar","Nada importante","Prefieren no responder"]'::jsonb, 200, true, 5, true),
  ('p22', 'motivaciones', 'after_style', '¿Cuál de estas situaciones les ha sucedido con mayor frecuencia?', null, 'chip_unico', 1, '["Viajan menos de lo que quieren","Se quedan menos noches","Gastan más de lo planeado","Sacrifican calidad","No consiguen las fechas deseadas","No encuentran suficiente espacio","Organizar toma demasiado tiempo","Posponen las vacaciones","No todos disfrutan igualmente","Viajan como lo planean"]'::jsonb, 210, true, 6, true),
  ('p23', 'motivaciones', 'after_style', '¿Qué les preocuparía más al asumir un compromiso vacacional?', null, 'chip_multiple', 2, '["Pagar por algo que no utilicen","No encontrar disponibilidad","Que los costos aumenten","Cuotas o cargos adicionales","Falta de flexibilidad","Compromiso demasiado largo","No entender cómo funciona","Tomar una decisión apresurada","Que cambie su forma de viajar","No confiar suficientemente","Ninguna preocupación específica","Prefieren no responder"]'::jsonb, 220, true, 7, true),
  ('p24', 'motivaciones', 'after_style', 'Cuando organizan una vacación, ¿cómo toman normalmente la decisión?', null, 'chip_unico', 1, '["Decide la persona presente","Deciden juntos quienes viajan","Una persona propone y otra revisa números","Una persona organiza y otra confirma","Participa alguien que no está presente","Depende del viaje"]'::jsonb, 230, true, 8, true),
  ('p25', 'motivaciones', 'after_style', 'Cuando toman una decisión importante, ¿qué necesitan normalmente?', null, 'chip_multiple', 3, '["Entender claramente cómo funciona","Revisar los números","Comparar opciones","Ver ejemplos reales","Leer las condiciones","Confirmar disponibilidad","Consultar con otra persona","Tener tiempo para pensarlo","Sentir confianza en quien explica","Estar todos de acuerdo"]'::jsonb, 240, true, 9, true),
  ('t1', 'timeshare', 'main', 'Antes de esta experiencia, ¿qué opinión tenían sobre clubes vacacionales o tiempos compartidos?', null, 'chip_unico', 1, '["Muy positiva","Positiva","Neutral","Tenían algunas dudas","Negativa","Muy negativa","No tenían una opinión"]'::jsonb, 10, true, 1, true),
  ('t2', 'timeshare', 'main', '¿Qué ha influido más en esa opinión?', null, 'chip_multiple', 2, '["Experiencia propia","Familiares o amigos","Presentación anterior","Membresía actual o anterior","Información de internet","Costos o cuotas","Disponibilidad","Experiencias positivas","Poco conocimiento del concepto","Otro"]'::jsonb, 20, true, 2, true),
  ('t3', 'timeshare', 'main', '¿Han asistido anteriormente a una presentación?', null, 'chip_unico', 1, '["Nunca","Una vez","Varias veces","No recuerdan"]'::jsonb, 30, true, 3, true),
  ('t4', 'timeshare', 'main', '¿Cuál fue el resultado de la presentación más reciente?', null, 'chip_unico', 1, '["Solo conocieron el programa","Lo consideraron, pero no compraron","Compraron","Compraron y cancelaron","No recuerdan claramente","No aplica"]'::jsonb, 40, true, 4, true),
  ('t5', 'timeshare', 'main', 'Si no compraron, ¿qué influyó principalmente?', null, 'chip_multiple', 2, '["No era el momento","Precio","Enganche","Mensualidad","Cuotas","No entendieron cómo funcionaba","No vieron suficiente valor","Falta de flexibilidad","Dudas sobre disponibilidad","Falta de confianza","Querían investigar o comparar","Se sintieron presionados","Ya tenían otro producto","Faltaba alguien para decidir","Otro","No aplica"]'::jsonb, 50, true, 5, true),
  ('t6', 'timeshare', 'main', '¿Actualmente tienen o han tenido una membresía, club o propiedad vacacional?', null, 'chip_unico', 1, '["Nunca han tenido","Actualmente tienen una","Tienen más de una","Tuvieron una anteriormente","Compraron y cancelaron","Herencia o transferencia","No están seguros"]'::jsonb, 60, true, 6, true),
  ('t7', 'timeshare', 'main', '¿Qué los motivó principalmente a comprar?', null, 'chip_multiple', 3, '["Viajar más veces","Asegurar vacaciones futuras","Mejorar calidad y servicio","Tener más espacio","Crear recuerdos en familia","Acceder a más destinos","Protegerse del aumento de precios","Usar intercambios","La presentación les convenció","Beneficios especiales","Otro","No aplica"]'::jsonb, 70, true, 7, true),
  ('t8', 'timeshare', 'main', '¿Ese producto cubre actualmente su forma de vacacionar?', null, 'chip_unico', 1, '["Sí, completamente","Cubre la mayor parte","Solo parcialmente","No la cubre","No están seguros","No aplica"]'::jsonb, 80, true, 8, true),
  ('t9', 'timeshare', 'main', '¿Cómo describirían su experiencia general?', null, 'chip_multiple', 3, '["La utilizan y están satisfechos","Satisfechos, pero la usan poco","Difícil disponibilidad","No saben aprovecharla","Los costos aumentaron","Pierden puntos o semanas","Ya no se adapta a la familia","Ya no se adapta a su forma de viajar","Quieren hacer un cambio","Prefieren no responder","No aplica"]'::jsonb, 90, true, 9, true),
  ('t10', 'timeshare', 'main', '¿Cuál es el principal problema con su propiedad o membresía?', null, 'chip_multiple', 2, '["No la utilizan","Falta de disponibilidad","Deben reservar demasiado pronto","Pocos destinos","Puntos insuficientes","Temporada inadecuada","Espacio insuficiente","Cuotas elevadas","Mensualidad elevada","Intercambio complicado","Costos de intercambio","Mala atención","Cambió la familia","Cambió su forma de viajar","Ningún problema importante","Otro","No aplica"]'::jsonb, 100, true, 10, true),
  ('t11', 'timeshare', 'main', '¿Qué les gustaría hacer con su producto actual o anterior?', null, 'chip_unico', 1, '["Conservarlo sin cambios","Aprender a utilizarlo mejor","Tener mayor capacidad","Complementarlo","Actualizarlo","Consolidarlo con otro producto","Venderlo o dejarlo","Todavía no lo saben","No aplica"]'::jsonb, 110, true, 11, true),
  ('hasTs', 'timeshare', 'has_ts', '¿El cliente tiene actualmente uno o más timeshares o clubes vacacionales?', null, 'chip_unico', 1, '["Sí","No","Tuvo anteriormente","No está seguro"]'::jsonb, 1000, false, null, true)
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
