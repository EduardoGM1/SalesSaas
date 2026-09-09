/**
 * Rutas /cron: invocadas por un scheduler externo con CRON_SECRET.
 * Aceptan GET y POST (Vercel Cron usa GET; crontab/curl suele usar POST).
 */
import { Router } from "express";
import { apiError } from "../lib/http.js";
import { runService } from "./route-utils.js";
import { authorizeCron } from "../lib/cron-auth.js";
import * as notificationsController from "../controllers/notifications-controller.js";
import * as supportController from "../controllers/support-controller.js";
import * as royalHolidayController from "../controllers/royal-holiday-controller.js";

const router = Router();

/** Registra la misma tarea en GET y POST, protegida por CRON_SECRET. */
function cronRoute(path, task) {
  const handler = async (req, res) => {
    if (!authorizeCron(req)) return apiError(res, "Unauthorized", 401);
    await runService(res, task, { wrap: "data" });
  };
  router.get(path, handler);
  router.post(path, handler);
}

cronRoute("/cron/flush-reminders", () => notificationsController.vaciarRecordatoriosCron());
cronRoute("/cron/cleanup-support-attachments", () => supportController.limpiarAdjuntosSoporteCron());
cronRoute("/cron/rh-extra-dp", () => royalHolidayController.procesarExtraDpCron());

export default router;
