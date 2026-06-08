/**
 * Copia UI legacy (Next) → apps/web para Vite + React Router.
 * Convierte imports next/* y @/ a rutas del nuevo frontend.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LEGACY = path.join(ROOT, "src");
const WEB = path.join(ROOT, "apps", "web", "src");

const COPY_DIRS = [
  ["components", "components"],
  ["stores", "stores"],
  ["hooks", "hooks"],
  ["lib", "lib"],
];

const COPY_FILES = [
  ["src/app/html-theme.css", "styles/html-theme.css"],
  ["src/app/saas-overrides.css", "styles/saas-overrides.css"],
  ["src/app/globals.css", "styles/globals.css"],
];

function transform(code, file) {
  return code
    .replace(/^"use client";\r?\n/gm, "")
    .replace(/^'use client';\r?\n/gm, "")
    .replace(/from "next\/link"/g, 'from "react-router-dom"')
    .replace(/from 'next\/link'/g, "from 'react-router-dom'")
    .replace(/from "next\/navigation"/g, 'from "react-router-dom"')
    .replace(/from 'next\/navigation'/g, "from 'react-router-dom'")
    .replace(/from "next\/image"/g, 'from "@/components/ui/safe-image.jsx"')
    .replace(/import Image from "next\/image";?\n/g, 'import { SafeImage as Image } from "@/components/ui/safe-image.jsx";\n')
    .replace(/from "@\/([^"]+)"/g, 'from "@/$1"')
    .replace(/href=\{([^}]+)\}/g, "to={$1}")
    .replace(/href="([^"]+)"/g, 'to="$1"')
    .replace(/href='([^']+)'/g, "to='$1'")
    .replace(/useRouter\(\)/g, "useNavigate()")
    .replace(/const router = useNavigate\(\)/g, "const navigate = useNavigate()")
    .replace(/router\.push\(/g, "navigate(")
    .replace(/router\.replace\(/g, "navigate(")
    .replace(/import \{([^}]*?)useRouter([^}]*)\} from "react-router-dom"/g, (m, a, b) => {
      const parts = `${a}useNavigate${b}`.replace(/,\s*,/g, ",").replace(/^,\s*/, "").replace(/\s*,$/, "");
      return `import { ${parts} } from "react-router-dom"`;
    })
    .replace(/: React\.ReactNode/g, "")
    .replace(/: React\.FormEvent/g, "")
    .replace(/ as const/g, "")
    .replace(/\.tsx/g, ".jsx")
    .replace(/\.ts"/g, '.js"');
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const rel = path.relative(srcDir, src);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(name)) continue;
    const outName = name.replace(/\.tsx$/, ".jsx").replace(/\.ts$/, ".js");
    const outPath = path.join(path.dirname(dest), outName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const raw = fs.readFileSync(src, "utf8");
    fs.writeFileSync(outPath, transform(raw, outPath), "utf8");
    console.log(`  ${path.join(path.relative(ROOT, srcDir), name)}`);
  }
}

fs.rmSync(WEB, { recursive: true, force: true });
fs.mkdirSync(WEB, { recursive: true });

console.log("Copiando UI a apps/web/src...");
for (const [from, to] of COPY_DIRS) {
  console.log(`→ ${to}/`);
  copyDir(path.join(LEGACY, from), path.join(WEB, to));
}
for (const [from, to] of COPY_FILES) {
  const actual = path.join(ROOT, from);
  const dest = path.join(WEB, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(actual, dest);
  console.log(`  ${from}`);
}

console.log("Listo:", WEB);
