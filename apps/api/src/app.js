import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import v1Router from "./routes/v1.js";
import authRouter from "./routes/auth.js";
import { webOrigins } from "./lib/origins.js";
import { isSupabaseConfigured } from "@salesapp/shared/supabase/config.js";
import { probeSupabaseAuth } from "./lib/supabase-server.js";

export function createApp() {
  const app = express();
  const origins = webOrigins();

  app.set("trust proxy", 1);

  app.use(cors({
    origin: origins.length ? origins : true,
    credentials: true,
  }));
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "@salesapp/api" });
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
