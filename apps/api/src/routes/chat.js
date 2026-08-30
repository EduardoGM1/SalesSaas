import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as chatController from "../controllers/chat-controller.js";

const router = Router();
router.get("/chat/conversations", rutaAutenticada(chatController.listarConversacionesExpediente, { wrap: "data" }));
router.get("/chat/conversations/:id", rutaAutenticada(chatController.obtenerConversacion, { wrap: "data" }));
router.get("/chat/conversations/:id/messages", rutaAutenticada(chatController.listarMensajesConversacion, { wrap: "data" }));
router.post("/chat/conversations/:id/messages", rutaAutenticada(chatController.enviarMensajeConversacion, { cuerpo: true, wrap: "data", successStatus: 201 }));
export default router;
