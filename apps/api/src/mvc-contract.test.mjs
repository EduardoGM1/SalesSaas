import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "./app.js";

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

/** Sin token: 401 o 503 (Supabase no configurado). Nunca 200. */
function assertAuthGate(res) {
  assert.notEqual(res.status, 200);
  assert.ok(res.status === 401 || res.status === 503);
  assert.equal(typeof res.json?.error, "string");
}

test("GET /api/v1 catálogo sigue en v1", async () => {
  const { server, port } = await listen(createApp());
  try {
    const res = await request(port, { path: "/api/v1" });
    assert.equal(res.status, 200);
    assert.equal(res.json?.version, "v1");
    assert.equal(res.json?.endpoints?.goals?.GET, "/api/v1/goals");
  } finally {
    server.close();
  }
});

test("geo countries público", async () => {
  const { server, port } = await listen(createApp());
  try {
    const res = await request(port, { path: "/api/v1/geo/countries" });
    assert.equal(res.status, 200);
    assert.equal(Array.isArray(res.json?.data), true);
    assert.ok(res.json.data.length > 0);
  } finally {
    server.close();
  }
});

const PROTEGIDOS = [
  ["/api/v1/goals", "GET"],
  ["/api/v1/activities", "GET"],
  ["/api/v1/sales", "GET"],
  ["/api/v1/calendar-entries", "GET"],
  ["/api/v1/profile", "GET"],
  ["/api/v1/sync", "GET"],
  ["/api/v1/prospects", "GET"],
  ["/api/v1/workspace/team", "GET"],
  ["/api/v1/royal-holiday/x/catalogo", "GET"],
  ["/api/v1/admin/me", "GET"],
  ["/api/v1/cron/flush-reminders", "GET"],
];

for (const [path, method] of PROTEGIDOS) {
  test(`${method} ${path} exige auth o cron`, async () => {
    const { server, port } = await listen(createApp());
    try {
      const res = await request(port, { method, path });
      assertAuthGate(res);
    } finally {
      server.close();
    }
  });
}

test("POST /auth/login sin cuerpo no es 500 (rate limit intacto)", async () => {
  const { server, port } = await listen(createApp());
  try {
    const res = await request(port, {
      method: "POST",
      path: "/auth/login",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.notEqual(res.status, 500);
    assert.ok([400, 401, 503].includes(res.status));
  } finally {
    server.close();
  }
});
