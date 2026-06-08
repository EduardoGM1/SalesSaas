import fs from "fs";
import path from "path";

const src = path.join(import.meta.dirname, "..", "src", "stores", "db-store.ts");
const dest = path.join(import.meta.dirname, "..", "apps", "web", "src", "stores", "db-store.js");
let c = fs.readFileSync(src, "utf8");
c = c
  .replace(/^export type.*$/gm, "")
  .replace(/^interface DbState \{[\s\S]*?\n\}/m, "")
  .replace(/create<DbState>/g, "create")
  .replace(/: DbState/g, "")
  .replace(/: SaleRecord/g, "")
  .replace(/: ClientRecord/g, "")
  .replace(/: Omit<[^>]+>/g, "")
  .replace(/: Partial<[^>]+>/g, "")
  .replace(/: Record<[^>]+>/g, "")
  .replace(/: boolean/g, "")
  .replace(/: number/g, "")
  .replace(/: string/g, "")
  .replace(/ \| null/g, "")
  .replace(/ \| undefined/g, "");
fs.writeFileSync(dest, c);
console.log("db-store portado");
