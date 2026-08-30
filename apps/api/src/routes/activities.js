import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as activitiesController from "../controllers/activities-controller.js";

const router = Router();
router.get("/activities", rutaAutenticada(activitiesController.listarActividades));
router.post("/activities", rutaAutenticada(activitiesController.crearActividad, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/activities/:id", rutaAutenticada(activitiesController.obtenerActividad, { wrap: "data" }));
router.patch("/activities/:id", rutaAutenticada(activitiesController.actualizarActividad, { cuerpo: true, wrap: "data" }));
router.delete("/activities/:id", rutaAutenticada(activitiesController.eliminarActividad, { wrap: "ok" }));
export default router;
