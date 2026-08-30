import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as toolsController from "../controllers/tools-controller.js";

const router = Router();
router.get("/tool-calculations/:id", rutaAutenticada(toolsController.obtenerCalculoPorId, { wrap: "data" }));
router.get("/tool-calculations", rutaAutenticada(toolsController.obtenerCalculo, { wrap: "data" }));
router.put("/tool-calculations", rutaAutenticada(toolsController.guardarCalculo, { cuerpo: true, wrap: "data" }));
router.get("/survey/questions-config", rutaAutenticada(toolsController.obtenerConfigPreguntas, { wrap: "data" }));
router.put("/survey/questions-config", rutaAutenticada(toolsController.guardarConfigPreguntas, { cuerpo: true, wrap: "data" }));
router.delete("/tool-calculations", rutaAutenticada(toolsController.eliminarCalculo, { wrap: "ok" }));
export default router;
