/**
 * Caracterización HTTP de /api/v1/calendar-entries sin token.
 * 401 o 503 (Supabase no configurado). Nunca 200. No hay 422 en esta capa.
 */
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "./app.js";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function request(port, { method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: { ...(headers || {}), ...(payload ? { "Content-Length": payload.length } : {}) },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.end(payload);
    else req.end();
  });
}

const CASOS = [
  ["GET", "/api/v1/calendar-entries"],
  ["POST", "/api/v1/calendar-entries"],
  ["GET", "/api/v1/calendar-entries/77777777-7777-4777-8777-777777777777"],
  ["PATCH", "/api/v1/calendar-entries/77777777-7777-4777-8777-777777777777"],
  ["DELETE", "/api/v1/calendar-entries/77777777-7777-4777-8777-777777777777"],
];

for (const [method, path] of CASOS) {
  test(`${method} ${path} sin token → 401 o 503`, async () => {
    const { server, port } = await listen(createApp());
    try {
      const res = await request(port, {
        method,
        path,
        headers: method === "POST" || method === "PATCH" ? { "Content-Type": "application/json" } : {},
        body: method === "POST" || method === "PATCH" ? "{}" : undefined,
      });
      assert.notEqual(res.status, 200);
      assert.ok(res.status === 401 || res.status === 503);
      assert.equal(typeof res.json?.error, "string");
    } finally {
      server.close();
    }
  });
}
