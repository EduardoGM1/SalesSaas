/**
 * Fachada pública — moneda (entrada ESM Node sin bundler).
 * Solo reexporta módulos .js sin alias `@/`.
 * La API completa (+ tipos) está en `index.ts` para Vite (`@/modulos/moneda`).
 */
export { normalizeUsdToMxnRate } from "./dominio/normalizar-tasa-usd-mxn.js";
