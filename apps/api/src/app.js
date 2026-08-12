import express from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import v1Router from "./routes/v1.js";
import authRouter from "./routes/auth.js";
import { webOrigins } from "./lib/origins.js";
import { isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
import { probeSupabaseAuth } from "./lib/supabase-server.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  const origins = webOrigins();
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

  app.use(compression());
  app.use(cors({
    origin: origins.length ? origins : (isProd ? false : true),
    credentials: true,
  }));
  app.use(express.json({ limit: "15mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "@salesapp/api",
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_BUILD_ID || null,
      deployment: process.env.VERCEL_DEPLOYMENT_ID || null,
    });
  });

  app.get("/health/supabase", async (_req, res) => {
    const probe = await probeSupabaseAuth();
    res.json({
      ok: probe.ok,
      configured: isSupabaseConfigured(),
      probe,
    });
  });

  app.use("/api/v1", v1Router);
  app.use("/auth", authRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor." });
  });

  return app;
}

const app = createApp();
export default app;
