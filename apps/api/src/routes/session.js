import { Router } from "express";
import { json, apiError } from "../lib/http.js";
import { ServiceError } from "../lib/service-error.js";
import { requireAuth, rutaAutenticada } from "./route-utils.js";
import * as sessionController from "../controllers/session-controller.js";

const router = Router();

router.get("/auth/session", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  try {
    const payload = await sessionController.obtenerSesion(a);
    json(res, payload);
  } catch (err) {
    if (err instanceof ServiceError) return apiError(res, err.message, err.status, err.code);
    throw err;
  }
});

router.post("/auth/workspace", rutaAutenticada(sessionController.cambiarWorkspace, { cuerpo: true }));
router.get("/auth/realtime-session", rutaAutenticada(sessionController.obtenerSesionRealtime, { wrap: "data" }));

export default router;
