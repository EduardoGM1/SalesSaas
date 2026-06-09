/** Orígenes permitidos para CORS y redirects de auth (local + Vercel). */
export function webOrigins() {
  const list = [
    process.env.WEB_ORIGIN,
    "http://localhost:5173",
    "http://localhost:3000",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
  ];
  return [...new Set(list.filter(Boolean))];
}

export function primaryWebOrigin() {
  const [first] = webOrigins();
  return first ?? "http://localhost:5173";
}
