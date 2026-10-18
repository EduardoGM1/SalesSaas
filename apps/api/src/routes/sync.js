import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as syncController from "../controllers/sync-controller.js";

const router = Router();

router.get("/sync", rutaAutenticada((auth) => syncController.obtenerSincronizacion(auth), { wrap: "sync" }));
router.put("/sync", rutaAutenticada(async (auth, req, body) => {
  const incoming = body?.data ?? body;
  const protocol = String(req.get("x-sync-protocol") || "1").trim();
  const result = await syncController.reconciliarSincronizacion(auth, incoming, { protocol });
  return { ...result, syncedAt: new Date().toISOString() };
}, { cuerpo: true }));

export default router;
