import { DAY_LABELS } from "./config.js";
import { formatDayMonth, isoDate, parseTime, slotContains, weekday } from "./models.js";

export const activeSlot = (course, now) =>
  course.slots.find((slot) => slot.enabled !== false && slotContains(slot, now)) ?? null;

export function dueCourses(courses, now) {
  const today = isoDate(now);
  const due = [];
  for (const course of courses) {
    if (!course.schedule_enabled || course.last_auto_date === today) continue;
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
    if (offset === 0 && course.last_auto_date === isoDate(day)) continue;
    for (const slot of course.slots) {
      if (slot.enabled === false || !slot.days.includes(weekday(day))) continue;
      const start = atMinutes(day, parseTime(slot.start));
      const end = atMinutes(day, parseTime(slot.end));
      if (end <= now) continue;
      if (best === null || start < best.start) best = { start, slot };
    }
  }
  return best;
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
