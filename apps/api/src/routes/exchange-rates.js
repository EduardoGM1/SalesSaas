import { Router } from "express";
import { apiError, json } from "../lib/http.js";
import { isSupportedCurrency } from "../lib/exchange-rates.js";
import { logger } from "../lib/logger.js";
import { rateLimit } from "../middleware/rate-limit.js";
import * as fxController from "../controllers/exchange-rates-controller.js";

const router = Router();

/**
 * Público (lo usa el login/registro para mostrar montos). Sin auth, así que:
 * rate limit por IP, moneda validada antes de tocar al proveedor y mensaje fijo
 * (el error del fetch externo no se devuelve al cliente).
 */
const fxLimit = rateLimit({ windowMs: 60_000, max: 30, name: "exchange-rates" });

router.get("/exchange-rates", fxLimit, async (req, res) => {
  const to = String(req.query.to ?? req.query.currency ?? "").toUpperCase();
  if (!to) return apiError(res, "Parámetro to requerido (USD, MXN, CAD, EUR).");
  if (!isSupportedCurrency(to)) return apiError(res, "Moneda no soportada. Usa: USD, MXN, CAD, EUR.");
  try {
    const data = await fxController.obtenerTipoCambio(to);
    json(res, { data });
  } catch (err) {
    logger.warn("[fx] proveedor de tipo de cambio falló", { error: err, to });
    apiError(res, "No se pudo obtener el tipo de cambio. Intenta más tarde.", 502);
  }
});

export default router;
