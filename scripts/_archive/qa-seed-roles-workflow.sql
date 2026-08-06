-- ============================================================
-- QA SEED — Roles, paquetes, jerarquía y workflow comercial
-- ------------------------------------------------------------
-- Ejecutar en el SQL Editor de Supabase (rol postgres) DESPUÉS
-- de aplicar las migraciones 0054–0056. Es idempotente: puede
-- ejecutarse varias veces sin duplicar datos.
--
-- Crea:
--   · Empresa "Empresa QA Workflow" con paquetes Operación base y Cierre
--   · Sala "Sala QA Norte" con cuentapremium4minecrafted@gmail.com como
--     GERENTE (y admin de la empresa, para probar el panel tenant)
--   · 5 usuarios de prueba con puestos distintos (password: QAtest123!)
--       qa.representante@salesapp.test → Representante (custom)
--       qa.vendedor@salesapp.test      → Vendedor      (sistema)
--       qa.cerrador@salesapp.test      → Cerrador      (sistema, paquete Cierre)
--       qa.supervisor@salesapp.test    → Supervisor    (custom, ve equipo)
--       qa.recepcion@salesapp.test     → Recepción     (custom, solo ver)
--   · 5 expedientes en etapas distintas del workflow:
--       QA-WF-P1 → representante   (recién iniciado)
--       QA-WF-P2 → worksheet       (survey completado)
--       QA-WF-P3 → revision_gerente (en el inbox del gerente)
--       QA-WF-P4 → money_box       (aprobado y cerrador asignado)
--       QA-WF-P5 → completado      (flujo íntegro con venta y snapshots)
-- ============================================================

begin;

do $$
declare
  v_gerente_email text := 'cuentapremium4minecrafted@gmail.com';
  v_password text := 'QAtest123!';

  v_gerente uuid;
  v_empresa uuid;
  v_sala uuid;
  v_paq_base uuid;
  v_paq_cierre uuid;

  v_roles jsonb := '{}'::jsonb;             -- slug -> role_id
  v_uids jsonb := '{}'::jsonb;              -- email -> user_id

  v_slug text;
  v_role_id uuid;
  v_uid uuid;
  v_prospect uuid;
  v_rep uuid;
  v_vend uuid;
  v_cerr uuid;
  v_wf public.prospect_workflows;
  i int;

  -- Definición de puestos: slug, nombre, paquete, es_sistema
  v_role_defs text[][] := array[
    ['gerente',       'Gerente',       'cierre',         't'],
    ['vendedor',      'Vendedor',      'operacion-base', 't'],
    ['cerrador',      'Cerrador',      'cierre',         't'],
    ['representante', 'Representante', 'operacion-base', 'f'],
    ['supervisor',    'Supervisor',    'operacion-base', 'f'],
    ['recepcion',     'Recepción',     'operacion-base', 'f']
  ];

  -- Definición de usuarios QA: email, nombre, slug del puesto
  v_user_defs text[][] := array[
    ['qa.representante@salesapp.test', 'QA Representante', 'representante'],
    ['qa.vendedor@salesapp.test',      'QA Vendedor',      'vendedor'],
    ['qa.cerrador@salesapp.test',      'QA Cerrador',      'cerrador'],
    ['qa.supervisor@salesapp.test',    'QA Supervisor',    'supervisor'],
    ['qa.recepcion@salesapp.test',     'QA Recepción',     'recepcion']
  ];
begin
  -- ─────────────────────────────────────────────────────────
  -- 1) Gerente: debe existir (registrado en la app)
  -- ─────────────────────────────────────────────────────────
  select u.id into v_gerente from auth.users u where lower(u.email) = lower(v_gerente_email);
  if v_gerente is null then
    raise exception 'No existe % en auth.users. Registra primero esa cuenta en la app.', v_gerente_email;
  end if;
  insert into public.profiles (id, email) values (v_gerente, v_gerente_email)
  on conflict (id) do nothing;

  -- ─────────────────────────────────────────────────────────
  -- 2) Empresa QA
  -- ─────────────────────────────────────────────────────────
  select id into v_empresa from public.empresas where nombre = 'Empresa QA Workflow';
  if v_empresa is null then
    insert into public.empresas (nombre, colores_marca, plan_paquete)
    values ('Empresa QA Workflow', '{"primary":"#1e5eff","accent":"#0f2044"}'::jsonb, 'qa')
    returning id into v_empresa;
  end if;

  -- ─────────────────────────────────────────────────────────
  -- 3) Paquetes de Acceso (base y cierre) + flags
  -- ─────────────────────────────────────────────────────────
  insert into public.paquetes_acceso (empresa_id, nombre, slug, descripcion, es_sistema, activo)
  values
    (v_empresa, 'Operación base', 'operacion-base', 'Survey, Proyección y Worksheet.', true, true),
    (v_empresa, 'Cierre', 'cierre', 'Operación base más Money Box.', true, true)
  on conflict (empresa_id, slug) do nothing;
  select id into v_paq_base   from public.paquetes_acceso where empresa_id = v_empresa and slug = 'operacion-base';
  select id into v_paq_cierre from public.paquetes_acceso where empresa_id = v_empresa and slug = 'cierre';

  -- Base: flags según default_global (money_box queda apagado).
  insert into public.paquete_flags (paquete_id, flag_id, activo)
  select v_paq_base, f.id, f.default_global from public.flags f
  on conflict (paquete_id, flag_id) do nothing;

  -- Cierre: igual que base pero con Money Box encendido.
  insert into public.paquete_flags (paquete_id, flag_id, activo)
  select v_paq_cierre, f.id, (f.default_global or f.clave = 'worksheet.money_box')
  from public.flags f
  on conflict (paquete_id, flag_id) do nothing;

  -- ─────────────────────────────────────────────────────────
  -- 4) Puestos (roles tenant) con permisos diferenciados
  -- ─────────────────────────────────────────────────────────
  for i in 1..array_length(v_role_defs, 1) loop
    v_slug := v_role_defs[i][1];
    select id into v_role_id from public.roles where empresa_id = v_empresa and slug = v_slug;
    if v_role_id is null then
      insert into public.roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
      values (
        v_empresa,
        v_role_defs[i][2],
        v_slug,
        'workspace',
        case when v_role_defs[i][3] = 'cierre' then v_paq_cierre else v_paq_base end,
        v_role_defs[i][4] = 't'
      )
      returning id into v_role_id;
    end if;
    v_roles := v_roles || jsonb_build_object(v_slug, v_role_id);
  end loop;

  -- Catálogo app base heredado del rol global Vendedor.
  insert into public.rol_permisos (rol_id, permiso_id)
  select (v_roles ->> r.slug)::uuid, rp.permiso_id
  from public.roles r
  join public.rol_permisos rp on rp.rol_id = 'a0000000-0000-4000-8000-000000000003'
  where r.empresa_id = v_empresa and v_roles ? r.slug
  on conflict do nothing;

  -- Capacidades diferenciadas por puesto.
  insert into public.rol_permisos (rol_id, permiso_id)
  select (v_roles ->> x.slug)::uuid, p.id
  from (values
    ('representante', 'workflow:ver'), ('representante', 'workflow:avanzar'),
    ('vendedor', 'workflow:ver'), ('vendedor', 'workflow:avanzar'),
    ('cerrador', 'workflow:ver'), ('cerrador', 'workflow:avanzar'), ('cerrador', 'workflow:cerrar'),
    ('supervisor', 'workflow:ver'), ('supervisor', 'expedientes:ver_equipo'), ('supervisor', 'dashboard:ver_equipo'),
    ('recepcion', 'workflow:ver'),
    ('gerente', 'workflow:ver'), ('gerente', 'workflow:revisar'), ('gerente', 'workflow:asignar_cerrador'),
    ('gerente', 'expedientes:ver_equipo'), ('gerente', 'ventas:ver_equipo'),
    ('gerente', 'dashboard:ver_equipo'), ('gerente', 'metas:ver_equipo')
  ) as x(slug, clave)
  join public.permisos p on p.clave = x.clave
  on conflict do nothing;

  -- ─────────────────────────────────────────────────────────
  -- 5) Sala QA + gerente (miembro gerente y admin de empresa)
  -- ─────────────────────────────────────────────────────────
  select id into v_sala from public.workspaces
  where empresa_id = v_empresa and nombre = 'Sala QA Norte' and tipo = 'sala_de_venta';
  if v_sala is null then
    insert into public.workspaces (tipo, empresa_id, nombre, estado)
    values ('sala_de_venta', v_empresa, 'Sala QA Norte', 'activo')
    returning id into v_sala;
  end if;

  insert into public.empresa_miembros (empresa_id, usuario_id, es_admin, estado)
  values (v_empresa, v_gerente, true, 'activo')
  on conflict (empresa_id, usuario_id) do update set es_admin = true, estado = 'activo';

  insert into public.workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
  values (v_gerente, v_sala, 'gerente', (v_roles ->> 'gerente')::uuid)
  on conflict (usuario_id, workspace_id)
  do update set rol_en_workspace = 'gerente', role_id = excluded.role_id;

  -- ─────────────────────────────────────────────────────────
  -- 6) 5 usuarios QA con puestos distintos
  -- ─────────────────────────────────────────────────────────
  for i in 1..array_length(v_user_defs, 1) loop
    select u.id into v_uid from auth.users u where lower(u.email) = lower(v_user_defs[i][1]);
    if v_uid is null then
      v_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change, email_change_token_new, email_change_token_current, is_sso_user
      ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_user_defs[i][1], extensions.crypt(v_password, extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_user_defs[i][2]),
        now(), now(), '', '', '', '', '', false
      );
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', v_user_defs[i][1], 'email_verified', true),
        'email', v_uid::text, now(), now(), now()
      );
    end if;

    update public.profiles
    set full_name = v_user_defs[i][2], email = v_user_defs[i][1]
    where id = v_uid;

    insert into public.workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
    values (v_uid, v_sala, 'vendedor', (v_roles ->> v_user_defs[i][3])::uuid)
    on conflict (usuario_id, workspace_id)
    do update set role_id = excluded.role_id;

    -- Que al iniciar sesión caigan directo en la sala QA.
    update public.profiles set workspace_activo_id = v_sala where id = v_uid;

    v_uids := v_uids || jsonb_build_object(v_user_defs[i][1], v_uid);
  end loop;

  v_rep  := (v_uids ->> 'qa.representante@salesapp.test')::uuid;
  v_vend := (v_uids ->> 'qa.vendedor@salesapp.test')::uuid;
  v_cerr := (v_uids ->> 'qa.cerrador@salesapp.test')::uuid;

  -- ─────────────────────────────────────────────────────────
  -- 7) Expedientes en distintas etapas del workflow
  --    (los ya existentes se omiten para mantener idempotencia)
  -- ─────────────────────────────────────────────────────────

  -- P1 · QA Representante · etapa: representante (recién iniciado)
  select id into v_prospect from public.prospects where user_id = v_rep and prospect_code = 'QA-WF-P1';
  if v_prospect is null then
    insert into public.prospects (user_id, workspace_id, prospect_code, name, name1, city, country)
    values (v_rep, v_sala, 'QA-WF-P1', 'Familia López', 'Carlos López', 'Cancún', 'México')
    returning id into v_prospect;
    insert into public.prospect_workflows (prospect_id, workspace_id, representante_id, gerente_id, created_by)
    values (v_prospect, v_sala, v_rep, v_gerente, v_rep);
  end if;

  -- P2 · QA Vendedor · etapa: worksheet (survey completado)
  select id into v_prospect from public.prospects where user_id = v_vend and prospect_code = 'QA-WF-P2';
  if v_prospect is null then
    insert into public.prospects (user_id, workspace_id, prospect_code, name, name1, city, country)
    values (v_vend, v_sala, 'QA-WF-P2', 'Familia Ramírez', 'Ana Ramírez', 'Playa del Carmen', 'México')
    returning id into v_prospect;
    insert into public.prospect_workflows (prospect_id, workspace_id, representante_id, gerente_id, created_by)
    values (v_prospect, v_sala, v_vend, v_gerente, v_vend);
    insert into public.tool_calculations (user_id, prospect_id, workspace_id, tool, data)
    values (v_vend, v_prospect, v_sala, 'survey', '{"qa": true}'::jsonb);
    v_wf := public.transition_prospect_workflow(v_prospect, v_vend, 'representante', 'survey', 'etapa_completada', 'vendedor');
    v_wf := public.transition_prospect_workflow(v_prospect, v_vend, 'survey', 'worksheet', 'etapa_completada', 'vendedor');
  end if;

  -- P3 · QA Representante · etapa: revision_gerente (inbox del gerente)
  select id into v_prospect from public.prospects where user_id = v_rep and prospect_code = 'QA-WF-P3';
  if v_prospect is null then
    insert into public.prospects (user_id, workspace_id, prospect_code, name, name1, city, country)
    values (v_rep, v_sala, 'QA-WF-P3', 'Familia Torres', 'Luis Torres', 'Tulum', 'México')
    returning id into v_prospect;
    insert into public.prospect_workflows (prospect_id, workspace_id, representante_id, gerente_id, created_by)
    values (v_prospect, v_sala, v_rep, v_gerente, v_rep);
    insert into public.tool_calculations (user_id, prospect_id, workspace_id, tool, data) values
      (v_rep, v_prospect, v_sala, 'survey', '{"qa": true}'::jsonb),
      (v_rep, v_prospect, v_sala, 'worksheet', '{"qa": true}'::jsonb),
      (v_rep, v_prospect, v_sala, 'vacaciones', '{"qa": true}'::jsonb);
    v_wf := public.transition_prospect_workflow(v_prospect, v_rep, 'representante', 'survey', 'etapa_completada', 'representante');
    v_wf := public.transition_prospect_workflow(v_prospect, v_rep, 'survey', 'worksheet', 'etapa_completada', 'representante');
    v_wf := public.transition_prospect_workflow(v_prospect, v_rep, 'worksheet', 'proyeccion', 'etapa_completada', 'representante');
    v_wf := public.transition_prospect_workflow(v_prospect, v_rep, 'proyeccion', 'revision_gerente', 'enviado_a_revision', 'representante',
      '{"comentario": "Listo para revisión gerencial (seed QA)."}'::jsonb);
  end if;

  -- P4 · QA Vendedor · etapa: money_box (aprobado, cerrador asignado)
  select id into v_prospect from public.prospects where user_id = v_vend and prospect_code = 'QA-WF-P4';
  if v_prospect is null then
    insert into public.prospects (user_id, workspace_id, prospect_code, name, name1, city, country)
    values (v_vend, v_sala, 'QA-WF-P4', 'Familia García', 'Marta García', 'Cancún', 'México')
    returning id into v_prospect;
    insert into public.prospect_workflows (prospect_id, workspace_id, representante_id, gerente_id, created_by)
    values (v_prospect, v_sala, v_vend, v_gerente, v_vend);
    insert into public.tool_calculations (user_id, prospect_id, workspace_id, tool, data) values
      (v_vend, v_prospect, v_sala, 'survey', '{"qa": true}'::jsonb),
      (v_vend, v_prospect, v_sala, 'worksheet', '{"qa": true}'::jsonb),
      (v_vend, v_prospect, v_sala, 'vacaciones', '{"qa": true}'::jsonb);
    v_wf := public.transition_prospect_workflow(v_prospect, v_vend, 'representante', 'survey', 'etapa_completada', 'vendedor');
    v_wf := public.transition_prospect_workflow(v_prospect, v_vend, 'survey', 'worksheet', 'etapa_completada', 'vendedor');
    v_wf := public.transition_prospect_workflow(v_prospect, v_vend, 'worksheet', 'proyeccion', 'etapa_completada', 'vendedor');
    v_wf := public.transition_prospect_workflow(v_prospect, v_vend, 'proyeccion', 'revision_gerente', 'enviado_a_revision', 'vendedor');
    v_wf := public.transition_prospect_workflow(v_prospect, v_gerente, 'revision_gerente', 'asignacion_cerrador', 'revision_aprobada', 'gerente',
      '{"comentario": "Aprobado (seed QA)."}'::jsonb);
    v_wf := public.assign_prospect_closer(v_prospect, v_gerente, v_cerr, 'gerente');
  end if;

  -- P5 · QA Representante · etapa: completado (flujo íntegro con venta)
  select id into v_prospect from public.prospects where user_id = v_rep and prospect_code = 'QA-WF-P5';
  if v_prospect is null then
    insert into public.prospects (user_id, workspace_id, prospect_code, name, name1, city, country, completed)
    values (v_rep, v_sala, 'QA-WF-P5', 'Familia Mendoza', 'Sofía Mendoza', 'Cozumel', 'México', true)
    returning id into v_prospect;
    insert into public.prospect_workflows (prospect_id, workspace_id, representante_id, gerente_id, created_by)
    values (v_prospect, v_sala, v_rep, v_gerente, v_rep);
    insert into public.tool_calculations (user_id, prospect_id, workspace_id, tool, data) values
      (v_rep, v_prospect, v_sala, 'survey', '{"qa": true}'::jsonb),
      (v_rep, v_prospect, v_sala, 'worksheet', '{"qa": true}'::jsonb),
      (v_rep, v_prospect, v_sala, 'vacaciones', '{"qa": true}'::jsonb);
    v_wf := public.transition_prospect_workflow(v_prospect, v_rep, 'representante', 'survey', 'etapa_completada', 'representante');
    v_wf := public.transition_prospect_workflow(v_prospect, v_rep, 'survey', 'worksheet', 'etapa_completada', 'representante');
    v_wf := public.transition_prospect_workflow(v_prospect, v_rep, 'worksheet', 'proyeccion', 'etapa_completada', 'representante');
    v_wf := public.transition_prospect_workflow(v_prospect, v_rep, 'proyeccion', 'revision_gerente', 'enviado_a_revision', 'representante');
    v_wf := public.transition_prospect_workflow(v_prospect, v_gerente, 'revision_gerente', 'asignacion_cerrador', 'revision_aprobada', 'gerente');
    v_wf := public.assign_prospect_closer(v_prospect, v_gerente, v_cerr, 'gerente');
    v_wf := public.transition_prospect_workflow(v_prospect, v_cerr, 'money_box', 'tipo_cambio', 'etapa_completada', 'cerrador');
    v_wf := public.transition_prospect_workflow(v_prospect, v_cerr, 'tipo_cambio', 'venta', 'etapa_completada', 'cerrador',
      '{"exchange_rate": {"from": "USD", "to": "MXN", "rate": 18.25}}'::jsonb);
    insert into public.sales (user_id, prospect_id, workspace_id, sale_date, vol, tours, contract, note)
    values (v_rep, v_prospect, v_sala, current_date, 25000, 1, 'QA-CONTRATO-5', 'Venta seed QA');
    v_wf := public.transition_prospect_workflow(v_prospect, v_cerr, 'venta', 'completado', 'etapa_completada', 'cerrador',
      jsonb_build_object('sale', jsonb_build_object('vol', 25000, 'contract', 'QA-CONTRATO-5', 'sale_date', current_date)));
  end if;

  raise notice 'Seed QA listo. empresa=% sala=% gerente=%', v_empresa, v_sala, v_gerente;
end $$;

commit;

-- ============================================================
-- VERIFICACIÓN (resultado único con secciones)
-- ============================================================
with sala as (
  select w.id from public.workspaces w
  join public.empresas e on e.id = w.empresa_id
  where e.nombre = 'Empresa QA Workflow' and w.nombre = 'Sala QA Norte'
)
select
  '1. miembro' as seccion,
  coalesce(pr.full_name, pr.email) as detalle,
  concat(
    'puesto=', coalesce(r.nombre, wm.rol_en_workspace::text),
    ' · paquete=', coalesce(pa.slug, 'sin paquete'),
    ' · permisos=', coalesce(array_length(public.effective_workspace_permissions(wm.usuario_id, wm.workspace_id), 1), 0),
    ' · money_box=', public.resolver_workspace_flag('worksheet.money_box', wm.usuario_id, wm.workspace_id)
  ) as valor
from public.workspace_miembros wm
join sala on sala.id = wm.workspace_id
join public.profiles pr on pr.id = wm.usuario_id
left join public.roles r on r.id = wm.role_id
left join public.paquetes_acceso pa on pa.id = r.paquete_id

union all

select
  '2. workflow',
  p.prospect_code,
  concat(
    'etapa=', pw.etapa_actual,
    ' · estado=', pw.estado,
    ' · rep=', coalesce(rep.full_name, '—'),
    ' · cerrador=', coalesce(cer.full_name, '—'),
    ' · eventos=', (select count(*) from public.prospect_workflow_events e where e.prospect_id = pw.prospect_id)
  )
from public.prospect_workflows pw
join sala on sala.id = pw.workspace_id
join public.prospects p on p.id = pw.prospect_id
left join public.profiles rep on rep.id = pw.representante_id
left join public.profiles cer on cer.id = pw.cerrador_id

union all

select
  '3. permiso clave',
  concat(x.quien, ' → ', x.clave),
  public.workspace_has_permission(x.uid, sala.id, x.clave)::text
from sala
cross join lateral (
  select pr.full_name as quien, pr.id as uid, v.clave
  from public.profiles pr
  join public.workspace_miembros wm on wm.usuario_id = pr.id and wm.workspace_id = sala.id
  cross join (values ('workflow:revisar'), ('workflow:cerrar'), ('expedientes:ver_equipo')) as v(clave)
  where pr.email in (
    'cuentapremium4minecrafted@gmail.com',
    'qa.cerrador@salesapp.test',
    'qa.recepcion@salesapp.test',
    'qa.supervisor@salesapp.test'
  )
) x
order by 1, 2;

-- ============================================================
-- LIMPIEZA (opcional — descomenta para borrar los datos QA)
-- El orden importa: el historial del workflow es inmutable (hay
-- que desactivar su trigger para el borrado en cascada) y los
-- puestos tienen "on delete restrict" desde workspace_miembros.
-- ============================================================
-- begin;
-- alter table public.prospect_workflow_events disable trigger workflow_events_append_only;
-- delete from public.prospects where prospect_code like 'QA-WF-P%';
-- alter table public.prospect_workflow_events enable trigger workflow_events_append_only;
-- delete from public.workspace_miembros wm
--   using public.workspaces w
--   where w.id = wm.workspace_id
--     and w.empresa_id = (select id from public.empresas where nombre = 'Empresa QA Workflow');
-- delete from public.workspaces
--   where empresa_id = (select id from public.empresas where nombre = 'Empresa QA Workflow');
-- delete from public.empresas where nombre = 'Empresa QA Workflow';
-- delete from auth.users where email in (
--   'qa.representante@salesapp.test', 'qa.vendedor@salesapp.test',
--   'qa.cerrador@salesapp.test', 'qa.supervisor@salesapp.test',
--   'qa.recepcion@salesapp.test'
-- );
-- -- Workspaces personales de los usuarios QA que quedaron sin miembros:
-- delete from public.workspaces w
--   where w.tipo = 'personal'
--     and not exists (select 1 from public.workspace_miembros wm where wm.workspace_id = w.id);
-- commit;
