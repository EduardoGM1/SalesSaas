import assert from "node:assert/strict";
import test from "node:test";
import {
  USER_GLOBAL_SETTING_KEYS,
  WORKSPACE_SETTING_KEYS,
  buildProfileSettingsBody,
  composeSettings,
  hasWorkspaceSettings,
  mergeSettingsForWorkspace,
  pickUserGlobalSettings,
  pickWorkspaceSettings,
} from "./settings-scope.js";

const WS_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WS_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

test("claves globales vs por-workspace no se solapan", () => {
  const overlap = USER_GLOBAL_SETTING_KEYS.filter((k) => WORKSPACE_SETTING_KEYS.includes(k));
  assert.deepEqual(overlap, []);
});

test("pickUserGlobalSettings ignora worksheet/moneyBox/tourTypes", () => {
  const picked = pickUserGlobalSettings({
    language: "en",
    userName: "Ana",
    worksheetConfig: { meses1: "60" },
    moneyBoxConfig: { fc: "1" },
    tourTypes: ["Q"],
    workspaces: { [WS_A]: { worksheetConfig: { meses1: "36" } } },
  });
  assert.equal(picked.language, "en");
  assert.equal(picked.userName, "Ana");
  assert.equal(picked.worksheetConfig, undefined);
  assert.equal(picked.tourTypes, undefined);
  assert.equal(picked.workspaces, undefined);
});

test("pickWorkspaceSettings no incluye idioma ni moneda", () => {
  const picked = pickWorkspaceSettings({
    language: "en",
    currency: "MXN",
    worksheetConfig: { meses1: "60" },
    tourTypes: ["CT"],
  });
  assert.deepEqual(picked, {
    worksheetConfig: { meses1: "60" },
    tourTypes: ["CT"],
  });
});

test("composeSettings mezcla globales + sala sin residuos cruzados", () => {
  const composed = composeSettings(
    { language: "en", userName: "Ana", currency: "MXN" },
    { worksheetConfig: { meses1: "48" }, tourTypes: ["Q"] },
  );
  assert.equal(composed.language, "en");
  assert.equal(composed.userName, "Ana");
  assert.equal(composed.currency, "MXN");
  assert.deepEqual(composed.worksheetConfig, { meses1: "48" });
  assert.deepEqual(composed.tourTypes, ["Q"]);
});

test("mergeSettingsForWorkspace no reinyecta worksheetConfig plano del perfil remoto", () => {
  const merged = mergeSettingsForWorkspace(
    { language: "es", worksheetConfig: { meses1: "24" } },
    { language: "en", worksheetConfig: { meses1: "99" }, tourTypes: ["LEAK"] },
    WS_B,
  );
  assert.equal(merged.language, "es", "el idioma local (dispositivo) gana");
  assert.deepEqual(merged.worksheetConfig, { meses1: "24" });
  assert.equal(merged.tourTypes, undefined);
});

test("mergeSettingsForWorkspace usa workspaces[id] remoto solo si la sala local está vacía", () => {
  const seeded = mergeSettingsForWorkspace(
    { language: "es" },
    {
      language: "en",
      worksheetConfig: { meses1: "LEAK" },
      workspaces: {
        [WS_A]: { worksheetConfig: { meses1: "36" }, tourTypes: ["Q"] },
        [WS_B]: { worksheetConfig: { meses1: "60" } },
      },
    },
    WS_A,
  );
  assert.deepEqual(seeded.worksheetConfig, { meses1: "36" });
  assert.deepEqual(seeded.tourTypes, ["Q"]);
  assert.equal(seeded.language, "es");

  const localWins = mergeSettingsForWorkspace(
    { language: "es", worksheetConfig: { meses1: "12" } },
    {
      workspaces: {
        [WS_A]: { worksheetConfig: { meses1: "36" } },
      },
    },
    WS_A,
  );
  assert.deepEqual(localWins.worksheetConfig, { meses1: "12" });
});

test("buildProfileSettingsBody no pone worksheetConfig en la raíz", () => {
  const body = buildProfileSettingsBody(
    {
      language: "en",
      userName: "Ana",
      worksheetConfig: { meses1: "48" },
      tourTypes: ["Q"],
    },
    WS_A,
    { [WS_B]: { tourTypes: ["CT"] } },
  );
  assert.equal(body.language, "en");
  assert.equal(body.worksheetConfig, undefined);
  assert.equal(body.tourTypes, undefined);
  assert.deepEqual(body.workspaces[WS_A].worksheetConfig, { meses1: "48" });
  assert.deepEqual(body.workspaces[WS_B].tourTypes, ["CT"]);
});

test("hasWorkspaceSettings distingue blob vacío de config real", () => {
  assert.equal(hasWorkspaceSettings({}), false);
  assert.equal(hasWorkspaceSettings({ worksheetConfig: {} }), false);
  assert.equal(hasWorkspaceSettings({ worksheetConfig: { meses1: "12" } }), true);
  assert.equal(hasWorkspaceSettings({ tourTypes: ["Q"] }), true);
});
