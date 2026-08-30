import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as goalsController from "../controllers/goals-controller.js";

const router = Router();
router.get("/goals", rutaAutenticada(goalsController.listarMetas, { wrap: "data" }));
router.put("/goals", rutaAutenticada(goalsController.guardarMeta, { cuerpo: true, wrap: "data" }));
router.delete("/goals", rutaAutenticada(goalsController.eliminarMeta, { wrap: "ok" }));
export default router;
