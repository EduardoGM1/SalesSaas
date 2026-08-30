/**
 * Rate limit HTTP por IP en login / registro / recover.
 * Independiente de GoTrue: esa capa limita el envío de correo (cuota del
 * proyecto). Express corta floods de POST antes de llegar a signIn/signUp/
 * resetPasswordForEmail. No se reimplementa la cuota de mail aquí.
 *
 * Valores (ventana fija, misma instancia; ver middleware/rate-limit.js):
 * - login:    10 / 15 min — rango 5–10 pedido; 10 tolera typos sin abrir brute force.
 * - register:  8 / 15 min — alta de cuentas es más rara que un login fallido.
 * - recover:  12 / 15 min — más laxo: reintentos legítimos (“no me llegó el mail”)
 *   no deben chocar con Express mientras GoTrue sigue gobernando el SMTP.
 *
 * El mensaje es idéntico en los tres para no enumerar si el email existe.
 */
export const AUTH_RATE_LIMIT_MESSAGE =
  "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";

const WINDOW_15_MIN = 15 * 60 * 1000;

export const AUTH_RATE_LIMITS = {
  login: { name: "auth-login", windowMs: WINDOW_15_MIN, max: 10 },
  register: { name: "auth-register", windowMs: WINDOW_15_MIN, max: 8 },
  recover: { name: "auth-forgot-password", windowMs: WINDOW_15_MIN, max: 12 },
};
