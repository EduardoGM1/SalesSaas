# Entornos — propuesta (sin implementar)

**Estado:** documentación pendiente de decisión. Hoy el stack de desarrollo local apunta al **Supabase de producción** (cloud).  
**Objetivo:** reducir riesgo de mutaciones accidentales en datos reales sin bloquear el piloto de arquitectura.

---

## Situación actual

| Capa | Qué usa el dev local |
|------|----------------------|
| Web (Vite) / API local | `.env.local` puede seguir apuntando a un host **cloud muerto** (`*.supabase.co` sin DNS). Auth **real** de prod es self-hosted en el VPS (`SUPABASE_URL` loopback `:8001`; público vía `VITE_SUPABASE_URL` = IP del VPS). |
| Postgres | Self-hosted en VPS (`saletse-prod-db`); scripts QA escriben vía SSH + `psql`. |
| Catálogos geo / FX | Sin BD (geo estático en proceso; FX vía Frankfurter). |

Consecuencia: para smoke UI local hay que alinear `SUPABASE_*` / `VITE_SUPABASE_*` con el Auth del VPS (overlay temporal fuera del repo). Login/settings/expedientes con escritura tocan **producción**. Mitigador: **QA efímera** + purga (conteos 0) vía VPS.

---

## Opciones

### A — Solo QA efímera (mínimo cambio)

Seguir apuntando a prod; toda prueba que escriba usa cuenta desechable + purga estándar (`qa_purge_standard.py`: profiles, prospects, empresa_miembros, ws personal → 0).

| Pros | Contras |
|------|---------|
| Cero infra nueva; mismo auth/RLS/schema que prod | Un bug de purga o un script mal apuntado puede tocar datos reales |
| Refleja comportamiento real (latencia, triggers, policies) | No sirve para experimentos de migración / schema |
| Ya hay patrón en scripts de smoke | Devs deben disciplina estricta (nunca credenciales personales en automatismos) |

**Cuándo elegirla:** corto plazo, mientras el piloto solo mueve código sin migraciones DDL.

---

### B — Supabase local (CLI / Docker)

Proyecto local (`supabase start`) con migraciones aplicadas desde el repo; `.env.local` apunta a `http://127.0.0.1:54321` (o el puerto del stack).

| Pros | Contras |
|------|---------|
| Aislamiento total de datos reales | Drift vs prod si las migraciones/seeds no se mantienen |
| Permite probar DDL, RLS y seeds agresivos | Setup más pesado (Docker, reset, seeds de empresas/roles) |
| CI puede levantar el mismo stack | Auth/URLs/redirects distintos; hay que documentar el flujo |

**Cuándo elegirla:** antes de migraciones de schema o módulos que muten tablas críticas.

---

### C — Proyecto Supabase staging (cloud aparte)

Segundo proyecto en Supabase (staging) con dump/anonimizado o seeds; secrets en `.env.staging` / VPS de preview.

| Pros | Contras |
|------|---------|
| Cercano a prod (managed, SSL, mismos servicios) | Coste y operación de un segundo proyecto |
| Se puede compartir entre el equipo | Hay que sincronizar migraciones y seeds con disciplina |
| Permite “smoke de staging” antes de prod | Riesgo de que staging se trate como “casi prod” y se descuide |

**Cuándo elegirla:** cuando haya más de un desarrollador o deploys frecuentes con datos de integración.

---

### D — Híbrido práctico (recomendación provisional)

1. **Default local:** seguir con prod **solo** para lecturas y smokes de contratos GET (geo, FX, health).  
2. **Escrituras / UI con login:** QA efímera + purga obligatoria (opción A).  
3. **Antes del módulo que toque schema o moneda/settings persistidos a escala:** evaluar B o C.

No implementa infra nueva hoy; formaliza la regla ya usada en el piloto geo-fx.

---

## Criterios de decisión (checklist)

- ¿El cambio requiere DDL o backfill? → B o C, no A sola.  
- ¿Solo move/extract de código con contratos HTTP iguales? → A + smoke GET + QA efímera si hay UI.  
- ¿Varias personas escribiendo a la vez en el mismo proyecto? → C (o B por persona).  
- ¿CI debe ser reproducible sin secretos de prod? → B.

---

## Fuera de alcance de este doc

- Implementar Supabase local o staging.  
- Cambiar `.env.local` del equipo.  
- Módulo 2 (moneda / settings FX).
