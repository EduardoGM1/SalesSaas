/**
 * Provision A+B, seed-collab-share-only, assert RO (B fuera del WS, share real), purga.
 * Sin apply de 0098. Uso: node scripts/architecture/smoke-seed-collab-share-only-qa.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "../..");
const HELPER = resolve(__dir, "qa-geo-fx-ephemeral.py");
const stamp = Date.now().toString(36);
const EMAIL_A = `qa-share-only-a-${stamp}@saletse-test.com`;
const EMAIL_B = `qa-share-only-b-${stamp}@saletse-test.com`;
const PASS = randomBytes(18).toString("base64url");
const PROSPECT = randomUUID();

const report = { steps: [], leftoverA: {}, leftoverB: {} };

function step(name, ok, detail = "") {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function runHelper(args) {
  const r = spawnSync("python", [HELPER, ...args], { cwd: root, encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`helper ${args[0]}: ${(r.stderr || r.stdout || "").slice(0, 800)}`);
  const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
  return line ? JSON.parse(line) : {};
}

try {
  const a = runHelper(["provision", EMAIL_A, PASS, `QA ShareOnly A ${stamp}`]);
  step("provision A", Boolean(a.uid), String(a.uid || "").slice(0, 8));
  const b = runHelper(["provision", EMAIL_B, PASS, `QA ShareOnly B ${stamp}`]);
  step("provision B", Boolean(b.uid), String(b.uid || "").slice(0, 8));

  const seedP = runHelper(["seed-prospect", EMAIL_A, PROSPECT, "ShareOnlyQa"]);
  step("seed-prospect A", Boolean(seedP.prospect_id), String(seedP.workspace_id || "").slice(0, 8));

  const share = runHelper(["seed-collab-share-only", EMAIL_A, EMAIL_B, PROSPECT, "edit"]);
  step(
    "seed-collab-share-only",
    Boolean(share.share_id) && share.guest === false,
    `share=${String(share.share_id || "").slice(0, 8)} guest=${share.guest}`,
  );

  const assertion = runHelper(["assert-collab-share-only", EMAIL_A, EMAIL_B, PROSPECT]);
  step(
    "assert RO: share && !guest_miembro",
    assertion.ok === true,
    JSON.stringify(assertion),
  );
} catch (err) {
  step("smoke share-only", false, err instanceof Error ? err.message : String(err));
} finally {
  try {
    report.leftoverA = runHelper(["purge", EMAIL_A]);
    report.leftoverB = runHelper(["purge", EMAIL_B]);
    const zero = (c) =>
      (c.profiles || 0) === 0 &&
      (c.prospects || 0) === 0 &&
      (c.shares || 0) === 0 &&
      (c.share_invites || 0) === 0 &&
      (c.connections || 0) === 0 &&
      (c.workspace_miembros || 0) === 0 &&
      (c.ws_personal || 0) === 0;
    step("purga A a 0 (incl. share_invites)", zero(report.leftoverA), JSON.stringify(report.leftoverA));
    step("purga B a 0 (incl. share_invites)", zero(report.leftoverB), JSON.stringify(report.leftoverB));
  } catch (err) {
    step("purga", false, err instanceof Error ? err.message : String(err));
  }
}

console.log("\n=== RESUMEN SHARE-ONLY ===\n" + JSON.stringify(report, null, 2));
process.exit(report.steps.some((s) => !s.ok) ? 1 : 0);
