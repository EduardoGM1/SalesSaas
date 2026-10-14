import { Router } from "express";
import { rutaAutenticada } from "../../../routes/route-utils.js";
import * as metasControlador from "../controladores/metas-controlador.js";

const router = Router();
router.get("/goals", rutaAutenticada(metasControlador.listarMetas, { wrap: "data" }));
router.put("/goals", rutaAutenticada(metasControlador.guardarMeta, { cuerpo: true, wrap: "data" }));
router.delete("/goals", rutaAutenticada(metasControlador.eliminarMeta, { wrap: "ok" }));
export default router;
