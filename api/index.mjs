/**
 * Entrada serverless de Vercel: reexporta la app Express.
 * Rewrites en vercel.json envían /api/*, /auth/* y /health aquí.
 */
import app from "../apps/api/src/app.js";

export default app;
