import assert from "node:assert/strict";
import test from "node:test";
import {
  permissionKeysFromFlagKeys,
  permissionKeysRespectingFlags,
} from "./roles-service.js";

test("lista explícita no reincorpora permisos viejos ni herramientas de un módulo apagado", () => {
  const saved = permissionKeysRespectingFlags(
    ["worksheet"],
    [
      "expedientes:crear",
      "herramientas:survey",
      "herramientas:survey_configurar_preguntas",
      "herramientas:worksheet",
      "workflow:cerrar",
      "expedientes:crear",
    ],
  );
  assert.deepEqual(saved, ["expedientes:crear", "herramientas:worksheet"]);
});

test("con el módulo encendido se puede guardar el permiso de configurar Survey", () => {
  const saved = permissionKeysRespectingFlags(
    ["survey"],
    ["herramientas:survey", "herramientas:survey_configurar_preguntas", "ventas:editar"],
  );
  assert.deepEqual(saved, [
    "herramientas:survey",
    "herramientas:survey_configurar_preguntas",
    "ventas:editar",
  ]);
});

test("el guardado antiguo sigue reponiendo solo el permiso principal de la herramienta", () => {
  const saved = permissionKeysFromFlagKeys(
    ["survey"],
    ["expedientes:ver_propios", "herramientas:worksheet", "herramientas:survey_configurar_preguntas"],
  );
  assert.ok(saved.includes("expedientes:ver_propios"));
  assert.ok(saved.includes("herramientas:survey"));
  assert.equal(saved.includes("herramientas:worksheet"), false);
  assert.equal(saved.includes("herramientas:survey_configurar_preguntas"), false);
});
