import { Router } from "express";
import { apiError } from "../lib/http.js";
import { runService } from "./route-utils.js";
import { authorizeCron } from "../lib/cron-auth.js";
import * as notificationsController from "../controllers/notifications-controller.js";
import * as supportController from "../controllers/support-controller.js";
import * as royalHolidayController from "../controllers/royal-holiday-controller.js";

const router = Router();

router.post("/cron/flush-reminders", async (req, res) => {
  if (!authorizeCron(req)) return apiError(res, "Unauthorized", 401);
  await runService(res, () => notificationsController.vaciarRecordatoriosCron(), { wrap: "data" });
});
router.get("/cron/flush-reminders", async (req, res) => {
  if (!authorizeCron(req)) return apiError(res, "Unauthorized", 401);
  await runService(res, () => notificationsController.vaciarRecordatoriosCron(), { wrap: "data" });
});
router.post("/cron/cleanup-support-attachments", async (req, res) => {
  if (!authorizeCron(req)) return apiError(res, "Unauthorized", 401);
  await runService(res, () => supportController.limpiarAdjuntosSoporteCron(), { wrap: "data" });
});
router.get("/cron/cleanup-support-attachments", async (req, res) => {
  if (!authorizeCron(req)) return apiError(res, "Unauthorized", 401);
  await runService(res, () => supportController.limpiarAdjuntosSoporteCron(), { wrap: "data" });
});
router.post("/cron/rh-extra-dp", async (req, res) => {
  if (!authorizeCron(req)) return apiError(res, "Unauthorized", 401);
  await runService(res, () => royalHolidayController.procesarExtraDpCron(), { wrap: "data" });
});
router.get("/cron/rh-extra-dp", async (req, res) => {
  if (!authorizeCron(req)) return apiError(res, "Unauthorized", 401);
  await runService(res, () => royalHolidayController.procesarExtraDpCron(), { wrap: "data" });
});

export default router;
