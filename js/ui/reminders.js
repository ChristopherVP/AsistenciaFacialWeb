import { ValidationError } from "../errors.js";
import { isoDate, parseTime, weekday } from "../models.js";
import { Speaker } from "../voice.js";

export const LEAD_CHOICES = Object.freeze([1, 2, 3]);
export const DEFAULT_LEAD_MINUTES = 1;
export const VIBRATION_PATTERN = Object.freeze([400, 200, 400, 200, 400]);
const LEAD_KEY = "af_reminder_lead";
const CLAIM_KEY = "af_reminders";

const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export const vibrationSupported = () => typeof globalThis.navigator?.vibrate === "function";

function vibrateDevice(pattern) {
  try {
    return vibrationSupported() ? globalThis.navigator.vibrate([...pattern]) : false;
  } catch {
    return false;
  }
}

export function getReminderLead(storage = browserStorage()) {
  try {
    const saved = Number(storage?.getItem(LEAD_KEY));
    return LEAD_CHOICES.includes(saved) ? saved : DEFAULT_LEAD_MINUTES;
  } catch {
    return DEFAULT_LEAD_MINUTES;
  }
}

export function saveReminderLead(minutes, storage = browserStorage()) {
  if (!LEAD_CHOICES.includes(minutes)) throw new ValidationError("Elija 1, 2 o 3 minutos.");
  try {
    storage.setItem(LEAD_KEY, String(minutes));
  } catch (error) {
    throw new ValidationError(`No se pudo guardar el ajuste en este dispositivo: ${error.message}`);
  }
}

/**
 * Antes de que empiece una lista programada, con la aplicación abierta: el dispositivo vibra (si puede) y una voz dice
 * «Pronto se tomará lista al curso …». Por defecto 1 minuto antes (se puede elegir 1, 2 o 3).
 * - El aviso solo sale si la aplicación vio el horario ANTES de que empezara su ventana; un horario creado o activado
 *   dentro de la ventana no avisa de golpe.
 * - Una página web cerrada no puede avisar ni vibrar: por eso no hay notificaciones del sistema.
 */
export class ScheduleReminders {
  constructor(state, { speaker = new Speaker(), vibrate = vibrateDevice, storage = browserStorage(), isBusy = () => false,
    lead = () => getReminderLead(storage) } = {}) {
    this._state = state; this._speaker = speaker; this._vibrate = vibrate; this._storage = storage;
    this._isBusy = isBusy; this._lead = lead;
    this._memory = new Set(); this._armed = new Set();
  }

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
    const today = isoDate(now);
    const leadMs = this._lead() * 60_000;
    for (const course of this._state.repository.courses) {
      if (!course.schedule_enabled) continue;
      for (const slot of course.slots) {
        if (slot.enabled === false || slot.completed_on || slot.ran_on === today || !slot.days.includes(weekday(now))) continue;
        const minutes = parseTime(slot.start);
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(minutes / 60), minutes % 60);
        const wait = start - now;
        if (wait <= 0) continue;
        const key = `${course.course_id}|${slot.start}`;
        const armedKey = `${today}|${key}`;
        if (wait > leadMs) this._armed.add(armedKey);
        if (wait <= leadMs && this._armed.has(armedKey) && !this._isBusy() && this._claim(`v|${key}`, today)) {
          this._vibrate(VIBRATION_PATTERN);
          this._speaker.speak(`Pronto se tomará lista al curso ${course.name}.`);
        }
      }
    }
  }
}
