import { Router } from "express";
import { apiError, json } from "../lib/http.js";
import * as fxController from "../controllers/exchange-rates-controller.js";

const router = Router();

router.get("/exchange-rates", async (req, res) => {
  const to = String(req.query.to ?? req.query.currency ?? "").toUpperCase();
  if (!to) return apiError(res, "Parámetro to requerido (USD, MXN, CAD, EUR).");
  try {
    const data = await fxController.obtenerTipoCambio(to);
    json(res, { data });
  } catch (err) {
    apiError(res, err instanceof Error ? err.message : "Error al obtener tipo de cambio.", 502);
  }
});

export default router;
