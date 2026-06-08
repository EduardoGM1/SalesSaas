import fs from "fs";
import path from "path";

const ROOT = path.join(import.meta.dirname, "..", "apps", "web", "src");

function stripTs(code) {
  return code
    .replace(/useState<[^>]+>/g, "useState")
    .replace(/useRef<[^>]+>/g, "useRef")
    .replace(/useMemo<[^>]+>/g, "useMemo")
    .replace(/useActionState<[^>]+>/g, "useActionState")
    .replace(/\}\s*:\s*\{[^}]*\}/g, "}")
    .replace(/\)\s*:\s*[A-Za-z_$][\w$.<>, |&\[\]?]*/g, ")")
    .replace(/: [A-Za-z_$][\w$.<>, |&\[\]?]*(?=\s*[=,)\{;])/g, "")
    .replace(/interface [^{]+\{[^}]*\}\s*/g, "")
    .replace(/type [^=;]+=\s*[^;]+;\s*/g, "")
    .replace(/ satisfies [^;\n]+/g, "")
    .replace(/import type [^;]+;\s*/g, "")
    .replace(/<[^>]+>\(\)/g, "()");
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(jsx|js)$/.test(name)) continue;
    const raw = fs.readFileSync(full, "utf8");
    const next = stripTs(raw);
    if (next !== raw) fs.writeFileSync(full, next);
  }
}

walk(ROOT);
console.log("fix-web-ts-syntax OK");
