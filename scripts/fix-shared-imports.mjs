import fs from "fs";
import path from "path";

const ROOT = path.join(import.meta.dirname, "..", "packages", "shared", "src");

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!name.endsWith(".js")) continue;
    let code = fs.readFileSync(full, "utf8");
    const relDir = path.relative(ROOT, dir).replace(/\\/g, "/");
    const depth = relDir ? relDir.split("/").length : 0;
    const prefix = depth ? "../".repeat(depth) : "./";
    code = code.replace(/from "@\/lib\/([^"]+)"/g, (_, p) => `from "${prefix}${p}.js"`);
    code = code.replace(/from '@\/lib\/([^']+)'/g, (_, p) => `from '${prefix}${p}.js'`);
    code = code.replace(/from "\.\/([^"]+)"/g, (m, p) => (p.endsWith(".js") ? m : `from "./${p}.js"`));
    code = code.replace(/from '\.\/([^']+)'/g, (m, p) => (p.endsWith(".js") ? m : `from './${p}.js'`));
    code = code.replace(/from "\.\.\/([^"]+)"/g, (m, p) => (p.endsWith(".js") ? m : `from "../${p}.js"`));
    fs.writeFileSync(full, code);
  }
}

walk(ROOT);
console.log("Imports corregidos en packages/shared/src");
