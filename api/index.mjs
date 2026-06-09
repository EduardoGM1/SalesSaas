/**
 * Entrada serverless de Vercel: reexporta la app Express.
 * Rewrites en vercel.json envían /api/*, /auth/* y /health aquí.
 */
import dns from "node:dns";
import app from "../apps/api/src/app.js";

dns.setDefaultResultOrder("ipv4first");

export default app;

export const config = {
  maxDuration: 30,
};
