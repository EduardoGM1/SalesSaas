/**
 * Rutas /auth. Rate limiting de login/register/forgot SOLO aquí.
 */
import { Router } from "express";
import { AUTH_RATE_LIMIT_MESSAGE, AUTH_RATE_LIMITS } from "../lib/auth-rate-limits.js";
import { rateLimit } from "../middleware/rate-limit.js";
import * as authController from "../controllers/auth-controller.js";

const router = Router();

router.post("/login", rateLimit({ ...AUTH_RATE_LIMITS.login, message: AUTH_RATE_LIMIT_MESSAGE }), authController.iniciarSesion);
router.post("/register", rateLimit({ ...AUTH_RATE_LIMITS.register, message: AUTH_RATE_LIMIT_MESSAGE }), authController.registrar);
router.post("/signout", authController.cerrarSesion);
router.post("/forgot-password", rateLimit({ ...AUTH_RATE_LIMITS.recover, message: AUTH_RATE_LIMIT_MESSAGE }), authController.olvidarContrasena);
router.post("/reset-password", authController.restablecerContrasena);
router.post("/exchange-code", authController.intercambiarCodigo);
router.post("/verify-token", authController.verificarToken);
router.post("/set-session", authController.fijarSesion);
router.get("/callback", authController.redirigirCallback);

export default router;
