/**
 * Rate limit HTTP por IP en los endpoints /auth.
 * Independiente de GoTrue: esa capa limita el envío de correo (cuota del
 * proyecto). Express corta floods de POST antes de llegar a signIn/signUp/
 * resetPasswordForEmail. No se reimplementa la cuota de mail aquí.
 *
 * Valores (ventana fija, misma instancia; ver middleware/rate-limit.js):
 * - login:    10 / 15 min — tolera typos sin abrir brute force.
 * - register:  8 / 15 min — alta de cuentas es más rara que un login fallido.
 * - recover:  12 / 15 min — reintentos legítimos ("no me llegó el mail").
 * - token:    30 / 15 min — exchange-code / verify-token / set-session /
 *   reset-password: evita fuerza bruta sobre códigos y tokens de recuperación.
 *
 * El mensaje es idéntico en todos para no enumerar si el email existe.
 */
export const AUTH_RATE_LIMIT_MESSAGE =
  "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";

const WINDOW_15_MIN = 15 * 60 * 1000;

export const AUTH_RATE_LIMITS = {
  login: { name: "auth-login", windowMs: WINDOW_15_MIN, max: 10 },
  register: { name: "auth-register", windowMs: WINDOW_15_MIN, max: 8 },
  recover: { name: "auth-forgot-password", windowMs: WINDOW_15_MIN, max: 12 },
  token: { name: "auth-token", windowMs: WINDOW_15_MIN, max: 30 },
};
