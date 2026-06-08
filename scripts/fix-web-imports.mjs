import fs from "fs";
import path from "path";

const ROOT = path.join(import.meta.dirname, "..", "apps", "web", "src");

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!name.endsWith(".jsx") && !name.endsWith(".js")) continue;
    let code = fs.readFileSync(full, "utf8");
    let changed = false;

    if (code.includes('import Link from "react-router-dom"')) {
      code = code.replace('import Link from "react-router-dom"', 'import { Link } from "react-router-dom"');
      changed = true;
    }
    if (code.includes("usePathname")) {
      code = code.replace(/import \{([^}]*?)usePathname([^}]*)\} from "react-router-dom"/g, (m, a, b) => {
        let parts = `${a}useLocation${b}`.replace(/usePathname,?/g, "").replace(/,\s*,/g, ",").trim();
        if (!parts.includes("useLocation")) parts = parts ? `${parts}, useLocation` : "useLocation";
        parts = parts.replace(/^,\s*/, "").replace(/,\s*$/, "");
        return `import { ${parts} } from "react-router-dom"`;
      });
      code = code.replace(/const pathname = usePathname\(\)/g, "const { pathname } = useLocation()");
      changed = true;
    }
    if (code.includes('import { redirect } from "react-router-dom"')) {
      code = code.replace('import { redirect } from "react-router-dom"', "");
      changed = true;
    }

    if (changed) fs.writeFileSync(full, code);
  }
}

walk(ROOT);
console.log("fix-web-imports OK");
