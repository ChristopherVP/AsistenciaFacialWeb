import { ValidationError } from "../errors.js";
import { isoDate, parseTime, weekday } from "../models.js";
import { blockedMessage, detectPlatform, isInstalledApp } from "../permissions.js";
import { Speaker } from "../voice.js";

export const DEFAULT_LEADS = Object.freeze({ notifyMinutes: 5, voiceMinutes: 1 });
export const NOTIFY_CHOICES = Object.freeze([2, 3, 5, 10, 15]);
export const VOICE_CHOICES = Object.freeze([1, 2, 3]);
const LEADS_KEY = "af_reminder_leads";
const CLAIM_KEY = "af_reminders"; // lo ya avisado hoy (compartido entre ventanas del mismo navegador)
const SEEN_KEY = "af_app_seen"; // la aplicación instalada se abrió hace poco
const SEEN_TTL_MS = 30 * 24 * 3600_000;

const isStandalone = () => Boolean(globalThis.matchMedia?.("(display-mode: standalone)").matches || globalThis.navigator?.standalone);
const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export const notificationsSupported = () => typeof globalThis.Notification !== "undefined";

export function getReminderLeads(storage = browserStorage()) {
  try {
    const saved = JSON.parse(storage?.getItem(LEADS_KEY) ?? "null");
    if (NOTIFY_CHOICES.includes(saved?.notifyMinutes) && VOICE_CHOICES.includes(saved?.voiceMinutes) && saved.voiceMinutes < saved.notifyMinutes) {
      return Object.freeze({ notifyMinutes: saved.notifyMinutes, voiceMinutes: saved.voiceMinutes });
    }
  } catch {
    return DEFAULT_LEADS;
  }
  return DEFAULT_LEADS;
}

export function saveReminderLeads({ notifyMinutes, voiceMinutes }, storage = browserStorage()) {
  if (!NOTIFY_CHOICES.includes(notifyMinutes) || !VOICE_CHOICES.includes(voiceMinutes)) throw new ValidationError("Elija minutos de la lista.");
  if (voiceMinutes >= notifyMinutes) throw new ValidationError("La voz debe sonar más cerca de la hora que la notificación: elija menos minutos para la voz.");
  try {
    storage.setItem(LEADS_KEY, JSON.stringify({ notifyMinutes, voiceMinutes }));
  } catch (error) {
    throw new ValidationError(`No se pudo guardar el ajuste en este dispositivo: ${error.message}`);
  }
}

export function notificationStatus() {
  if (!notificationsSupported()) {
    return detectPlatform() === "ios" && !isInstalledApp()
      ? "En iPhone y iPad las notificaciones solo funcionan con la aplicación agregada a la pantalla de inicio (iOS 16.4 o superior). Vea los pasos en Permisos del dispositivo."
      : "Este dispositivo no permite notificaciones.";
  }
  const { permission } = globalThis.Notification;
  if (permission === "granted") return `✔ Permiso concedido: recibirá una notificación ${getReminderLeads().notifyMinutes} minutos antes de cada lista programada (con la aplicación abierta desde antes).`;
  if (permission === "denied") return blockedMessage("notifications");
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
 * Avisa de las listas programadas: notificación del sistema y voz con los minutos elegidos (por defecto 5 y 1).
 * - Cada aviso solo sale si la aplicación vio el horario ANTES de que empezara su ventana; un horario creado o
 *   activado dentro de la ventana no dispara el aviso de golpe.
 * - Solo funciona con la aplicación abierta (una página web no puede despertarse sola).
 * - Si la aplicación instalada está en uso, avisa ella y el navegador se calla.
 */
export class ScheduleReminders {
  constructor(state, { speaker = new Speaker(), notify = showNotification, storage = browserStorage(), standalone = isStandalone,
    permission = () => (notificationsSupported() ? globalThis.Notification.permission : "denied"), isBusy = () => false,
    leads = () => getReminderLeads(storage) } = {}) {
    this._state = state; this._speaker = speaker; this._notify = notify; this._storage = storage;
    this._standalone = standalone; this._permission = permission; this._isBusy = isBusy; this._leads = leads;
    this._memory = new Set(); this._armed = new Set(); this._lastSeen = 0;
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
    const { notifyMinutes, voiceMinutes } = this._leads();
    const noticeMs = notifyMinutes * 60_000;
    const voiceMs = voiceMinutes * 60_000;
    for (const course of this._state.repository.courses) {
      if (!course.schedule_enabled || course.last_auto_date === today) continue;
      for (const slot of course.slots) {
        if (slot.enabled === false || !slot.days.includes(weekday(now))) continue;
        const minutes = parseTime(slot.start);
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(minutes / 60), minutes % 60);
        const wait = start - now;
        if (wait <= 0) continue;
        const key = `${course.course_id}|${slot.start}`;
        const noticeKey = `${today}|n|${key}`;
        const voiceKey = `${today}|v|${key}`;
        if (wait > noticeMs) this._armed.add(noticeKey);
        if (wait > voiceMs) this._armed.add(voiceKey);
        if (wait <= noticeMs && this._armed.has(noticeKey) && this._shouldNotify() && this._claim(`n|${key}`, today)) {
          Promise.resolve(this._notify({
            title: `Lista programada: ${course.name}`,
            body: `Empieza a las ${slot.start}, en ${Math.max(1, Math.round(wait / 60_000))} min. Toque para abrir la aplicación e iniciar sesión.`,
            tag: `af-${course.course_id}-${today}`,
          })).catch(() => {});
        }
        if (wait <= voiceMs && this._armed.has(voiceKey) && !this._isBusy() && this._claim(`v|${key}`, today)) {
          this._speaker.speak(`Pronto iniciará la lista programada del curso ${course.name}.`);
        }
      }
    }
  }
}
