import { getInstallPlatform } from "@/lib/pwa-install.js";

/** @type {AudioContext | null} */
let audioCtx = null;
let unlockBound = false;
let unlocked = false;

/**
 * Solo crea/resume AudioContext tras un gesto de usuario.
 * Crear el contexto al boot dispara el warning de autoplay de Chrome.
 */
export async function unlockNotificationSound() {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  try {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    unlocked = audioCtx.state === "running";
  } catch {
    unlocked = false;
  }
}

/**
 * Desbloquea audio tras el primer gesto del usuario (política autoplay de navegadores).
 * Idempotente; se puede llamar al montar el provider de push.
 */
export function bindNotificationSoundUnlock() {
  if (typeof window === "undefined" || unlockBound) return;
  unlockBound = true;

  const unlock = () => {
    void unlockNotificationSound().finally(() => {
      if (unlocked) {
        window.removeEventListener("pointerdown", unlock, true);
        window.removeEventListener("keydown", unlock, true);
      }
    });
  };

  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

/**
 * Tono corto de dos notas (sin asset externo). Solo en desktop para no
 * duplicar el sonido nativo del SO en móvil/PWA.
 */
export async function playNotificationSound() {
  if (typeof window === "undefined") return;
  if (getInstallPlatform() !== "desktop") return;
  if (document.visibilityState !== "visible") return;
  // Sin gesto previo no crear AudioContext (evita spam del warning de Chrome).
  if (!unlocked || !audioCtx || audioCtx.state !== "running") return;

  const ctx = audioCtx;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  master.connect(ctx.destination);

  const tones = [
    { freq: 880, start: 0, dur: 0.14 },
    { freq: 1174.66, start: 0.12, dur: 0.22 },
  ];

  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(tone.freq, now + tone.start);
    gain.gain.setValueAtTime(0.0001, now + tone.start);
    gain.gain.exponentialRampToValueAtTime(1, now + tone.start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + tone.start);
    osc.stop(now + tone.start + tone.dur + 0.02);
  }
}
