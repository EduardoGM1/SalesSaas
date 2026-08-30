import { Router } from "express";
import { apiError } from "../lib/http.js";
import { requireAuth, rutaAutenticada, parseJsonBody, runService } from "./route-utils.js";
import * as rh from "../controllers/royal-holiday-controller.js";

const router = Router();

router.get("/royal-holiday/:empresaId/catalogo", rutaAutenticada(rh.obtenerCatalogo, { wrap: "data" }));
router.post("/royal-holiday/:empresaId/preview", rutaAutenticada(rh.previsualizarCalculo, { cuerpo: true, wrap: "data" }));
router.post("/royal-holiday/:empresaId/ventas", rutaAutenticada(rh.guardarVentaRh, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/royal-holiday/:empresaId/comisiones-movimientos", rutaAutenticada(rh.listarMovimientosComision, { wrap: "data" }));
router.get("/royal-holiday/:empresaId/dias-descanso", rutaAutenticada(rh.listarDiasDescanso, { wrap: "data" }));
router.post("/royal-holiday/:empresaId/dias-descanso", rutaAutenticada(rh.guardarDiaDescanso, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.delete("/royal-holiday/:empresaId/dias-descanso/:id", rutaAutenticada(rh.eliminarDiaDescanso, { wrap: "data" }));
router.get("/royal-holiday/:empresaId/ops-config", rutaAutenticada(rh.obtenerOpsConfig, { wrap: "data" }));
router.put("/royal-holiday/:empresaId/ops-config", rutaAutenticada(rh.guardarOpsConfig, { cuerpo: true, wrap: "data" }));
router.get("/royal-holiday/:empresaId/money-box-config", rutaAutenticada(rh.obtenerMoneyBoxConfig, { wrap: "data" }));
router.put("/royal-holiday/:empresaId/money-box-config", rutaAutenticada(rh.guardarMoneyBoxConfig, { cuerpo: true, wrap: "data" }));
router.get("/royal-holiday/:empresaId/premanifiesto", rutaAutenticada(rh.listarPremanifiesto, { wrap: "data" }));

router.get("/royal-holiday/:empresaId/premanifiesto/dia", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const workspaceId = req.query?.workspaceId ? String(req.query.workspaceId) : undefined;
  if (!req.query.fecha || !workspaceId) {
    return apiError(res, 400, "fecha y workspaceId requeridos.");
  }
  await runService(res, () => rh.obtenerPremanifiestoDia(a, req), { wrap: "data" });
});

router.get("/royal-holiday/:empresaId/premanifiesto/cupos", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const workspaceId = req.query?.workspaceId ? String(req.query.workspaceId) : undefined;
  if (!req.query.fecha || !workspaceId) {
    return apiError(res, 400, "fecha y workspaceId requeridos.");
  }
  await runService(res, () => rh.listarCuposPremanifiesto(a, req), { wrap: "data" });
});

router.post("/royal-holiday/:empresaId/premanifiesto/registrar", rutaAutenticada(rh.registrarPremanifiesto, { cuerpo: true, wrap: "data", successStatus: 201 }));

router.post("/royal-holiday/:empresaId/premanifiesto/:rowId/tomar-caso", async (req, res) => {
  const a = await requireAuth(req, res);
  if (!a) return;
  const body = parseJsonBody(req, res) || {};
  await runService(res, () => rh.tomarCasoPremanifiesto(a, req, body), { wrap: "data" });
});

router.patch("/royal-holiday/:empresaId/premanifiesto/:rowId", rutaAutenticada(rh.actualizarPremanifiesto, { cuerpo: true, wrap: "data" }));
router.post("/royal-holiday/:empresaId/premanifiesto", rutaAutenticada(rh.upsertPremanifiesto, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/royal-holiday/:empresaId/linea/asignacion", rutaAutenticada(rh.listarAsignacionLinea, { wrap: "data" }));
router.post("/royal-holiday/:empresaId/linea/asignacion", rutaAutenticada(rh.guardarAsignacionLinea, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/royal-holiday/:empresaId/linea/rotacion", rutaAutenticada(rh.listarRotacionLinea, { wrap: "data" }));
router.post("/royal-holiday/:empresaId/linea/rotacion", rutaAutenticada(rh.guardarRotacionLinea, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/royal-holiday/:empresaId/propinas", rutaAutenticada(rh.listarPropinas, { wrap: "data" }));
router.post("/royal-holiday/:empresaId/propinas", rutaAutenticada(rh.guardarPropina, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/royal-holiday/:empresaId/okr", rutaAutenticada(rh.listarOkr, { wrap: "data" }));
router.post("/royal-holiday/:empresaId/okr", rutaAutenticada(rh.guardarOkr, { cuerpo: true, wrap: "data", successStatus: 201 }));
router.get("/royal-holiday/:empresaId/resumen", rutaAutenticada(rh.resumenVentasRh, { wrap: "data" }));

export default router;
