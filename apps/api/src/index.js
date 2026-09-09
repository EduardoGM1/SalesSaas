import app from "./app.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
const HOST = process.env.API_HOST
  || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

/**
 * Red de seguridad: un handler async que rechaza fuera de runService (o un
 * ReferenceError) no debe tumbar el proceso (DoS trivial autenticado).
 * Se registra el error; PM2 solo reinicia ante excepciones realmente fatales.
 */
process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection", { error: reason instanceof Error ? reason : new Error(String(reason)) });
});
process.on("uncaughtException", (err) => {
  logger.error("uncaughtException", { error: err });
  // Estado potencialmente corrupto: salir y dejar que PM2 reinicie.
  process.exit(1);
});

if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    logger.info(`API escuchando en http://${HOST}:${PORT}`);
  });
}
