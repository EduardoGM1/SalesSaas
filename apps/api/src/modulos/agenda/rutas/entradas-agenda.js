import { Router } from "express";
import { rutaAutenticada } from "../../../routes/route-utils.js";
import * as controladorEntradas from "../controladores/entradas-agenda-controlador.js";

const router = Router();
router.get("/calendar-entries", rutaAutenticada(controladorEntradas.listarEntradas));
router.post("/calendar-entries", rutaAutenticada(controladorEntradas.crearEntrada, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/calendar-entries/:id", rutaAutenticada(controladorEntradas.obtenerEntrada, { wrap: "data" }));
router.patch("/calendar-entries/:id", rutaAutenticada(controladorEntradas.actualizarEntrada, { cuerpo: true, wrap: "data" }));
router.delete("/calendar-entries/:id", rutaAutenticada(controladorEntradas.eliminarEntrada, { wrap: "ok" }));
export default router;
