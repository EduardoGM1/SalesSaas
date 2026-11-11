/**
 * Etapa 3 — UX defensiva de visibilidad (caracterización ligera).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("ficha local valida acceso en sala vía GET", () => {
  const src = readFileSync(resolve(WEB, "modulos/expediente/ui/client-detail.jsx"), "utf8");
  assert.match(src, /mustVerifySala/);
  assert.match(src, /localFetchState === "denied"/);
  assert.match(src, /status === 403 \|\| status === 404/);
  assert.match(src, /exp\.noAccessTitle/);
});

test("lista de clientes empty state en sala", () => {
  const src = readFileSync(resolve(WEB, "modulos/expediente/ui/clients-page.jsx"), "utf8");
  assert.match(src, /isSalaWorkspace \? t\("clients\.emptySala"\)/);
});

test("claves i18n sin acceso expediente", () => {
  const catalog = readFileSync(resolve(WEB, "lib/i18n-catalog.js"), "utf8");
  assert.match(catalog, /"exp\.noAccessTitle"/);
  assert.match(catalog, /"exp\.noAccessBody"/);
  const i18n = readFileSync(resolve(WEB, "lib/i18n.js"), "utf8");
  assert.match(i18n, /"clients\.emptySala"/);
});
