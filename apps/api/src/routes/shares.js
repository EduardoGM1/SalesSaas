import { Router } from "express";
import { requireAuth, rutaAutenticada, parseJsonBody, runService } from "./route-utils.js";
import * as sharesController from "../controllers/shares-controller.js";

const router = Router();

router.get("/shares/received", rutaAutenticada(sharesController.listarRecibidos, { wrap: "data" }));
router.get("/prospects/:id/shares", rutaAutenticada(sharesController.listarSharesExpediente, { wrap: "data" }));
router.post("/prospects/:id/shares", rutaAutenticada(sharesController.crearShare, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.post("/prospects/:id/share-invites", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res) || {};
  await runService(res, () => sharesController.crearInvitacionShare(a, req, body), { wrap: "data", successStatus: 201 });
});
router.post("/share-invites/:token/redeem", rutaAutenticada(sharesController.redimirInvitacion, { wrap: "data" }));
router.get("/shares/workspace", rutaAutenticada(sharesController.listarFijadosWorkspace, { wrap: "data" }));
router.post("/shares/:id/add-to-workspace", rutaAutenticada(sharesController.agregarShareAWorkspace, { wrap: "data" }));
router.get("/prospects/:id/transfer-targets", rutaAutenticada(sharesController.listarDestinosTransferencia, { wrap: "data" }));
router.get("/prospects/:id/share-contacts", rutaAutenticada(sharesController.listarContactosCompartibles, { wrap: "data" }));
router.post("/prospects/:id/duplicate", rutaAutenticada(sharesController.duplicarExpediente, { wrap: "data", successStatus: 201 }));
router.post("/prospects/:id/transfer", rutaAutenticada(sharesController.transferirExpediente, { cuerpo: true, wrap: "data" }));
router.post("/shares/:id/permission-requests", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res) || {};
  await runService(res, () => sharesController.pedirUpgradePermiso(a, req, body), { wrap: "data", successStatus: 201 });
});
router.post("/share-permission-requests/:id/decide", rutaAutenticada(sharesController.decidirUpgradePermiso, { cuerpo: true, wrap: "data" }));
router.patch("/shares/:id", rutaAutenticada(sharesController.actualizarPermisoShare, { cuerpo: true, wrap: "data" }));
router.delete("/shares/:id", rutaAutenticada(sharesController.eliminarShare, { wrap: "ok" }));
router.get("/shared-prospects/:id", rutaAutenticada(sharesController.obtenerExpedienteCompartido, { wrap: "data" }));
router.get("/shared-prospects/:id/tools/:tool", rutaAutenticada(sharesController.obtenerHerramientaCompartida, { wrap: "data" }));
router.put("/shared-prospects/:id/tools/:tool", rutaAutenticada(sharesController.guardarHerramientaCompartida, { cuerpo: true, wrap: "data" }));
router.patch("/shared-prospects/:id", rutaAutenticada(sharesController.actualizarExpedienteCompartido, { cuerpo: true, wrap: "data" }));

export default router;
