/**
 * Paridad UI: personal siempre; sala solo con clave efectiva (sin LINER_DEFAULT).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  PERMISO_SURVEY_CONFIGURAR_PREGUNTAS,
  canConfigureSurveyQuestions,
} from "./can-configure-survey-questions.js";

const PERM = PERMISO_SURVEY_CONFIGURAR_PREGUNTAS;

test("personal / sin activo → botón visible aunque can=false", () => {
  assert.equal(
    canConfigureSurveyQuestions({ activeWorkspace: { tipo: "personal" }, can: () => false }),
    true,
  );
  assert.equal(
    canConfigureSurveyQuestions({ activeWorkspace: null, can: () => false }),
    true,
  );
});

test("sala → solo si can(clave)", () => {
  assert.equal(
    canConfigureSurveyQuestions({
      activeWorkspace: { tipo: "sala_de_venta" },
      can: () => false,
    }),
    false,
  );
  assert.equal(
    canConfigureSurveyQuestions({
      activeWorkspace: { tipo: "sala_de_venta" },
      can: (k) => k === PERM,
    }),
    true,
  );
});
