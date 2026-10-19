import { Router } from "express";
import { rutaAutenticada } from "../../../routes/route-utils.js";
import * as remindersController from "../controladores/recordatorios-controlador.js";

const router = Router();
router.get("/reminders", rutaAutenticada(remindersController.listarRecordatorios, { wrap: "sync" }));
export default router;
