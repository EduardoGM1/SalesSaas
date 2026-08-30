import { Router } from "express";
import { rateLimit } from "../middleware/rate-limit.js";
import { rutaAutenticada } from "./route-utils.js";
import * as networkController from "../controllers/network-controller.js";

const router = Router();
router.get("/network/users/search", rateLimit({ name: "network-user-search", windowMs: 60_000, max: 30 }), rutaAutenticada(networkController.buscarUsuarios, { wrap: "data" }));
router.get("/network/connections", rutaAutenticada(networkController.listarConexiones, { wrap: "data" }));
router.get("/network/contacts/:contactId", rutaAutenticada(networkController.obtenerContacto, { wrap: "data" }));
router.get("/network/contacts/:contactId/shares", rutaAutenticada(networkController.listarSharesConContacto, { wrap: "data" }));
router.post("/network/connections", rutaAutenticada(networkController.enviarSolicitudConexion, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.patch("/network/connections/:id", rutaAutenticada(networkController.actualizarEstadoConexion, { cuerpo: true, wrap: "data" }));
router.delete("/network/connections/:id", rutaAutenticada(networkController.eliminarConexion, { wrap: "ok" }));
export default router;
