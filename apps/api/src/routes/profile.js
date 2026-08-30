import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as profileController from "../controllers/profile-controller.js";

const router = Router();
router.get("/profile", rutaAutenticada(profileController.obtenerPerfil, { wrap: "data" }));
router.patch("/profile", rutaAutenticada(profileController.actualizarPerfil, { cuerpo: true, wrap: "data" }));
router.post("/profile/presence/offline", rutaAutenticada(profileController.marcarPresenciaOffline, { wrap: "data" }));
export default router;
