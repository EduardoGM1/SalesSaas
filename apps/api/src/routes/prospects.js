import { Router } from "express";
import { rutaAutenticada } from "./route-utils.js";
import * as prospectsController from "../controllers/prospects-controller.js";
import * as workflowController from "../controllers/workflow-controller.js";
import * as chatController from "../controllers/chat-controller.js";

const router = Router();

router.get("/prospects", rutaAutenticada((auth, req) => prospectsController.listarExpedientes(auth, req.query)));
router.get("/prospects/active", rutaAutenticada(workflowController.listarExpedientesActivos, { wrap: "data" }));
router.post("/prospects", rutaAutenticada((auth, _req, body) => prospectsController.crearExpediente(auth, body), { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/prospects/:id", rutaAutenticada((auth, req) => prospectsController.obtenerExpediente(auth, req.params.id), { wrap: "data" }));
router.patch("/prospects/:id", rutaAutenticada((auth, req, body) => prospectsController.actualizarExpediente(auth, req.params.id, body), { cuerpo: true, wrap: "data" }));
router.delete("/prospects/:id", rutaAutenticada((auth, req) => prospectsController.eliminarExpediente(auth, req.params.id), { wrap: "ok" }));

router.get("/workflow/inbox", rutaAutenticada(workflowController.listarExpedientesActivos, { wrap: "data" }));
router.get("/prospects/:id/participants", rutaAutenticada(workflowController.obtenerParticipantes, { wrap: "data" }));
router.get("/prospects/:id/workflow", rutaAutenticada(workflowController.obtenerParticipantes, { wrap: "data" }));
router.get("/prospects/:id/workflow/timeline", rutaAutenticada(workflowController.listarTimeline, { wrap: "data" }));
router.post("/prospects/:id/workflow/advance", rutaAutenticada(workflowController.avanzarWorkflow, { wrap: "data" }));
router.post("/prospects/:id/workflow/send-review", rutaAutenticada(workflowController.enviarARevision, { wrap: "data" }));
router.post("/prospects/:id/workflow/review", rutaAutenticada(workflowController.revisarWorkflow, { wrap: "data" }));
router.post("/prospects/:id/workflow/assign-closer", rutaAutenticada(workflowController.asignarCerrador, { cuerpo: true, wrap: "data" }));
router.post("/prospects/:id/participants/assign-closer", rutaAutenticada(workflowController.asignarCerrador, { cuerpo: true, wrap: "data" }));
router.post("/prospects/:id/participants/assign-representante", rutaAutenticada(workflowController.asignarRepresentante, { cuerpo: true, wrap: "data" }));
router.post("/prospects/:id/chat", rutaAutenticada(chatController.asegurarConversacionExpediente, { wrap: "data", successStatus: 201 }));

export default router;
