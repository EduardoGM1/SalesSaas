/**
 * Solo /cron/flush-reminders. Otras tareas cron siguen en routes/cron.js.
 */
import { Router } from "express";
import { apiError } from "../../../lib/http.js";
import { runService } from "../../../routes/route-utils.js";
import { authorizeCron } from "../../../lib/cron-auth.js";
import * as notificationsController from "../controladores/notificaciones-controlador.js";

const router = Router();

function cronRoute(path, task) {
  const handler = async (req, res) => {
    if (!authorizeCron(req)) return apiError(res, "Unauthorized", 401);
    await runService(res, task, { wrap: "data" });
  };
  router.get(path, handler);
  router.post(path, handler);
}

cronRoute("/cron/flush-reminders", () => notificationsController.vaciarRecordatoriosCron());

export default router;
