/**
 * Arranque producción: API + preview estático del SPA.
 * Requiere: npm run build -w @salesapp/web
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = process.env.API_PORT ?? "4000";
const webPort = process.env.WEB_PORT ?? "4173";

const api = spawn("npm", ["run", "start", "-w", "@salesapp/api"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, API_PORT: apiPort },
});

const web = spawn("npm", ["run", "preview", "-w", "@salesapp/web", "--", "--host", "0.0.0.0", "--port", webPort], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

function shutdown() {
  api.kill();
  web.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Producción local: API :${apiPort}, Web :${webPort}`);
