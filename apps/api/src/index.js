import app from "./app.js";

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
const HOST = process.env.API_HOST
  || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`API escuchando en http://${HOST}:${PORT}`);
  });
}
