/**
 * Caracterización purge local Etapa 2 (merge + sync-provider).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

test("sync-merge define visibilityPurge y prune de huérfanos", () => {
  const merge = readFileSync(resolve(HERE, "sync-merge.js"), "utf8");
  assert.match(merge, /visibilityPurge/);
  assert.match(merge, /pruneDatabaseOrphans/);
  assert.match(merge, /localClientNeedsRetain/);
});

test("sync-provider activa visibilityPurge en merge inbound", () => {
  const provider = readFileSync(resolve(HERE, "../ui/sync-provider.jsx"), "utf8");
  const hits = (provider.match(/visibilityPurge:\s*true/g) || []).length;
  assert.ok(hits >= 2, "refreshInbound y reconcile partial deben purgar");
});
