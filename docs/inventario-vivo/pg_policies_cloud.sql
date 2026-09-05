-- Snapshot read-only Cloud 17.6
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies WHERE schemaname IN ('public','storage','realtime') ORDER BY 1,2,3;

-- public.activities / activities_delete_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=DELETE
-- USING: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'::text))
-- WITH CHECK: None

-- public.activities / activities_insert_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'::text))

-- public.activities / activities_select_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((user_id = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo'::text) OR (EXISTS ( SELECT 1
   FROM (prospect_shares ps
     JOIN prospects p ON ((p.id = ps.prospect_id)))
  WHERE ((ps.prospect_id = activities.prospect_id) AND (ps.shared_with_id = auth.uid()) AND (p.workspace_id = activities.workspace_id))))))
-- WITH CHECK: None

-- public.activities / activities_update_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=UPDATE
-- USING: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'::text))
-- WITH CHECK: ((user_id = auth.uid()) AND user_in_workspace(auth.uid(), workspace_id))

-- public.calendar_entries / calendar_delete_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=DELETE
-- USING: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'::text))
-- WITH CHECK: None

-- public.calendar_entries / calendar_insert_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((user_id = auth.uid()) AND user_in_workspace(auth.uid(), workspace_id) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'::text))

-- public.calendar_entries / calendar_select_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((user_id = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo'::text)))
-- WITH CHECK: None

-- public.calendar_entries / calendar_update_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=UPDATE
-- USING: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'::text))
-- WITH CHECK: ((user_id = auth.uid()) AND user_in_workspace(auth.uid(), workspace_id))

-- public.catalogo_configuracion / catalogo_config_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: rh_can_access_empresa(empresa_id)
-- WITH CHECK: None

-- public.catalogo_configuracion / catalogo_config_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (is_super_admin() OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR rh_can_access_empresa(empresa_id))

-- public.chat_conversations / chat_conversations_select_member
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM chat_members m
  WHERE ((m.conversation_id = chat_conversations.id) AND (m.usuario_id = auth.uid()) AND (m.left_at IS NULL))))
-- WITH CHECK: None

-- public.chat_members / chat_members_select_peer
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM chat_members me
  WHERE ((me.conversation_id = chat_members.conversation_id) AND (me.usuario_id = auth.uid()) AND (me.left_at IS NULL))))
-- WITH CHECK: None

-- public.chat_messages / chat_messages_insert_member
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM chat_members m
  WHERE ((m.conversation_id = chat_messages.conversation_id) AND (m.usuario_id = auth.uid()) AND (m.left_at IS NULL)))))

-- public.chat_messages / chat_messages_select_member
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM chat_members m
  WHERE ((m.conversation_id = chat_messages.conversation_id) AND (m.usuario_id = auth.uid()) AND (m.left_at IS NULL))))
-- WITH CHECK: None

-- public.direct_messages / messages_insert_sender
-- permissive=PERMISSIVE roles={public} cmd=INSERT
-- USING: None
-- WITH CHECK: ((auth.uid() = sender_id) AND users_are_connected(sender_id, recipient_id))

-- public.direct_messages / messages_select_participant
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: ((auth.uid() = sender_id) OR (auth.uid() = recipient_id))
-- WITH CHECK: None

-- public.direct_messages / messages_update_recipient_read
-- permissive=PERMISSIVE roles={public} cmd=UPDATE
-- USING: (auth.uid() = recipient_id)
-- WITH CHECK: None

-- public.empresa_miembros / empresa_miembros_select_empresa
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: user_in_empresa(auth.uid(), empresa_id)
-- WITH CHECK: None

-- public.empresas / empresas_select_member
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((EXISTS ( SELECT 1
   FROM (workspaces w
     JOIN workspace_miembros m ON ((m.workspace_id = w.id)))
  WHERE ((w.empresa_id = empresas.id) AND (m.usuario_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_super_admin = true)))))
-- WITH CHECK: None

-- public.flag_reglas / flag_reglas_select_scoped
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (is_super_admin() OR (alcance = 'membresia'::text) OR ((alcance = 'usuario'::text) AND (alcance_id = auth.uid())) OR ((alcance = 'rol'::text) AND (EXISTS ( SELECT 1
   FROM roles r
  WHERE ((r.id = flag_reglas.alcance_id) AND ((r.empresa_id IS NULL) OR user_can_read_tenant_role(r.empresa_id)))))))
-- WITH CHECK: None

-- public.flags / flags_select_authenticated
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (is_super_admin() OR (empresa_id IS NULL) OR (EXISTS ( SELECT 1
   FROM empresa_miembros em
  WHERE ((em.empresa_id = flags.empresa_id) AND (em.usuario_id = auth.uid()) AND (em.estado = 'activo'::text)))) OR (EXISTS ( SELECT 1
   FROM (workspace_miembros wm
     JOIN workspaces w ON ((w.id = wm.workspace_id)))
  WHERE ((w.empresa_id = flags.empresa_id) AND (wm.usuario_id = auth.uid())))))
-- WITH CHECK: None

-- public.funciones_premium / Authenticated read funciones_premium
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: true
-- WITH CHECK: None

-- public.gerente_acceso_cruzado / gerente_acceso_cruzado_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((auth.uid() = gerente_id) OR (auth.uid() = otorgado_por) OR is_super_admin() OR user_is_empresa_admin(auth.uid(), ( SELECT w.empresa_id
   FROM workspaces w
  WHERE (w.id = gerente_acceso_cruzado.sala_adicional_id))))
-- WITH CHECK: None

-- public.gerente_acceso_cruzado / gerente_acceso_cruzado_write_admin
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR user_is_empresa_admin(auth.uid(), ( SELECT w.empresa_id
   FROM workspaces w
  WHERE (w.id = gerente_acceso_cruzado.sala_adicional_id))))
-- WITH CHECK: (is_super_admin() OR user_is_empresa_admin(auth.uid(), ( SELECT w.empresa_id
   FROM workspaces w
  WHERE (w.id = gerente_acceso_cruzado.sala_adicional_id))))

-- public.goals / goals_admin_read
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (is_super_admin() OR (is_admin() AND has_admin_permission('goals:read'::text)))
-- WITH CHECK: None

-- public.goals / goals_select_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((user_id = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'metas:ver_equipo'::text)))
-- WITH CHECK: None

-- public.goals / goals_write_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'metas:ver_editar_propias'::text))
-- WITH CHECK: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'metas:ver_editar_propias'::text))

-- public.logs_administracion / logs_admin_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM unnest(resolve_user_permission_keys(auth.uid())) k(k)
  WHERE (k.k = 'ver_logs_administracion'::text))))
-- WITH CHECK: None

-- public.membresias / Admins read all membresias
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'admin'::user_role)))))
-- WITH CHECK: None

-- public.membresias / Users read own membresias
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (usuario_id = auth.uid())
-- WITH CHECK: None

-- public.modulo_custom_datos / modulo_custom_datos_select_authenticated
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM empresa_miembros em
  WHERE ((em.empresa_id = modulo_custom_datos.empresa_id) AND (em.usuario_id = auth.uid()) AND (em.estado = 'activo'::text)))) OR (EXISTS ( SELECT 1
   FROM (workspace_miembros wm
     JOIN workspaces w ON ((w.id = wm.workspace_id)))
  WHERE ((w.empresa_id = modulo_custom_datos.empresa_id) AND (wm.usuario_id = auth.uid())))))
-- WITH CHECK: None

-- public.modulo_custom_datos / modulo_custom_datos_write_empresa_admin
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM empresa_miembros em
  WHERE ((em.empresa_id = modulo_custom_datos.empresa_id) AND (em.usuario_id = auth.uid()) AND (em.es_admin = true) AND (em.estado = 'activo'::text)))) OR (EXISTS ( SELECT 1
   FROM (workspace_miembros wm
     JOIN workspaces w ON ((w.id = wm.workspace_id)))
  WHERE ((w.empresa_id = modulo_custom_datos.empresa_id) AND (wm.usuario_id = auth.uid())))))
-- WITH CHECK: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM empresa_miembros em
  WHERE ((em.empresa_id = modulo_custom_datos.empresa_id) AND (em.usuario_id = auth.uid()) AND (em.es_admin = true) AND (em.estado = 'activo'::text)))) OR (EXISTS ( SELECT 1
   FROM (workspace_miembros wm
     JOIN workspaces w ON ((w.id = wm.workspace_id)))
  WHERE ((w.empresa_id = modulo_custom_datos.empresa_id) AND (wm.usuario_id = auth.uid())))))

-- public.paquete_flags / paquete_flags_select_empresa
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM paquetes_acceso pa
  WHERE ((pa.id = paquete_flags.paquete_id) AND user_in_empresa(auth.uid(), pa.empresa_id))))
-- WITH CHECK: None

-- public.paquetes_acceso / paquetes_select_empresa
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: user_in_empresa(auth.uid(), empresa_id)
-- WITH CHECK: None

-- public.permisos / permisos_select_authenticated
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: true
-- WITH CHECK: None

-- public.permisos_delegados / permisos_delegados_select_parties
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((auth.uid() = usuario_delegante_id) OR (auth.uid() = usuario_asistente_id) OR is_super_admin())
-- WITH CHECK: None

-- public.permisos_delegados / permisos_delegados_write_delegante
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: ((auth.uid() = usuario_delegante_id) OR is_super_admin())
-- WITH CHECK: ((auth.uid() = usuario_delegante_id) OR is_super_admin())

-- public.planes / Authenticated read planes
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: true
-- WITH CHECK: None

-- public.platform_sessions / platform_sessions_own
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (auth.uid() = user_id)
-- WITH CHECK: (auth.uid() = user_id)

-- public.profiles / profiles_admin_read
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (is_super_admin() OR (is_admin() AND (has_admin_permission('users:read'::text) OR has_admin_permission('dashboard:read'::text) OR has_admin_permission('goals:read'::text) OR has_admin_permission('tools:analytics'::text))))
-- WITH CHECK: None

-- public.profiles / profiles_admin_update
-- permissive=PERMISSIVE roles={public} cmd=UPDATE
-- USING: is_super_admin()
-- WITH CHECK: is_super_admin()

-- public.profiles / profiles_insert_own
-- permissive=PERMISSIVE roles={public} cmd=INSERT
-- USING: None
-- WITH CHECK: (auth.uid() = id)

-- public.profiles / profiles_select_network
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: ((auth.uid() = id) OR users_are_connected(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM user_connections c
  WHERE ((c.status = ANY (ARRAY['pending'::connection_status, 'accepted'::connection_status])) AND (((c.requester_id = auth.uid()) AND (c.addressee_id = profiles.id)) OR ((c.addressee_id = auth.uid()) AND (c.requester_id = profiles.id)))))))
-- WITH CHECK: None

-- public.profiles / profiles_select_own
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (auth.uid() = id)
-- WITH CHECK: None

-- public.profiles / profiles_update_own
-- permissive=PERMISSIVE roles={public} cmd=UPDATE
-- USING: (auth.uid() = id)
-- WITH CHECK: (auth.uid() = id)

-- public.prospect_archivos / prospect_archivos_delete
-- permissive=PERMISSIVE roles={authenticated} cmd=DELETE
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((uploaded_by = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo'::text)))
-- WITH CHECK: None

-- public.prospect_archivos / prospect_archivos_insert
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((uploaded_by = auth.uid()) AND user_in_workspace(auth.uid(), workspace_id) AND (EXISTS ( SELECT 1
   FROM prospects p
  WHERE ((p.id = prospect_archivos.prospect_id) AND (p.workspace_id = prospect_archivos.workspace_id) AND ((p.user_id = auth.uid()) OR workspace_has_permission(auth.uid(), p.workspace_id, 'expedientes:ver_equipo'::text) OR (EXISTS ( SELECT 1
           FROM prospect_workflows pw
          WHERE ((pw.prospect_id = p.id) AND (pw.cerrador_id = auth.uid())))))))))

-- public.prospect_archivos / prospect_archivos_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND (EXISTS ( SELECT 1
   FROM prospects p
  WHERE ((p.id = prospect_archivos.prospect_id) AND ((p.user_id = auth.uid()) OR workspace_has_permission(auth.uid(), p.workspace_id, 'expedientes:ver_equipo'::text) OR (EXISTS ( SELECT 1
           FROM prospect_workflows pw
          WHERE ((pw.prospect_id = p.id) AND (pw.cerrador_id = auth.uid())))) OR (EXISTS ( SELECT 1
           FROM prospect_shares ps
          WHERE ((ps.prospect_id = p.id) AND (ps.shared_with_id = auth.uid())))))))))
-- WITH CHECK: None

-- public.prospect_share_invites / share_invites_insert_owner
-- permissive=PERMISSIVE roles={public} cmd=INSERT
-- USING: None
-- WITH CHECK: ((auth.uid() = owner_id) AND (EXISTS ( SELECT 1
   FROM prospects pr
  WHERE ((pr.id = prospect_share_invites.prospect_id) AND (pr.user_id = auth.uid())))))

-- public.prospect_share_invites / share_invites_select_owner
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (auth.uid() = owner_id)
-- WITH CHECK: None

-- public.prospect_share_invites / share_invites_update_owner
-- permissive=PERMISSIVE roles={public} cmd=UPDATE
-- USING: (auth.uid() = owner_id)
-- WITH CHECK: None

-- public.prospect_shares / shares_delete_owner
-- permissive=PERMISSIVE roles={public} cmd=DELETE
-- USING: (auth.uid() = owner_id)
-- WITH CHECK: None

-- public.prospect_shares / shares_insert_owner
-- permissive=PERMISSIVE roles={public} cmd=INSERT
-- USING: None
-- WITH CHECK: ((auth.uid() = owner_id) AND (EXISTS ( SELECT 1
   FROM prospects pr
  WHERE ((pr.id = prospect_shares.prospect_id) AND (pr.user_id = auth.uid())))) AND users_are_connected(auth.uid(), shared_with_id))

-- public.prospect_shares / shares_select_participant
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: ((auth.uid() = owner_id) OR (auth.uid() = shared_with_id))
-- WITH CHECK: None

-- public.prospect_shares / shares_update_owner
-- permissive=PERMISSIVE roles={public} cmd=UPDATE
-- USING: (auth.uid() = owner_id)
-- WITH CHECK: None

-- public.prospect_shares / shares_update_recipient_pin
-- permissive=PERMISSIVE roles={public} cmd=UPDATE
-- USING: ((auth.uid() = shared_with_id) AND share_can_edit(permission))
-- WITH CHECK: ((auth.uid() = shared_with_id) AND share_can_edit(permission))

-- public.prospect_workflow_events / workflow_events_select_scoped
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM prospect_workflows pw
  WHERE ((pw.prospect_id = prospect_workflow_events.prospect_id) AND user_in_workspace(auth.uid(), pw.workspace_id) AND ((pw.representante_id = auth.uid()) OR (pw.cerrador_id = auth.uid()) OR workspace_has_permission(auth.uid(), pw.workspace_id, 'workflow:ver'::text) OR workspace_has_permission(auth.uid(), pw.workspace_id, 'expedientes:ver_equipo'::text)))))
-- WITH CHECK: None

-- public.prospect_workflows / workflow_select_scoped
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((representante_id = auth.uid()) OR (cerrador_id = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'workflow:ver'::text) OR workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo'::text)))
-- WITH CHECK: None

-- public.prospects / prospects_delete_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=DELETE
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND (((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:eliminar'::text)) OR user_is_empresa_admin(auth.uid(), ( SELECT w.empresa_id
   FROM workspaces w
  WHERE (w.id = prospects.workspace_id)))))
-- WITH CHECK: None

-- public.prospects / prospects_insert_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:crear'::text))

-- public.prospects / prospects_select_shared
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM prospect_shares ps
  WHERE ((ps.prospect_id = prospects.id) AND (ps.shared_with_id = auth.uid()))))
-- WITH CHECK: None

-- public.prospects / prospects_select_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((user_id = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo'::text) OR (EXISTS ( SELECT 1
   FROM prospect_workflows pw
  WHERE ((pw.prospect_id = prospects.id) AND (pw.cerrador_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM prospect_shares ps
  WHERE ((ps.prospect_id = prospects.id) AND (ps.shared_with_id = auth.uid()))))))
-- WITH CHECK: None

-- public.prospects / prospects_update_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=UPDATE
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND (((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'expedientes:editar'::text)) OR workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo'::text) OR (EXISTS ( SELECT 1
   FROM prospect_workflows pw
  WHERE ((pw.prospect_id = prospects.id) AND ((pw.representante_id = auth.uid()) OR (pw.cerrador_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM prospect_shares ps
  WHERE ((ps.prospect_id = prospects.id) AND (ps.shared_with_id = auth.uid()) AND share_can_edit(ps.permission))))))
-- WITH CHECK: user_in_workspace(auth.uid(), workspace_id)

-- public.push_subscriptions / push_subscriptions_own
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (auth.uid() = user_id)
-- WITH CHECK: (auth.uid() = user_id)

-- public.rh_bottom_line / rh_bl_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_bottom_line.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id))))
-- WITH CHECK: None

-- public.rh_bottom_line / rh_bl_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_bottom_line.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))
-- WITH CHECK: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_bottom_line.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))

-- public.rh_comision_movimientos / rh_mov_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM rh_ventas v
  WHERE ((v.id = rh_comision_movimientos.rh_venta_id) AND (is_super_admin() OR (v.usuario_id = auth.uid()) OR rh_can_access_empresa(v.empresa_id)))))
-- WITH CHECK: None

-- public.rh_comision_movimientos / rh_mov_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (EXISTS ( SELECT 1
   FROM rh_ventas v
  WHERE ((v.id = rh_comision_movimientos.rh_venta_id) AND (is_super_admin() OR (v.usuario_id = auth.uid()) OR rh_can_access_empresa(v.empresa_id)))))
-- WITH CHECK: (EXISTS ( SELECT 1
   FROM rh_ventas v
  WHERE ((v.id = rh_comision_movimientos.rh_venta_id) AND (is_super_admin() OR (v.usuario_id = auth.uid()) OR rh_can_access_empresa(v.empresa_id)))))

-- public.rh_comisiones / rh_com_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_comisiones.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id))))
-- WITH CHECK: None

-- public.rh_comisiones / rh_com_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_comisiones.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))
-- WITH CHECK: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_comisiones.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))

-- public.rh_costo_administrativo / rh_ca_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_costo_administrativo.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id))))
-- WITH CHECK: None

-- public.rh_costo_administrativo / rh_ca_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_costo_administrativo.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))
-- WITH CHECK: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_costo_administrativo.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))

-- public.rh_dias_descanso / rh_dias_descanso_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: rh_can_access_empresa(empresa_id)
-- WITH CHECK: None

-- public.rh_dias_descanso / rh_dias_descanso_write
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR rh_can_access_empresa(empresa_id))

-- public.rh_extra_pagos / rh_extra_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM rh_ventas v
  WHERE ((v.id = rh_extra_pagos.rh_venta_id) AND (is_super_admin() OR (v.usuario_id = auth.uid()) OR rh_can_access_empresa(v.empresa_id)))))
-- WITH CHECK: None

-- public.rh_extra_pagos / rh_extra_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (EXISTS ( SELECT 1
   FROM rh_ventas v
  WHERE ((v.id = rh_extra_pagos.rh_venta_id) AND (is_super_admin() OR (v.usuario_id = auth.uid()) OR rh_can_access_empresa(v.empresa_id)))))
-- WITH CHECK: (EXISTS ( SELECT 1
   FROM rh_ventas v
  WHERE ((v.id = rh_extra_pagos.rh_venta_id) AND (is_super_admin() OR (v.usuario_id = auth.uid()) OR rh_can_access_empresa(v.empresa_id)))))

-- public.rh_financiamiento / rh_fin_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_financiamiento.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id))))
-- WITH CHECK: None

-- public.rh_financiamiento / rh_fin_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_financiamiento.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))
-- WITH CHECK: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_financiamiento.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))

-- public.rh_linea_asignacion / rh_linea_asignacion_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: rh_can_access_empresa(empresa_id)
-- WITH CHECK: None

-- public.rh_linea_asignacion / rh_linea_asignacion_write
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR rh_can_access_empresa(empresa_id))

-- public.rh_linea_rotacion / rh_linea_rotacion_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: rh_can_access_empresa(empresa_id)
-- WITH CHECK: None

-- public.rh_linea_rotacion / rh_linea_rotacion_write
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR rh_can_access_empresa(empresa_id))

-- public.rh_okr / rh_okr_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: rh_can_access_empresa(empresa_id)
-- WITH CHECK: None

-- public.rh_okr / rh_okr_write
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR rh_can_access_empresa(empresa_id))

-- public.rh_ops_config / rh_ops_config_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: rh_can_access_empresa(empresa_id)
-- WITH CHECK: None

-- public.rh_ops_config / rh_ops_config_write
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR rh_can_access_empresa(empresa_id))

-- public.rh_parametros_generales / rh_pg_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_parametros_generales.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id))))
-- WITH CHECK: None

-- public.rh_parametros_generales / rh_pg_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_parametros_generales.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))
-- WITH CHECK: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_parametros_generales.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))

-- public.rh_premanifiesto / rh_premanifiesto_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: rh_can_access_empresa(empresa_id)
-- WITH CHECK: None

-- public.rh_premanifiesto / rh_premanifiesto_write
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR rh_can_access_empresa(empresa_id))

-- public.rh_propinas / rh_propinas_select
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: rh_can_access_empresa(empresa_id)
-- WITH CHECK: None

-- public.rh_propinas / rh_propinas_write
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (is_super_admin() OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR rh_can_access_empresa(empresa_id))

-- public.rh_regalos / rh_reg_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_regalos.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id))))
-- WITH CHECK: None

-- public.rh_regalos / rh_reg_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_regalos.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))
-- WITH CHECK: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM catalogo_configuracion c
  WHERE ((c.id = rh_regalos.catalogo_configuracion_id) AND rh_can_access_empresa(c.empresa_id)))))

-- public.rh_ventas / rh_ventas_select
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (is_super_admin() OR (usuario_id = auth.uid()) OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: None

-- public.rh_ventas / rh_ventas_write
-- permissive=PERMISSIVE roles={public} cmd=ALL
-- USING: (is_super_admin() OR (usuario_id = auth.uid()) OR rh_can_access_empresa(empresa_id))
-- WITH CHECK: (is_super_admin() OR (usuario_id = auth.uid()) OR rh_can_access_empresa(empresa_id))

-- public.rol_permisos / rol_permisos_select_scoped
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (is_super_admin() OR (EXISTS ( SELECT 1
   FROM roles r
  WHERE ((r.id = rol_permisos.rol_id) AND ((r.empresa_id IS NULL) OR user_can_read_tenant_role(r.empresa_id))))))
-- WITH CHECK: None

-- public.roles / roles_select_scoped
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (is_super_admin() OR (empresa_id IS NULL) OR user_can_read_tenant_role(empresa_id))
-- WITH CHECK: None

-- public.sales / sales_delete_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=DELETE
-- USING: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'ventas:cancelar'::text))
-- WITH CHECK: None

-- public.sales / sales_insert_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'ventas:registrar'::text))

-- public.sales / sales_select_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((user_id = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'ventas:ver_equipo'::text) OR (EXISTS ( SELECT 1
   FROM (prospect_shares ps
     JOIN prospects p ON ((p.id = ps.prospect_id)))
  WHERE ((ps.prospect_id = sales.prospect_id) AND (ps.shared_with_id = auth.uid()) AND (p.workspace_id = sales.workspace_id))))))
-- WITH CHECK: None

-- public.sales / sales_update_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=UPDATE
-- USING: ((user_id = auth.uid()) AND workspace_has_permission(auth.uid(), workspace_id, 'ventas:editar'::text))
-- WITH CHECK: ((user_id = auth.uid()) AND user_in_workspace(auth.uid(), workspace_id))

-- public.scheduled_push_jobs / Users read own scheduled push
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_id = auth.uid())
-- WITH CHECK: None

-- public.share_permission_requests / share_perm_req_insert_requester
-- permissive=PERMISSIVE roles={public} cmd=INSERT
-- USING: None
-- WITH CHECK: ((auth.uid() = requester_id) AND (EXISTS ( SELECT 1
   FROM prospect_shares ps
  WHERE ((ps.id = share_permission_requests.share_id) AND (ps.shared_with_id = auth.uid()) AND (ps.owner_id = ps.owner_id) AND (ps.prospect_id = ps.prospect_id)))))

-- public.share_permission_requests / share_perm_req_select_participant
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: ((auth.uid() = owner_id) OR (auth.uid() = requester_id))
-- WITH CHECK: None

-- public.share_permission_requests / share_perm_req_update_owner
-- permissive=PERMISSIVE roles={public} cmd=UPDATE
-- USING: (auth.uid() = owner_id)
-- WITH CHECK: None

-- public.support_request_replies / support_replies_insert_admin
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((autor_id = auth.uid()) AND is_admin())

-- public.support_request_replies / support_replies_select_owner_or_admin
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((autor_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM support_requests sr
  WHERE ((sr.id = support_request_replies.ticket_id) AND (sr.user_id = auth.uid())))) OR is_admin())
-- WITH CHECK: None

-- public.support_requests / Admins read all support requests
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR (p.role = 'admin'::user_role)))))
-- WITH CHECK: None

-- public.support_requests / Users insert own support requests
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: (user_id = auth.uid())

-- public.support_requests / Users read own support requests
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_id = auth.uid())
-- WITH CHECK: None

-- public.survey_preguntas / survey_preguntas_select_auth
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: true
-- WITH CHECK: None

-- public.survey_preguntas_usuario / survey_preguntas_usuario_all_own
-- permissive=PERMISSIVE roles={authenticated} cmd=ALL
-- USING: (auth.uid() = usuario_id)
-- WITH CHECK: (auth.uid() = usuario_id)

-- public.tool_calculations / tools_delete_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=DELETE
-- USING: ((user_id = auth.uid()) AND user_in_workspace(auth.uid(), workspace_id))
-- WITH CHECK: None

-- public.tool_calculations / tools_insert_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: (user_in_workspace(auth.uid(), workspace_id) AND ((user_id = auth.uid()) OR ((user_id = ( SELECT p.user_id
   FROM prospects p
  WHERE (p.id = tool_calculations.prospect_id))) AND (EXISTS ( SELECT 1
   FROM prospect_workflows pw
  WHERE ((pw.prospect_id = tool_calculations.prospect_id) AND (pw.cerrador_id = auth.uid())))))))

-- public.tool_calculations / tools_select_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((user_id = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'expedientes:ver_equipo'::text) OR (EXISTS ( SELECT 1
   FROM prospect_workflows pw
  WHERE ((pw.prospect_id = tool_calculations.prospect_id) AND (pw.cerrador_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM prospect_shares ps
  WHERE ((ps.prospect_id = tool_calculations.prospect_id) AND (ps.shared_with_id = auth.uid()))))))
-- WITH CHECK: None

-- public.tool_calculations / tools_update_tenant_role
-- permissive=PERMISSIVE roles={authenticated} cmd=UPDATE
-- USING: (user_in_workspace(auth.uid(), workspace_id) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM prospect_workflows pw
  WHERE ((pw.prospect_id = tool_calculations.prospect_id) AND (pw.cerrador_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM prospect_shares ps
  WHERE ((ps.prospect_id = tool_calculations.prospect_id) AND (ps.shared_with_id = auth.uid()) AND share_can_edit(ps.permission))))))
-- WITH CHECK: user_in_workspace(auth.uid(), workspace_id)

-- public.user_connections / connections_delete_participant
-- permissive=PERMISSIVE roles={public} cmd=DELETE
-- USING: ((auth.uid() = requester_id) OR (auth.uid() = addressee_id))
-- WITH CHECK: None

-- public.user_connections / connections_insert_requester
-- permissive=PERMISSIVE roles={public} cmd=INSERT
-- USING: None
-- WITH CHECK: ((auth.uid() = requester_id) AND (status = 'pending'::connection_status))

-- public.user_connections / connections_select_participant
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: ((auth.uid() = requester_id) OR (auth.uid() = addressee_id))
-- WITH CHECK: None

-- public.user_connections / connections_update_participant
-- permissive=PERMISSIVE roles={public} cmd=UPDATE
-- USING: ((auth.uid() = requester_id) OR (auth.uid() = addressee_id))
-- WITH CHECK: None

-- public.usuario_permisos_override / overrides_select_own_or_admin
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((usuario_id = auth.uid()) OR is_super_admin())
-- WITH CHECK: None

-- public.workspace_miembros / workspace_miembros_select_self
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((usuario_id = auth.uid()) OR user_in_workspace(auth.uid(), workspace_id) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_super_admin = true)))))
-- WITH CHECK: None

-- public.workspace_usuario_permisos_override / workspace_overrides_select_context
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((usuario_id = auth.uid()) OR workspace_has_permission(auth.uid(), workspace_id, 'users:permissions'::text))
-- WITH CHECK: None

-- public.workspaces / workspaces_select_member
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: (user_in_workspace(auth.uid(), id) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_super_admin = true)))))
-- WITH CHECK: None

-- realtime.messages / presence_listen_contacts
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((presence_user_from_topic(( SELECT realtime.topic() AS topic)) IS NOT NULL) AND ((presence_user_from_topic(( SELECT realtime.topic() AS topic)) = ( SELECT auth.uid() AS uid)) OR users_are_connected(( SELECT auth.uid() AS uid), presence_user_from_topic(( SELECT realtime.topic() AS topic)))))
-- WITH CHECK: None

-- realtime.messages / presence_listen_expediente
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((presence_prospect_from_topic(( SELECT realtime.topic() AS topic)) IS NOT NULL) AND user_can_access_prospect(( SELECT auth.uid() AS uid), presence_prospect_from_topic(( SELECT realtime.topic() AS topic))))
-- WITH CHECK: None

-- realtime.messages / presence_track_expediente
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((extension = 'presence'::text) AND (presence_prospect_from_topic(( SELECT realtime.topic() AS topic)) IS NOT NULL) AND user_can_access_prospect(( SELECT auth.uid() AS uid), presence_prospect_from_topic(( SELECT realtime.topic() AS topic))))

-- realtime.messages / presence_track_own
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((extension = 'presence'::text) AND (presence_user_from_topic(( SELECT realtime.topic() AS topic)) = ( SELECT auth.uid() AS uid)))

-- storage.objects / Users delete own support screenshots
-- permissive=PERMISSIVE roles={authenticated} cmd=DELETE
-- USING: ((bucket_id = 'support-screenshots'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
-- WITH CHECK: None

-- storage.objects / Users read own support screenshots
-- permissive=PERMISSIVE roles={authenticated} cmd=SELECT
-- USING: ((bucket_id = 'support-screenshots'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
-- WITH CHECK: None

-- storage.objects / Users upload own support screenshots
-- permissive=PERMISSIVE roles={authenticated} cmd=INSERT
-- USING: None
-- WITH CHECK: ((bucket_id = 'support-screenshots'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))

-- storage.objects / workspace_branding_public_read
-- permissive=PERMISSIVE roles={public} cmd=SELECT
-- USING: (bucket_id = 'workspace-branding'::text)
-- WITH CHECK: None

