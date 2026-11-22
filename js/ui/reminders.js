import { isoDate, parseTime, weekday } from "../models.js";
import { Speaker } from "../voice.js";

export const NOTICE_MINUTES = 5; // aviso del sistema antes de empezar
const NOTICE_MS = NOTICE_MINUTES * 60_000;
const VOICE_MS = 60_000; // voz un minuto antes
const CLAIM_KEY = "af_reminders"; // lo ya avisado hoy (compartido entre ventanas del mismo navegador)
const SEEN_KEY = "af_app_seen"; // la aplicación instalada se abrió hace poco
const SEEN_TTL_MS = 30 * 24 * 3600_000;

const isStandalone = () => Boolean(globalThis.matchMedia?.("(display-mode: standalone)").matches || globalThis.navigator?.standalone);
const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export const notificationsSupported = () => typeof globalThis.Notification !== "undefined";

export function notificationStatus() {
  if (!notificationsSupported()) return "Este dispositivo no permite notificaciones.";
  const { permission } = globalThis.Notification;
  if (permission === "granted") return `✔ Permiso concedido: recibirá una notificación ${NOTICE_MINUTES} minutos antes de cada lista programada (con la aplicación abierta).`;
  if (permission === "denied") return "Notificaciones bloqueadas. Para permitirlas: en el navegador, pulse el candado junto a la dirección → Notificaciones → Permitir. En la aplicación instalada, abra el menú ⋯ de la ventana → Configuración de la aplicación → Notificaciones → Permitir.";
  return "Aún no ha dado el permiso. Pulse «Dar permiso de notificaciones» y elija «Permitir» en la ventana que aparece.";
}

export async function requestNotifications() {
  return notificationsSupported() ? globalThis.Notification.requestPermission() : "unsupported";
}

async function showNotification({ title, body, tag }) {
  const options = { body, tag, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", requireInteraction: true, data: { url: "./" } };
  try {
    const registration = await globalThis.navigator.serviceWorker?.ready;
    if (registration) { await registration.showNotification(title, options); return; }
  } catch { /* se usa el aviso simple */ }
  new globalThis.Notification(title, options);
}

/**
 * Avisa de las listas programadas: notificación del sistema 5 min antes y voz 1 min antes.
 * - Solo funciona con la aplicación abierta (una página web no puede despertarse sola).
 * - Si la aplicación instalada está en uso, avisa ella y el navegador se calla.
 */
export class ScheduleReminders {
  constructor(state, { speaker = new Speaker(), notify = showNotification, storage = browserStorage(), standalone = isStandalone,
    permission = () => (notificationsSupported() ? globalThis.Notification.permission : "denied"), isBusy = () => false } = {}) {
    this._state = state; this._speaker = speaker; this._notify = notify; this._storage = storage;
    this._standalone = standalone; this._permission = permission; this._isBusy = isBusy;
    this._memory = new Set(); this._lastSeen = 0;
    this._markApp();
    globalThis.addEventListener?.("appinstalled", () => this._markApp(true));
  }

  _markApp(force = false) {
    if (!force && !this._standalone()) return;
    if (Date.now() - this._lastSeen < 60_000) return;
    this._lastSeen = Date.now();
    try { this._storage?.setItem(SEEN_KEY, String(this._lastSeen)); } catch { /* sin almacenamiento */ }
  }

  _appInstalled() {
    try { return Number(this._storage?.getItem(SEEN_KEY)) > Date.now() - SEEN_TTL_MS; } catch { return false; }
  }

  /** Aplicación instalada → avisa la aplicación; navegador → solo si la aplicación no está instalada. */
  _shouldNotify() { return this._permission() === "granted" && (this._standalone() || !this._appInstalled()); }

  _claim(key, today) {
    let data;
    try { data = JSON.parse(this._storage.getItem(CLAIM_KEY) ?? "{}"); } catch { data = {}; }
    if (data.day !== today) data = { day: today, done: [] };
    if (data.done.includes(key) || this._memory.has(`${today}|${key}`)) return false;
    data.done.push(key);
    try { this._storage.setItem(CLAIM_KEY, JSON.stringify(data)); } catch { this._memory.add(`${today}|${key}`); }
    return true;
  }

  /** Llamar cada segundo. */
  check(now) {
    this._markApp();
    const today = isoDate(now);
    for (const course of this._state.repository.courses) {
      if (!course.schedule_enabled || course.last_auto_date === today) continue;
      for (const slot of course.slots) {
        if (!slot.days.includes(weekday(now))) continue;
        const minutes = parseTime(slot.start);
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(minutes / 60), minutes % 60);
        const wait = start - now;
        if (wait <= 0 || wait > NOTICE_MS) continue;
        const key = `${course.course_id}|${slot.start}`;
        if (this._shouldNotify() && this._claim(`n|${key}`, today)) {
          Promise.resolve(this._notify({
            title: `Lista programada: ${course.name}`,
            body: `Empieza a las ${slot.start}. Toque para abrir la aplicación e iniciar sesión.`,
            tag: `af-${course.course_id}-${today}`,
          })).catch(() => {});
        }
        if (wait <= VOICE_MS && !this._isBusy() && this._claim(`v|${key}`, today)) {
          this._speaker.speak(`Pronto iniciará la lista programada del curso ${course.name}.`);
        }
      }
    }
  }
}
