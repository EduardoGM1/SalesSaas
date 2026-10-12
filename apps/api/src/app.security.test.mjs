import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "./app.js";
import { JSON_BODY_LIMIT } from "./lib/http-limits.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function request(port, { method = "GET", path = "/", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...headers,
          ...(payload ? { "Content-Length": payload.length } : {}),
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
    if (payload) req.end(payload);
    else req.end();
  });
}

test("health directo: sin X-Powered-By y sin CSP/nosniff (edge Nginx en VPS)", async () => {
  const { server, port } = await listen(createApp());
  try {
    const res = await request(port, { path: "/health" });
    assert.equal(res.status, 200);
    assert.equal(res.headers["x-powered-by"], undefined);
    // Desde 38191d0 Helmet no envía CSP ni nosniff en Express (evita duplicar el snippet
    // saletse-security-headers.conf en Nginx, P2). El test unitario golpea Express directo.
    assert.equal(res.headers["content-security-policy"], undefined);
    assert.equal(res.headers["x-content-type-options"], undefined);
  } finally {
    server.close();
  }
});

test("JSON_BODY_LIMIT es 8mb (cubre captura soporte 5 MB, no 15 MB)", () => {
  assert.equal(JSON_BODY_LIMIT, "8mb");
});

test("POST JSON por encima del límite responde 413", async () => {
  const { server, port } = await listen(createApp());
  try {
    const oversized = Buffer.alloc(9 * 1024 * 1024, 0x61);
    const res = await request(port, {
      method: "POST",
      path: "/auth/login",
      headers: { "Content-Type": "application/json" },
      body: oversized,
    });
    assert.equal(res.status, 413);
    assert.equal(res.headers["x-powered-by"], undefined);
    assert.equal(res.json?.error, "El cuerpo de la solicitud es demasiado grande.");
  } finally {
    server.close();
  }
});
