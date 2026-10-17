/**
 * Caracterización + seguridad GET/PUT survey questions-config.
 *
 * Contrato:
 * - Sin userId → 401 (GET y PUT).
 * - GET: autenticado → banco global + overrides de SU usuario_id (sin flag ni permiso configurar).
 * - PUT: flag workspace `survey` + permiso `herramientas:survey_configurar_preguntas`
 *   (misma clave que la UI `can(...)` / use-survey-questions).
 * - Aislamiento cross-user: overrides filtrados por usuario_id.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { mock } from "node:test";
import {
  LINER_DEFAULT_PERMISSIONS,
  ADMIN_DEFAULT_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  SOPORTE_DEFAULT_PERMISSIONS,
} from "@salesapp/shared/auth/permission-catalog.js";
import { resolveUserPermissions } from "@salesapp/shared/auth/resolve-permissions.js";
import { ServiceError } from "../../../lib/service-error.js";
import {
  WORKSPACE_FLAG_DENIED,
  WORKSPACE_PERMISSION_DENIED,
  MSG_FLAG_DENIED,
  MSG_PERMISSION_DENIED,
} from "../../../lib/workspace-permission-rpc.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = resolve(HERE, "survey-questions-service.js");
const LEGACY = resolve(HERE, "../../../services/survey-questions-service.js");
const WS_SERVICE = resolve(HERE, "../../../services/workspace-service.js");
const UI_HOOK = resolve(
  HERE,
  "../../../../../web/src/modulos/survey/hooks/use-survey-questions.js",
);

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const PERM_CONFIG = "herramientas:survey_configurar_preguntas";

/** Roles que por seed/default ven el botón «Configurar preguntas» (0043/0045 + 0056). */
const ROLES_UI_VE_CONFIGURAR = ["liner", "cerrador", "gerente", "admin", "superadmin"];

async function loadService() {
  const path = existsSync(MOD) ? MOD : LEGACY;
  return import(`${pathToFileURL(path).href}?t=${Date.now()}`);
}

function chainable(result) {
  const api = {
    select() {
      return api;
    },
    eq() {
      return api;
    },
    in() {
      return api;
    },
    order() {
      return api;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return api;
}

mock.module(pathToFileURL(WS_SERVICE).href, {
  namedExports: {
    resolveActiveWorkspaceId: async () => WS,
    listUserWorkspaces: async () => [{ id: WS, tipo: "personal" }],
    ensurePersonalWorkspace: async () => {},
  },
});

test("GET sin userId → 401", async () => {
  const svc = await loadService();
  await assert.rejects(
    () => svc.getSurveyQuestionsConfig({ from() { return chainable({ data: [], error: null }); } }, null),
    (err) => err instanceof ServiceError && err.status === 401,
  );
});

test("PUT sin userId → 401", async () => {
  const svc = await loadService();
  await assert.rejects(
    () => svc.saveSurveyQuestionsConfig({}, null, { seccion: "motivaciones", items: [] }),
    (err) => err instanceof ServiceError && err.status === 401,
  );
});

test("GET autenticado: banco + solo overrides del usuario (B no ve overrides de A)", async () => {
  const svc = await loadService();
  const bank = [
    { id: Q1, clave: "p1", seccion: "motivaciones", es_global: true, opciones: ["rest_disconnect"], orden: 10 },
  ];
  const overridesByUser = {
    [USER_A]: [{ pregunta_id: Q1, activa: true, orden: 1, texto_override: "Solo A", opciones_override: null }],
    [USER_B]: [],
  };
  const sb = {
    from(table) {
      if (table === "survey_preguntas") return chainable({ data: bank, error: null });
      if (table === "survey_preguntas_usuario") {
        return {
          select() {
            return {
              eq(_c, uid) {
                return Promise.resolve({ data: overridesByUser[uid] || [], error: null });
              },
            };
          },
        };
      }
      return chainable({ data: null, error: null });
    },
  };
  const a = await svc.getSurveyQuestionsConfig(sb, USER_A);
  assert.equal(a.overrides[0].texto_override, "Solo A");
  const b = await svc.getSurveyQuestionsConfig(sb, USER_B);
  assert.equal(b.overrides.length, 0, "B no lee overrides de A");
});

function sbAuth({
  flag = true,
  permission = true,
  bank = [{ id: Q1, opciones: ["rest_disconnect"] }],
  onUpsert,
} = {}) {
  return {
    async rpc(name) {
      if (name === "resolver_workspace_flag") return { data: flag, error: null };
      if (name === "workspace_has_permission") return { data: permission, error: null };
      if (name === "user_in_workspace") return { data: true, error: null };
      return { data: null, error: { message: "unexpected " + name } };
    },
    from(table) {
      if (table === "survey_preguntas") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      in(_c, ids) {
                        return Promise.resolve({
                          data: bank.filter((r) => ids.includes(r.id)),
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "survey_preguntas_usuario") {
        return {
          upsert(payload, opts) {
            onUpsert?.(payload, opts);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      return chainable({ data: null, error: null });
    },
  };
}

const BODY_OK = {
  seccion: "motivaciones",
  items: [{ pregunta_id: Q1, orden: 1, activa: true }],
};

test("PUT payload inválido: sección / items / uuid / orden → 400", async () => {
  const svc = await loadService();
  const sb = sbAuth();
  await assert.rejects(
    () => svc.saveSurveyQuestionsConfig(sb, USER_A, { seccion: "nope", items: [{ pregunta_id: Q1, orden: 1 }] }),
    (err) => err instanceof ServiceError && err.status === 400 && /Sección inválida/i.test(err.message),
  );
  await assert.rejects(
    () => svc.saveSurveyQuestionsConfig(sb, USER_A, { seccion: "motivaciones", items: [] }),
    (err) => err instanceof ServiceError && err.status === 400 && /al menos una pregunta/i.test(err.message),
  );
  await assert.rejects(
    () =>
      svc.saveSurveyQuestionsConfig(sb, USER_A, {
        seccion: "motivaciones",
        items: [{ pregunta_id: "not-a-uuid", orden: 1 }],
      }),
    (err) => err instanceof ServiceError && err.status === 400 && /ID de pregunta inválido/i.test(err.message),
  );
  await assert.rejects(
    () =>
      svc.saveSurveyQuestionsConfig(sb, USER_A, {
        seccion: "motivaciones",
        items: [{ pregunta_id: Q1, orden: 1.5 }],
      }),
    (err) => err instanceof ServiceError && err.status === 400 && /Orden inválido/i.test(err.message),
  );
});

test("PUT sin flag survey → 403 FLAG_DENIED", async () => {
  const svc = await loadService();
  await assert.rejects(
    () => svc.saveSurveyQuestionsConfig(sbAuth({ flag: false, permission: true }), USER_A, BODY_OK),
    (err) =>
      err instanceof ServiceError &&
      err.status === 403 &&
      err.code === WORKSPACE_FLAG_DENIED &&
      err.message === MSG_FLAG_DENIED,
  );
});

test("PUT sin permiso configurar → 403 PERMISSION_DENIED", async () => {
  const svc = await loadService();
  await assert.rejects(
    () => svc.saveSurveyQuestionsConfig(sbAuth({ flag: true, permission: false }), USER_A, BODY_OK),
    (err) =>
      err instanceof ServiceError &&
      err.status === 403 &&
      err.code === WORKSPACE_PERMISSION_DENIED &&
      err.message === MSG_PERMISSION_DENIED,
  );
});

test("PUT con flag + permiso → 200 (saved); pregunta ajena a sección → 403", async () => {
  const svc = await loadService();
  let upsertSeen = null;
  const sb = sbAuth({
    onUpsert(payload, opts) {
      upsertSeen = { payload, opts };
    },
  });
  const saved = await svc.saveSurveyQuestionsConfig(sb, USER_A, {
    seccion: "motivaciones",
    items: [
      {
        pregunta_id: Q1,
        orden: 10,
        activa: true,
        texto_override: "Titulo custom",
        opciones_override: [{ key: "rest_disconnect", label: "Descanso" }],
      },
    ],
  });
  assert.equal(saved.saved, 1);
  assert.equal(saved.seccion, "motivaciones");
  assert.equal(upsertSeen.payload[0].usuario_id, USER_A);
  assert.equal(upsertSeen.opts.onConflict, "usuario_id,pregunta_id");

  await assert.rejects(
    () =>
      svc.saveSurveyQuestionsConfig(sb, USER_A, {
        seccion: "motivaciones",
        items: [{ pregunta_id: Q2, orden: 1, activa: true }],
      }),
    (err) => err instanceof ServiceError && err.status === 403 && /no pertenecen/i.test(err.message),
  );
});

test("PUT super admin (permiso concedido por RPC) → guarda OK", async () => {
  const svc = await loadService();
  const keys = resolveUserPermissions({
    role: "admin",
    is_super_admin: true,
  });
  assert.equal(keys.has(PERM_CONFIG), true, "superadmin resuelve el permiso en UI");
  const saved = await svc.saveSurveyQuestionsConfig(
    sbAuth({ flag: true, permission: true }),
    USER_A,
    BODY_OK,
  );
  assert.equal(saved.saved, 1);
});

for (const slug of ROLES_UI_VE_CONFIGURAR) {
  test(`PUT rol ${slug} (ve botón en UI) → guarda OK`, async () => {
    const svc = await loadService();
    const uiKeys = permissionKeysForRoleSlug(slug);
    assert.equal(
      uiKeys.has(PERM_CONFIG),
      true,
      `${slug} debe tener ${PERM_CONFIG} en defaults UI`,
    );
    const saved = await svc.saveSurveyQuestionsConfig(
      sbAuth({ flag: true, permission: true }),
      USER_A,
      BODY_OK,
    );
    assert.equal(saved.saved, 1);
  });
}

test("paridad UI↔servidor: misma clave y mismos roles por defecto", async () => {
  const svc = await loadService();
  assert.equal(svc.PERMISO_SURVEY_CONFIGURAR_PREGUNTAS, PERM_CONFIG);

  const uiSrc = readFileSync(UI_HOOK, "utf8");
  assert.match(
    uiSrc,
    /can\(\s*["']herramientas:survey_configurar_preguntas["']\s*\)/,
    "UI debe gatear con la misma clave",
  );

  const svcSrc = readFileSync(existsSync(MOD) ? MOD : LEGACY, "utf8");
  assert.match(
    svcSrc,
    /requireWorkspacePermission\([\s\S]*PERMISO_SURVEY_CONFIGURAR_PREGUNTAS/,
    "servidor debe exigir el permiso vía requireWorkspacePermission",
  );

  assert.equal(LINER_DEFAULT_PERMISSIONS.includes(PERM_CONFIG), true);
  assert.equal(ADMIN_DEFAULT_PERMISSIONS.includes(PERM_CONFIG), true);
  assert.equal(SOPORTE_DEFAULT_PERMISSIONS.includes(PERM_CONFIG), true);
  assert.equal(ALL_PERMISSION_KEYS.includes(PERM_CONFIG), true);

  for (const slug of ROLES_UI_VE_CONFIGURAR) {
    assert.equal(
      permissionKeysForRoleSlug(slug).has(PERM_CONFIG),
      true,
      `rol ${slug}: UI concede → servidor acepta (misma clave)`,
    );
  }

  // Asistente / rol sin la clave (lista explícita; [] vacía cae al legacy liner).
  const sinConfigurar = resolveUserPermissions({
    role: "liner",
    role_permission_keys: ["expedientes:ver_propios", "herramientas:survey"],
    overrides: [],
  });
  assert.equal(sinConfigurar.has(PERM_CONFIG), false, "sin clave: UI oculta botón");
  await assert.rejects(
    () =>
      svc.saveSurveyQuestionsConfig(
        sbAuth({ flag: true, permission: false }),
        USER_A,
        BODY_OK,
      ),
    (err) => err instanceof ServiceError && err.status === 403,
  );
});

function permissionKeysForRoleSlug(slug) {
  if (slug === "superadmin") {
    return resolveUserPermissions({ role: "admin", is_super_admin: true });
  }
  if (slug === "admin") {
    return resolveUserPermissions({
      role: "admin",
      role_permission_keys: ADMIN_DEFAULT_PERMISSIONS,
    });
  }
  // liner / cerrador / gerente: seed copia catálogo liner (APP sin ver_equipo + extras workflow)
  return resolveUserPermissions({
    role: "liner",
    role_permission_keys: LINER_DEFAULT_PERMISSIONS,
  });
}
