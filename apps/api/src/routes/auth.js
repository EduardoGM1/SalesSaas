/**
 * Rutas /auth (cookies de sesión). El rate limiting vive SOLO aquí.
 */
import { Router } from "express";
import { AUTH_RATE_LIMIT_MESSAGE, AUTH_RATE_LIMITS } from "../lib/auth-rate-limits.js";
import { rateLimit } from "../middleware/rate-limit.js";
import * as authController from "../controllers/auth-controller.js";

const router = Router();

const limit = (cfg) => rateLimit({ ...cfg, message: AUTH_RATE_LIMIT_MESSAGE });
const tokenLimit = limit(AUTH_RATE_LIMITS.token);

router.post("/login", limit(AUTH_RATE_LIMITS.login), authController.iniciarSesion);
router.post("/register", limit(AUTH_RATE_LIMITS.register), authController.registrar);
router.post("/signout", authController.cerrarSesion);
router.post("/forgot-password", limit(AUTH_RATE_LIMITS.recover), authController.olvidarContrasena);
router.post("/reset-password", tokenLimit, authController.restablecerContrasena);
router.post("/exchange-code", tokenLimit, authController.intercambiarCodigo);
router.post("/verify-token", tokenLimit, authController.verificarToken);
router.post("/set-session", tokenLimit, authController.fijarSesion);
router.get("/callback", authController.redirigirCallback);

export default router;
