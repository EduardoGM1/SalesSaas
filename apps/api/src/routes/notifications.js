import { Router } from "express";
import { apiError, json } from "../lib/http.js";
import { requireAuth, rutaAutenticada } from "./route-utils.js";
import * as notificationsController from "../controllers/notifications-controller.js";
import { getOneSignalAppId } from "../services/push-notifications-service.js";

const router = Router();

router.get("/notifications/config", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const appId = getOneSignalAppId();
  if (!appId) return apiError(res, "OneSignal no configurado en el servidor.", 503);
  json(res, { data: notificationsController.payloadConfigPush() });
});

router.get("/notifications/status", rutaAutenticada(notificationsController.obtenerEstadoPush, { wrap: "data" }));
router.get("/notifications/push-diagnostics", rutaAutenticada(notificationsController.obtenerDiagnosticoPush, { wrap: "data" }));
router.post("/notifications/device", rutaAutenticada(notificationsController.registrarDispositivo, { cuerpo: true, wrap: "data" }));
router.post("/notifications/digest-reminders", rutaAutenticada(notificationsController.digerirRecordatorios, { wrap: "data" }));
router.post("/notifications/schedule-reminder", rutaAutenticada(notificationsController.programarRecordatorio, { cuerpo: true, wrap: "data" }));
router.post("/notifications/flush-reminders", rutaAutenticada(notificationsController.vaciarRecordatoriosPropios, { wrap: "data" }));

export default router;
