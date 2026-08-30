import { Router } from "express";
import { rateLimit } from "../middleware/rate-limit.js";
import { rutaAutenticada } from "./route-utils.js";
import * as workspaceController from "../controllers/workspace-controller.js";

const router = Router();

router.get("/workspace/team", rutaAutenticada(workspaceController.listarEquipo, { wrap: "data" }));
router.get("/workspace/peers", rutaAutenticada(workspaceController.listarParesSala, { wrap: "data" }));
router.get("/workspace/invite/search", rateLimit({ name: "workspace-invite-search", windowMs: 60_000, max: 40 }), rutaAutenticada(workspaceController.buscarInvitables, { wrap: "data" }));
router.get("/workspace/closers/search", rateLimit({ name: "workspace-closer-search", windowMs: 60_000, max: 40 }), rutaAutenticada(workspaceController.buscarCerradores, { wrap: "data" }));
router.get("/workspace/representantes/search", rateLimit({ name: "workspace-representante-search", windowMs: 60_000, max: 40 }), rutaAutenticada(workspaceController.buscarRepresentantes, { wrap: "data" }));
router.get("/workspace/team/prospects", rutaAutenticada(workspaceController.listarExpedientesEquipo, { wrap: "data" }));
router.post("/workspace/invite", rateLimit({ name: "workspace-invite", windowMs: 60_000, max: 20 }), rutaAutenticada(workspaceController.invitarASala, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/workspace/team/roles", rutaAutenticada(workspaceController.listarRolesAsignables, { wrap: "data" }));
router.patch("/workspace/team/members/:memberId/role", rutaAutenticada(workspaceController.asignarRolMiembro, { cuerpo: true, wrap: "data" }));
router.get("/workspace/team/members/:memberId/overrides", rutaAutenticada(workspaceController.listarOverridesMiembro, { wrap: "data" }));
router.put("/workspace/team/members/:memberId/overrides", rutaAutenticada(workspaceController.fijarOverrideMiembro, { cuerpo: true, wrap: "data" }));
router.delete("/workspace/team/members/:memberId/overrides/:clave", rutaAutenticada(workspaceController.quitarOverrideMiembro, { wrap: "data" }));
router.get("/workspace/team/delegacion/techo", rutaAutenticada(workspaceController.listarTechoDelegacionSala, { wrap: "data" }));
router.get("/workspace/team/delegacion", rutaAutenticada(workspaceController.listarDelegacionSala, { wrap: "data" }));
router.put("/workspace/team/delegacion", rutaAutenticada(workspaceController.reemplazarDelegacionSala, { cuerpo: true, wrap: "data" }));
router.post("/workspace/leave", rutaAutenticada(workspaceController.salirDeSala, { wrap: "data" }));

export default router;
