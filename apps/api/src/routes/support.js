import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as supportController from "../controllers/support-controller.js";

const router = Router();
router.post("/support/requests", rutaAutenticada(supportController.crearSolicitudSoporte, { cuerpo: true, wrap: "data", successStatus: 201 }));
export default router;
