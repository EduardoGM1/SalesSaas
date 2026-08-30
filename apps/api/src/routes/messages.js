import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as messagesController from "../controllers/messages-controller.js";

const router = Router();
router.get("/messages/conversations", rutaAutenticada(messagesController.listarConversaciones, { wrap: "data" }));
router.get("/messages/unread-count", rutaAutenticada(messagesController.contarNoLeidos, { wrap: "data" }));
router.get("/messages", rutaAutenticada(messagesController.listarMensajesCon, { wrap: "data" }));
router.post("/messages", rutaAutenticada(messagesController.enviarMensaje, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.patch("/messages/read", rutaAutenticada(messagesController.marcarHiloLeido, { wrap: "ok" }));
export default router;
