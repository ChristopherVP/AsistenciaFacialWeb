import { DAY_LABELS } from "./config.js";
import { formatDayMonth, isoDate, parseTime, slotContains, weekday } from "./models.js";

export const activeSlot = (course, now) =>
  course.slots.find((slot) => slot.enabled !== false && !slot.completed_on && slot.ran_on !== isoDate(now) && slotContains(slot, now)) ?? null;

export function dueCourses(courses, now) {
  const today = isoDate(now);
  const due = [];
  for (const course of courses) {
    if (!course.schedule_enabled) continue;
    const slot = activeSlot(course, now);
    if (slot !== null) due.push({ course, slot });
  }
  return due;
}

const atMinutes = (day, minutes) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);

export function nextRun(course, now) {
  if (!course.schedule_enabled) return null;
  let best = null;
  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    for (const slot of course.slots) {
      if (slot.enabled === false || slot.completed_on || slot.ran_on === isoDate(day) || !slot.days.includes(weekday(day))) continue;
      const start = atMinutes(day, parseTime(slot.start));
      const end = atMinutes(day, parseTime(slot.end));
      if (end <= now) continue;
      if (best === null || start < best.start) best = { start, slot };
    }
  }
  return best;
}

export function slotNextStart(slot, now) {
  const startMinutes = parseTime(slot.start);
  const endMinutes = parseTime(slot.end);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!slot.days.includes(weekday(day)) || slot.ran_on === isoDate(day)) continue;
    const start = atMinutes(day, startMinutes);
    const end = atMinutes(day, endMinutes);
    if (now >= start && now < end) return { start, running: true };
    if (start > now) return { start, running: false };
  }
  return null;
}

export function formatRemaining(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days} d ${hours} h ${minutes} min ${seconds} s`;
  if (hours > 0) return `${hours} h ${minutes} min ${seconds} s`;
  return `${minutes} min ${seconds} s`;
}

export function describeNext(courses, now) {
  const candidates = courses
    .map((course) => ({ run: nextRun(course, now), course }))
    .filter((item) => item.run !== null);
  if (!candidates.length) return "Sin listas automáticas programadas";
  const { run, course } = candidates.reduce((a, b) => (b.run.start < a.run.start ? b : a));
  if (run.start <= now) return `En horario ahora: ${course.name} · hasta las ${run.slot.end}`;
  return `Próxima lista automática: ${course.name} · ` +
    `${DAY_LABELS[weekday(run.start)]} ${formatDayMonth(run.start)} de ${run.slot.start} a ${run.slot.end}`;
}
