# Metodología de auditoría de seguridad (reutilizable)

Documento **público y seguro**: describe cómo auditar, no qué se encontró. Los informes con evidencias, IPs, secretos (solo nombres) y hallazgos viven fuera del repositorio, en el apéndice privado de operaciones.

## 1. Objetivo y frecuencia

- **Objetivo:** comprobar de forma repetible la postura de seguridad del monorepo, la API, el SPA/PWA, la cadena de suministro y el servidor de despliegue, sin introducir cambios durante la fase de hallazgo.
- **Frecuencia recomendada:**
  - **Trimestral:** auditoría FASE 1 completa (dependencias, secretos, app, servidor RO, gobernanza).
  - **Tras incidente o cambio mayor** (auth, RLS, edge, privatización del repo): mini-auditoría de las secciones afectadas.
  - **Continua:** `npm audit` / Dependabot en CI; escaneo de secretos en pre-commit o CI; revisión de PRs con impacto en auth/ACL.

## 2. Estándares de referencia

Citar el control en cada hallazgo del informe privado:

| Marco | Uso típico |
|-------|------------|
| OWASP Top 10 (2021) | Clasificación de impacto (A01–A10) |
| OWASP ASVS nivel 2 | Auth, sesiones, control de acceso, validación |
| OWASP API Security Top 10 | Superficie `/api`, sync, cron, PostgREST |
| CIS Benchmarks | Ubuntu/Linux, Nginx, PostgreSQL (solo lectura de config) |
| Hardening Supabase self-hosted | Kong, Studio, DB, JWT, loopback |
| GitHub Actions security hardening | Permisos del token, pin de actions, forks |
| SLSA (básico) | Lockfile, reproducibilidad, provenance |
| Buenas prácticas PWA / service worker | Alcance de caché, datos offline, no cachear APIs autenticadas |

## 3. Fases (obligatorio)

### FASE 1 — Solo lectura (descubrimiento)

- Sin cambios en el servidor de producción, sin instalar paquetes allí, sin deploy, sin migraciones ni correcciones.
- Evidencia: comando o archivo; **nunca** valores de secretos, tokens ni datos personales reales en el informe.
- Si aparece un secreto de producción **vigente** expuesto o un servicio crítico de datos **sin autenticación en Internet**, emitir **alerta parcial inmediata** y pausar remediación hasta OK explícito.

### FASE 2 — Remediación (solo con OK)

- Requiere OK explícito del operador, backup, plan de rollback y ventana acordada.
- Priorizar por oleadas (0 = exposición inmediata, 1 = TLS/hardening/CVE alcanzable, 2 = monitoreo/backups/CI, 3 = proceso).

## 4. Alcance del checklist

### A. Dependencias y cadena de suministro

- [ ] `npm audit` (prod omitiendo dev, y completo) en todos los workspaces
- [ ] `npm outdated` (marcar majors)
- [ ] Lockfile presente y coherente; `engines` / versión Node en CI vs servidor vs LTS
- [ ] Scripts `postinstall` / install hooks
- [ ] Workflows: `permissions`, pin SHA vs tag, secretos, PRs de forks, Dependabot/Renovate
- [ ] (Opcional) SBOM resumido / licencias problemáticas / depcheck

### B. Secretos y repositorio

- [ ] Escaneo de secretos en árbol e historial (herramienta local; no en el VPS)
- [ ] Inventario de información sensible versionada (correos, infra, docs de hallazgos)
- [ ] Nombres de variables de entorno y dónde viven (servidor, CI, plantillas)
- [ ] Confirmar que claves de servicio **no** llegan al bundle del cliente
- [ ] Cruce con el plan de privatización / higiene del repo (ops privado)

### C. Aplicación (web + API)

- [ ] Auth/sesión: política de contraseñas, TTL, refresh, logout/revocación, enumeración, rate limit, confirmación correo, rol por defecto
- [ ] Autorización: mapa de rutas `/api/v1/*`, sync vs REST, workspaces, IDOR
- [ ] RLS: tablas sin RLS, policies permisivas, `SECURITY DEFINER` + `search_path`, grants `anon`/`authenticated`, storage, RPC, realtime
- [ ] Validación: body size, uploads, inyección, XSS, CSRF, redirects abiertos
- [ ] Cabeceras: CSP, HSTS, frame-ancestors, CORS, cookies Secure/HttpOnly/SameSite
- [ ] PWA: SW, caché de respuestas autenticadas, almacenamiento local sensible
- [ ] Rate limiting y endpoints costosos / cron (comparación de secreto en tiempo constante)
- [ ] Logging: no tokens/contraseñas/PII; retención; auditoría admin

### D. Servidor (solo comandos de lectura)

- [ ] SO, parches pendientes, reinicio pendiente, actualizaciones automáticas
- [ ] SSH (root, claves, puerto), fail2ban, sudoers
- [ ] Firewall y puertos en escucha (interfaz: pública vs loopback)
- [ ] Nginx: versión, tokens, límites, headers, paths sensibles, TLS
- [ ] Procesos (usuario no privilegiado), permisos de app y backups, cron
- [ ] Contenedores / Postgres self-hosted: exposición, ages de imágenes, permisos de `.env`
- [ ] Backups: ubicación, permisos, retención, 3-2-1, restore documentado
- [ ] Monitoreo / alertas existentes

### E. Continuidad y gobernanza

- [ ] Escenarios: compromiso GitHub, VPS, superadmin, service role — pasos quién/dónde
- [ ] Política y fechas de rotación de secretos
- [ ] Separación de entornos; cuentas QA (aislamiento y purga)
- [ ] Lista de lo no verificable desde el IDE (panel proveedor, DNS, 2FA, offsite)

## 5. Reglas de seguridad de la propia auditoría

1. Producción solo lectura: sin fuzzing agresivo, sin DoS, sin fuerza bruta real.
2. Pruebas de autorización solo con cuentas QA efímeras y purga a cero.
3. Sin imprimir ni versionar secretos, claves, tokens ni PII reales.
4. No instalar herramientas en el VPS sin OK; preferir comandos nativos de lectura.
5. No empezar remediación en FASE 1.

## 6. Entregables tipicos

1. **Informe privado** (fuera del repo): resumen, tabla de hallazgos (ID, estándar, severidad, evidencia, remediación, esfuerzo, rollback), “lo que está bien”, “no verificable”.
2. **Plan por oleadas** con dependencias de decisión del operador y pruebas de validación.
3. **Actualización opcional de este documento** si cambia el alcance o la frecuencia (sin copiar hallazgos explotables).

## 7. Relación con el proyecto

- Visión general del sistema: [`../PROYECTO.md`](../PROYECTO.md).
- Backlog de seguridad (público, sin secretos): [`../arquitectura/backlog-seguridad.md`](../arquitectura/backlog-seguridad.md).
- El detalle operativo (IPs, rutas de backup, matrices de cuenta, informes fechados) permanece en el apéndice privado del operador.
