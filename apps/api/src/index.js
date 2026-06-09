import app from "./app.js";

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`API escuchando en http://localhost:${PORT}`);
  });
}
