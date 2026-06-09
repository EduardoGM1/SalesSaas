import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import v1Router from "./routes/v1.js";
import authRouter from "./routes/auth.js";

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

const app = express();

app.use(cors({ origin: [WEB_ORIGIN, "http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "@salesapp/api" });
});

app.use("/api/v1", v1Router);
app.use("/auth", authRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
});
