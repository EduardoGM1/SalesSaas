import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "apps/web/src");
const lazyPages = fs.readFileSync(path.join(root, "routes/lazy-pages.js"), "utf8");
const re = /namedLazy\(\(\) => import\("([^"]+)"\), "([^"]+)"\)/g;
const bad = [];

for (const match of lazyPages.matchAll(re)) {
  const [, mod, name] = match;
  const rel = mod.replace("@/", "");
  const candidates = [rel, `${rel}.js`, `${rel}.jsx`, `${rel}.ts`, `${rel}.tsx`];
  const file = candidates.map((c) => path.join(root, c)).find((p) => fs.existsSync(p));
  if (!file) {
    bad.push({ name, mod, reason: "file missing" });
    continue;
  }
  const src = fs.readFileSync(file, "utf8");
  const exp = new RegExp(`export\\s+(?:function|const|class)\\s+${name}\\b`);
  if (!exp.test(src)) {
    const found = [...src.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)].map((x) => x[1]);
    bad.push({ name, mod, file: path.relative(root, file), reason: "export missing", found });
  }
}

console.log(bad.length ? JSON.stringify(bad, null, 2) : "OK: all namedLazy exports match");
