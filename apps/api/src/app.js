import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import v1Router from "./routes/v1.js";
import authRouter from "./routes/auth.js";
import { webOrigins } from "./lib/origins.js";
import { JSON_BODY_LIMIT } from "./lib/http-limits.js";
import { isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
import { probeSupabaseAuth } from "./lib/supabase-server.js";
import { authorizeCron } from "./lib/cron-auth.js";
import { requestContextMiddleware } from "./lib/request-context.js";
import { logger } from "./lib/logger.js";

const DEPLOY_SHA_FILE = fileURLToPath(new URL("../../../SHA.txt", import.meta.url));

/**
 * SHA desplegado para /health: API_BUILD_ID (pm2) → SHA.txt que escribe el deploy
 * en la raíz del repo → variables de Vercel/Vite → null.
 */
export function resolveBuildCommit(env = process.env, shaFile = DEPLOY_SHA_FILE) {
  const fromEnv = String(env.API_BUILD_ID || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const fromFile = readFileSync(shaFile, "utf8").trim().split(/\s+/)[0];
    if (fromFile) return fromFile;
  } catch {
    // Sin SHA.txt (dev, Vercel): seguir con las variables.
  }
  return env.VERCEL_GIT_COMMIT_SHA || env.VITE_BUILD_ID || null;
}

export function createApp() {
  const buildCommit = resolveBuildCommit();
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  const origins = webOrigins();
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

  app.use(requestContextMiddleware);
  app.use(helmet({
    // CSP, X-Frame-Options y nosniff los pone Nginx (snippet del vhost).
    // Si Helmet también los manda, /health y /api los duplican.
    contentSecurityPolicy: false,
    frameguard: false,
    noSniff: false,
    referrerPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Saletse en VPS aún se sirve por HTTP; HSTS rompería el acceso.
    hsts: false,
  }));
  app.use(compression());
  app.use(cors({
    origin: origins.length ? origins : (isProd ? false : true),
    credentials: true,
  }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "@salesapp/api",
      commit: buildCommit,
      deployment: process.env.VERCEL_DEPLOYMENT_ID || null,
    });
  });

  // Público: solo ok/configured. El detalle del probe (URLs, latencias, errores
  // de infra) requiere el CRON_SECRET para no exponer topología.
  app.get("/health/supabase", async (req, res) => {
    const probe = await probeSupabaseAuth();
    res.json({
      ok: probe.ok,
      configured: isSupabaseConfigured(),
      ...(authorizeCron(req) ? { probe } : {}),
    });
  });

  app.use("/api/v1", v1Router);
  app.use("/auth", authRouter);

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large" || err?.status === 413) {
      return res.status(413).json({ error: "El cuerpo de la solicitud es demasiado grande." });
    }
    logger.error(err, { handler: "express-error" });
    res.status(500).json({ error: "Error interno del servidor." });
  });

  return app;
}

const app = createApp();
export default app;
