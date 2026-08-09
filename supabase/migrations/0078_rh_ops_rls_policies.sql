-- ============================================================
-- 0078 — Políticas RLS tablas ops RH (0077)
-- Mismo criterio que rh_can_access_empresa en 0076
-- ============================================================

grant execute on function public.rh_can_access_empresa(uuid) to authenticated, service_role;

-- rh_dias_descanso
drop policy if exists rh_dias_descanso_select on public.rh_dias_descanso;
drop policy if exists rh_dias_descanso_write on public.rh_dias_descanso;
create policy rh_dias_descanso_select on public.rh_dias_descanso
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_dias_descanso_write on public.rh_dias_descanso
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));

-- rh_ops_config
drop policy if exists rh_ops_config_select on public.rh_ops_config;
drop policy if exists rh_ops_config_write on public.rh_ops_config;
create policy rh_ops_config_select on public.rh_ops_config
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_ops_config_write on public.rh_ops_config
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));

-- rh_premanifiesto
drop policy if exists rh_premanifiesto_select on public.rh_premanifiesto;
drop policy if exists rh_premanifiesto_write on public.rh_premanifiesto;
create policy rh_premanifiesto_select on public.rh_premanifiesto
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_premanifiesto_write on public.rh_premanifiesto
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));

-- rh_linea_asignacion
drop policy if exists rh_linea_asignacion_select on public.rh_linea_asignacion;
drop policy if exists rh_linea_asignacion_write on public.rh_linea_asignacion;
create policy rh_linea_asignacion_select on public.rh_linea_asignacion
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_linea_asignacion_write on public.rh_linea_asignacion
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));

-- rh_linea_rotacion
drop policy if exists rh_linea_rotacion_select on public.rh_linea_rotacion;
drop policy if exists rh_linea_rotacion_write on public.rh_linea_rotacion;
create policy rh_linea_rotacion_select on public.rh_linea_rotacion
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_linea_rotacion_write on public.rh_linea_rotacion
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));

-- rh_okr
drop policy if exists rh_okr_select on public.rh_okr;
drop policy if exists rh_okr_write on public.rh_okr;
create policy rh_okr_select on public.rh_okr
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_okr_write on public.rh_okr
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));

-- rh_propinas
drop policy if exists rh_propinas_select on public.rh_propinas;
drop policy if exists rh_propinas_write on public.rh_propinas;
create policy rh_propinas_select on public.rh_propinas
  for select to authenticated
  using (public.rh_can_access_empresa(empresa_id));
create policy rh_propinas_write on public.rh_propinas
  for all to authenticated
  using (public.is_super_admin() or public.rh_can_access_empresa(empresa_id))
  with check (public.is_super_admin() or public.rh_can_access_empresa(empresa_id));
