/**
 * Copia variables de .env.local al proyecto Vercel sales-app
 * (production + preview). Ajusta WEB_ORIGIN al dominio de sales-app.
 */
import { readFileSync } from "fs";
import { spawn } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const PROJECT = "sales-app";
const WEB_ORIGIN = "https://sales-app-nine-gamma.vercel.app";

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ONESIGNAL_APP_ID",
  "ONESIGNAL_REST_API_KEY",
  "VITE_ONESIGNAL_APP_ID",
  "ONESIGNAL_SAFARI_WEB_ID",
  "VITE_ONESIGNAL_SAFARI_WEB_ID",
  "WEB_ORIGIN",
];

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function run(cmd, args, { input } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      stdio: input ? ["pipe", "pipe", "pipe"] : ["inherit", "pipe", "pipe"],
      shell: true,
      cwd: resolve(__dir, ".."),
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d; });
    child.stderr?.on("data", (d) => { stderr += d; });
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.join(" ")} → ${code}\n${stderr || stdout}`));
    });
  });
}

async function linkProject() {
  await run("npx", ["vercel", "link", "--yes", "--project", PROJECT]);
}

async function addEnvVar(name, value, environment) {
  try {
    await run("npx", ["vercel", "env", "add", name, environment, "--yes", "--force"], {
      input: `${value}\n`,
    });
    console.log(`  ✓ ${name} (${environment})`);
  } catch (err) {
    const msg = String(err.message || err);
    if (msg.includes("already exists") || msg.includes("Already exists")) {
      console.log(`  · ${name} (${environment}) ya existía, actualizado con --force`);
      return;
    }
    throw err;
  }
}

async function main() {
  const local = loadEnvLocal();
  local.WEB_ORIGIN = WEB_ORIGIN;

  const missing = KEYS.filter((k) => k !== "WEB_ORIGIN" && !local[k]);
  if (missing.length) {
    console.error("Faltan en .env.local:", missing.join(", "));
    process.exit(1);
  }

  console.log(`Enlazando proyecto Vercel: ${PROJECT}…`);
  await linkProject();

  console.log("\nAñadiendo variables (production + preview)…");
  for (const key of KEYS) {
    const value = local[key] ?? WEB_ORIGIN;
    for (const env of ["production", "preview"]) {
      await addEnvVar(key, value, env);
    }
  }

  console.log("\n✓ Variables configuradas en sales-app.");
  console.log(`  WEB_ORIGIN = ${WEB_ORIGIN}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
