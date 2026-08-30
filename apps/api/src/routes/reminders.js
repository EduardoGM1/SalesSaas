import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as remindersController from "../controllers/reminders-controller.js";

const router = Router();
router.get("/reminders", rutaAutenticada(remindersController.listarRecordatorios, { wrap: "sync" }));
export default router;
