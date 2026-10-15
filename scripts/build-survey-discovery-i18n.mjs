/**
 * Wrapper — generador canónico en modulos/survey/i18n/build-catalogo-discovery.mjs
 * Uso: node scripts/build-survey-discovery-i18n.mjs
 */
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await import(
  pathToFileURL(resolve(root, "apps/web/src/modulos/survey/i18n/build-catalogo-discovery.mjs")).href
);
