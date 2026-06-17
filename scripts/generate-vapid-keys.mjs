#!/usr/bin/env node
/**
 * Genera claves VAPID para Web Push.
 * Copia la salida a .env.local y Vercel (VAPID_* y VITE_VAPID_PUBLIC_KEY).
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VITE_VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("VAPID_SUBJECT=mailto:tu-correo@ejemplo.com");
