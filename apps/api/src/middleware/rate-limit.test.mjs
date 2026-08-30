import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { rateLimit, resetRateLimitStore } from "./rate-limit.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function request(port, { method = "POST", path = "/x", body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, json, text });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

test.beforeEach(() => {
  resetRateLimitStore();
});

test("rateLimit responde 429 genérico sin enumerar usuarios", async () => {
  const app = express();
  app.use(express.json());
  app.post(
    "/x",
    rateLimit({
      name: "test-auth",
      windowMs: 60_000,
      max: 2,
      message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    }),
    (_req, res) => res.json({ ok: true }),
  );
  const { server, port } = await listen(app);
  try {
    const a = await request(port, { body: { email: "a@example.com" } });
    const b = await request(port, { body: { email: "b@example.com" } });
    const c = await request(port, { body: { email: "c@example.com" } });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 429);
    assert.equal(c.json?.error, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
    assert.doesNotMatch(c.text, /existe|no existe|registrad/i);
    assert.ok(Number(c.headers["retry-after"]) >= 1);
  } finally {
    server.close();
  }
});

test("rateLimit se resetea al terminar la ventana", async () => {
  const app = express();
  app.use(express.json());
  app.post(
    "/x",
    rateLimit({ name: "test-window", windowMs: 80, max: 1 }),
    (_req, res) => res.json({ ok: true }),
  );
  const { server, port } = await listen(app);
  try {
    const first = await request(port, { body: {} });
    const blocked = await request(port, { body: {} });
    assert.equal(first.status, 200);
    assert.equal(blocked.status, 429);
    await new Promise((r) => setTimeout(r, 120));
    const after = await request(port, { body: {} });
    assert.equal(after.status, 200);
  } finally {
    server.close();
  }
});
