import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSessionNotRevoked,
  readJwtIatMs,
  sessionRevocationFailClosed,
} from "./auth.js";

function jwtWithIat(iatSec) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: iatSec, sub: "u1" })).toString("base64url");
  return `${header}.${payload}.sig`;
}

function mockProfiles({ error = null, data = null } = {}) {
  return {
    from(table) {
      assert.equal(table, "profiles");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data, error };
        },
      };
    },
  };
}

test("sessionRevocationFailClosed: lecturas normales pasan; escrituras y sensibles no", () => {
  assert.equal(sessionRevocationFailClosed({ method: "GET", path: "/api/prospects" }), false);
  assert.equal(sessionRevocationFailClosed({ method: "HEAD", path: "/api/health" }), false);
  assert.equal(sessionRevocationFailClosed({ method: "POST", path: "/api/prospects" }), true);
  assert.equal(sessionRevocationFailClosed({ method: "PUT", path: "/api/sync" }), true);
  assert.equal(sessionRevocationFailClosed({ method: "PATCH", path: "/api/sales/1" }), true);
  assert.equal(sessionRevocationFailClosed({ method: "DELETE", path: "/api/sales/1" }), true);
  assert.equal(sessionRevocationFailClosed({ method: "GET", path: "/api/admin/users" }), true);
  assert.equal(sessionRevocationFailClosed({ method: "GET", path: "/api/admin" }), true);
  assert.equal(sessionRevocationFailClosed({ method: "GET", path: "/api/permissions" }), true);
  assert.equal(sessionRevocationFailClosed({ method: "GET", path: "/api/roles" }), true);
  assert.equal(sessionRevocationFailClosed({ method: "GET", path: "/api/sync" }), true);
});

test("assertSessionNotRevoked: BD caída + lectura → ok (fail-open selectivo)", async () => {
  const token = jwtWithIat(Math.floor(Date.now() / 1000) - 60);
  assert.ok(readJwtIatMs(token) > 0);
  const res = await assertSessionNotRevoked(
    mockProfiles({ error: { message: "connection refused" } }),
    "user-1",
    token,
    { failClosed: false },
  );
  assert.equal(res.ok, true);
});

test("assertSessionNotRevoked: BD caída + escritura/sensible → 503", async () => {
  const token = jwtWithIat(Math.floor(Date.now() / 1000) - 60);
  const res = await assertSessionNotRevoked(
    mockProfiles({ error: { message: "connection refused" } }),
    "user-1",
    token,
    { failClosed: true },
  );
  assert.equal(res.ok, false);
  assert.equal(res.status, 503);
});

test("assertSessionNotRevoked: columna ausente sigue fail-open aunque failClosed", async () => {
  const token = jwtWithIat(Math.floor(Date.now() / 1000) - 60);
  const res = await assertSessionNotRevoked(
    mockProfiles({ error: { message: "column auth_revoked_at does not exist" } }),
    "user-1",
    token,
    { failClosed: true },
  );
  assert.equal(res.ok, true);
});

test("assertSessionNotRevoked: sesión realmente revocada → 401", async () => {
  const iat = Math.floor(Date.now() / 1000) - 3600;
  const token = jwtWithIat(iat);
  const revokedAt = new Date((iat + 10) * 1000).toISOString();
  const res = await assertSessionNotRevoked(
    mockProfiles({ data: { auth_revoked_at: revokedAt } }),
    "user-1",
    token,
    { failClosed: false },
  );
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
});
