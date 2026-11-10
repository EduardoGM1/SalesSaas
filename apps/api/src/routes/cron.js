/**
 * Rutas /cron: invocadas por un scheduler externo con CRON_SECRET.
 * Aceptan GET y POST (Vercel Cron usa GET; crontab/curl suele usar POST).
 * flush-reminders vive en modulos/notificaciones (Tramo C).
 */
import { Router } from "express";
import { apiError } from "../lib/http.js";
import { runService } from "./route-utils.js";
import { authorizeCron } from "../lib/cron-auth.js";
import * as supportController from "../controllers/support-controller.js";
import { procesarExtraDpCron } from "../modulos/royal-holiday/fachada-node.js";
import { purgarTombstonesExpedientesCron } from "../modulos/sync/fachada-node.js";

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

cronRoute("/cron/cleanup-support-attachments", () => supportController.limpiarAdjuntosSoporteCron());
cronRoute("/cron/rh-extra-dp", () => procesarExtraDpCron());
cronRoute("/cron/purge-prospect-tombstones", () => purgarTombstonesExpedientesCron());

export default router;
