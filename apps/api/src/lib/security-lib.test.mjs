import assert from "node:assert/strict";
import test from "node:test";
import { escapeIlikePattern, ilikeOrFilter } from "./ilike.js";
import { assertPublicHttpUrl } from "./safe-url.js";

test("escapeIlikePattern elimina comodines ILIKE", () => {
  assert.equal(escapeIlikePattern("  foo%bar_  "), "foobar");
  assert.equal(escapeIlikePattern("a,b(c)"), "abc");
});

test("ilikeOrFilter devuelve null para búsqueda vacía", () => {
  assert.equal(ilikeOrFilter(["full_name"], "   "), null);
});

test("ilikeOrFilter construye filtro seguro", () => {
  assert.equal(
    ilikeOrFilter(["full_name", "email"], "ana%"),
    "full_name.ilike.%ana%,email.ilike.%ana%",
  );
});

test("assertPublicHttpUrl rechaza localhost", () => {
  assert.throws(() => assertPublicHttpUrl("http://127.0.0.1/logo.png"));
  assert.throws(() => assertPublicHttpUrl("http://localhost/logo.png"));
});

test("assertPublicHttpUrl acepta URL pública https", () => {
  const parsed = assertPublicHttpUrl("https://cdn.example.com/logo.png");
  assert.equal(parsed.hostname, "cdn.example.com");
});
