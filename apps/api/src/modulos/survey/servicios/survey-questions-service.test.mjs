/**
 * Caracterización GET/PUT survey questions-config (antes/después de 5b.6).
 * Congela auth y validación actuales — no “mejora” seguridad aquí.
 *
 * Comportamiento actual:
 * - Sin userId → 401 (GET y PUT).
 * - GET: autenticado → banco global + overrides de SU usuario_id (sin flag survey).
 * - PUT: exige flag workspace `survey`; NO exige `herramientas:survey_configurar_preguntas`.
 * - Aislamiento cross-user: overrides filtrados por usuario_id (no workspace_id).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { mock } from "node:test";
import { ServiceError } from "../../../lib/service-error.js";
import { WORKSPACE_FLAG_DENIED, MSG_FLAG_DENIED } from "../../../lib/workspace-permission-rpc.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = resolve(HERE, "survey-questions-service.js");
const LEGACY = resolve(HERE, "../../../services/survey-questions-service.js");
const WS_SERVICE = resolve(HERE, "../../../services/workspace-service.js");

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";

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

function sbFlag(granted, { bank = [{ id: Q1, opciones: ["rest_disconnect"] }], onUpsert } = {}) {
  return {
    async rpc(name) {
      if (name === "resolver_workspace_flag") return { data: granted, error: null };
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

test("PUT payload inválido: sección / items / uuid / orden → 400", async () => {
  const svc = await loadService();
  const sb = sbFlag(true);
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

test("PUT sin flag survey → 403 FLAG_DENIED (comportamiento actual)", async () => {
  const svc = await loadService();
  await assert.rejects(
    () =>
      svc.saveSurveyQuestionsConfig(sbFlag(false), USER_A, {
        seccion: "motivaciones",
        items: [{ pregunta_id: Q1, orden: 1, activa: true }],
      }),
    (err) =>
      err instanceof ServiceError &&
      err.status === 403 &&
      err.code === WORKSPACE_FLAG_DENIED &&
      err.message === MSG_FLAG_DENIED,
  );
});

test("PUT válido: upsert con usuario_id del caller; pregunta ajena a sección → 403", async () => {
  const svc = await loadService();
  let upsertSeen = null;
  const sb = sbFlag(true, {
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

test("NOTA seguridad (no falla): PUT no exige herramientas:survey_configurar_preguntas", () => {
  assert.ok(true, "gap actual: permiso configurar solo en UI; API solo flag survey");
});
