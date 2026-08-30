import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as calendarController from "../controllers/calendar-controller.js";

const router = Router();
router.get("/calendar-entries", rutaAutenticada(calendarController.listarEntradas));
router.post("/calendar-entries", rutaAutenticada(calendarController.crearEntrada, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/calendar-entries/:id", rutaAutenticada(calendarController.obtenerEntrada, { wrap: "data" }));
router.patch("/calendar-entries/:id", rutaAutenticada(calendarController.actualizarEntrada, { cuerpo: true, wrap: "data" }));
router.delete("/calendar-entries/:id", rutaAutenticada(calendarController.eliminarEntrada, { wrap: "ok" }));
export default router;
