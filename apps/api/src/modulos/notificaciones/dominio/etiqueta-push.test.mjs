/**
 * Golden master Tramo C: etiqueta push + payload OneSignal (puro).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { construirEtiquetaPush } from "./etiqueta-push.js";
import { construirPayloadMensajeOnesignal } from "./payload-onesignal.js";

test("snapshot etiquetas push (byte a byte)", () => {
  const tags = [
    construirEtiquetaPush("fu", "2026-10-20", "0930", "entry-1"),
    construirEtiquetaPush("note", "2026-10-20", "1400", "ts-99"),
    construirEtiquetaPush("dig", "follow-up", "2026-10-17"),
    construirEtiquetaPush("cfu", "2026-10-17", "09:30", "id1"),
    construirEtiquetaPush("n", "x".repeat(80)),
  ];
  assert.deepEqual(tags, [
    "fu-2026-10-20-0930-entry-1",
    "note-2026-10-20-1400-ts-99",
    "dig-follow-up-2026-10-17",
    "cfu-2026-10-17-09:30-id1",
    "n-eaab3bf18423",
  ]);
});

test("snapshot payload OneSignal", () => {
  // buildMessagePayload llama pushTag(tag) con un solo arg → prefix truncado a 20.
  const payload = construirPayloadMensajeOnesignal("app-x", {
    title: "T",
    body: "B",
    url: "https://ex/a",
    path: "/calendar",
    type: "follow_up_reminder",
    tag: "fu-2026-10-20-0930-entry-1",
  });
  assert.deepEqual(payload, {
    app_id: "app-x",
    headings: { en: "T", es: "T" },
    contents: { en: "B", es: "B" },
    url: "https://ex/a",
    web_push_topic: "fu-2026-10-20-0930-e",
    collapse_id: "fu-2026-10-20-0930-e",
    data: { url: "https://ex/a", path: "/calendar", type: "follow_up_reminder" },
  });
});
