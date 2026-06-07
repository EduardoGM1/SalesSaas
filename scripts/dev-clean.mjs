import { rmSync, existsSync } from "fs";

for (const dir of [".next"]) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`Eliminado: ${dir}`);
    }
  } catch (e) {
    console.warn(`No se pudo eliminar ${dir}: ${e.message}`);
  }
}
console.log("Listo.");
