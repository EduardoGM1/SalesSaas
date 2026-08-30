import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as syncController from "../controllers/sync-controller.js";

const router = Router();

router.get("/sync", rutaAutenticada((auth) => syncController.obtenerSincronizacion(auth), { wrap: "sync" }));
router.put("/sync", rutaAutenticada((auth, _req, body) => {
  const incoming = body?.data ?? body;
  return syncController.reconciliarSincronizacion(auth, incoming);
}, { cuerpo: true, wrap: "sync" }));

export default router;
