import { DAY_LABELS, MAX_SLOT_MINUTES, TIME_PATTERN } from "./config.js";
import { ValidationError } from "./errors.js";
import { nameSortKey } from "./validators.js";

/** Convierte "HH:MM" en minutos desde medianoche. */
export function parseTime(text) {
  const match = TIME_PATTERN.exec(text);
  if (match === null) throw new ValidationError(`Hora inválida: '${text}'. Usa el formato HH:MM.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Lunes = 0 … Domingo = 6 (igual que Python). */
export const weekday = (moment) => (moment.getDay() + 6) % 7;
export const minutesOfDay = (moment) => moment.getHours() * 60 + moment.getMinutes();

const pad2 = (value) => String(value).padStart(2, "0");
export const isoDate = (moment) =>
  `${moment.getFullYear()}-${pad2(moment.getMonth() + 1)}-${pad2(moment.getDate())}`;
export const formatDateTime = (moment) =>
  `${pad2(moment.getDate())}/${pad2(moment.getMonth() + 1)}/${moment.getFullYear()} ` +
  `${pad2(moment.getHours())}:${pad2(moment.getMinutes())}`;
export const formatClock = (moment) =>
  `${pad2(moment.getHours())}:${pad2(moment.getMinutes())}:${pad2(moment.getSeconds())}`;
export const formatDayMonth = (moment) => `${pad2(moment.getDate())}/${pad2(moment.getMonth() + 1)}`;

export function sortedStudents(students) {
  return Object.freeze(
    [...students].sort((a, b) => nameSortKey(a.name).localeCompare(nameSortKey(b.name))));
}

export function createStudent(studentId, name, embeddings) {
  return Object.freeze({
    student_id: String(studentId),
    name: String(name),
    embeddings: Object.freeze(embeddings.map((vector) => Object.freeze(Array.from(vector, Number)))),
  });
}

export function createSlot(days, start, end, { legacy = false, enabled = true } = {}) {
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ValidationError("Selecciona al menos un día de la semana.");
  }
  if (parseTime(start) >= parseTime(end)) {
    throw new ValidationError("La hora de fin debe ser posterior a la hora de inicio.");
  }
  if (!legacy && parseTime(end) - parseTime(start) > MAX_SLOT_MINUTES) {
    throw new ValidationError(`La lista programada no puede durar más de ${MAX_SLOT_MINUTES} minutos.`);
  }
  return Object.freeze({ days: Object.freeze([...days]), start, end, enabled: Boolean(enabled) });
}

export const slotEquals = (a, b) =>
  a.start === b.start && a.end === b.end &&
  a.days.length === b.days.length && a.days.every((day, index) => day === b.days[index]);

export function slotContains(slot, moment) {
  const current = minutesOfDay(moment);
  return slot.days.includes(weekday(moment)) &&
    parseTime(slot.start) <= current && current < parseTime(slot.end);
}

export const slotDaysText = (slot) => [...slot.days].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(", ");
export const slotMinutes = (slot) => parseTime(slot.end) - parseTime(slot.start);
export const slotLabel = (slot) => `${slotDaysText(slot)}   ·   ${slot.start} a ${slot.end}`;

export function createCourse({ course_id, name, students = [], slots = [], schedule_enabled = false, last_auto_date = "" }) {
  return Object.freeze({
    course_id, name,
    students: sortedStudents(students),
    slots: Object.freeze([...slots]),
    schedule_enabled, last_auto_date,
  });
}

export function courseAddStudent(course, student) {
  if (course.students.some((item) => item.student_id === student.student_id)) {
    throw new ValidationError(
      `Ya existe un estudiante con la cédula ${student.student_id} en este curso.`);
  }
  return createCourse({ ...course, students: [...course.students, student] });
}

export const courseRemoveStudent = (course, studentId) =>
  createCourse({ ...course, students: course.students.filter((s) => s.student_id !== studentId) });

export const isSlotActive = (course, slot) => Boolean(course.schedule_enabled) && slot.enabled !== false;
export const activeSlotCount = (course) => course.slots.filter((slot) => isSlotActive(course, slot)).length;

const withEnabled = (slot, enabled) => Object.freeze({ ...slot, enabled: Boolean(enabled) });
const frozenState = (course) => course.slots.map((slot) => withEnabled(slot, isSlotActive(course, slot)));
const withSlots = (course, slots) => createCourse({ ...course, slots, schedule_enabled: slots.some((slot) => slot.enabled) });

export function courseAddSlot(course, slot) {
  if (course.slots.some((item) => slotEquals(item, slot))) {
    throw new ValidationError("Ese horario ya existe en el curso.");
  }
  return withSlots(course, [...frozenState(course), withEnabled(slot, course.schedule_enabled)]);
}

export function courseReplaceSlot(course, index, slot) {
  if (!course.slots[index]) throw new ValidationError("El horario ya no existe.");
  if (course.slots.some((item, position) => position !== index && slotEquals(item, slot))) {
    throw new ValidationError("Ese horario ya existe en el curso.");
  }
  const slots = frozenState(course);
  slots[index] = withEnabled(slot, slots[index].enabled);
  return withSlots(course, slots);
}

export const courseRemoveSlot = (course, index) =>
  withSlots(course, frozenState(course).filter((_, position) => position !== index));

export function courseToggleSlot(course, index) {
  if (!course.slots[index]) throw new ValidationError("El horario ya no existe.");
  const slots = frozenState(course);
  slots[index] = withEnabled(slots[index], !slots[index].enabled);
  return withSlots(course, slots);
}

export const courseSetAllSlots = (course, enabled) =>
  withSlots(course, course.slots.map((slot) => withEnabled(slot, enabled)));

/** Reconstruye un curso desde JSON (también acepta el curso.json de la app de escritorio). */
export function courseFromDict(raw) {
  const students = (raw.students ?? []).map((item) =>
    createStudent(item.student_id, item.name, item.embeddings));
  const master = Boolean(raw.schedule_enabled);
  const slots = (raw.slots ?? []).map((item) =>
    createSlot(item.days.map(Number), String(item.start), String(item.end), { legacy: true, enabled: master && item.enabled !== false }));
  return createCourse({
    course_id: String(raw.course_id), name: String(raw.name), students, slots,
    schedule_enabled: slots.some((slot) => slot.enabled), last_auto_date: String(raw.last_auto_date ?? ""),
  });
}

export const DEFAULT_SETTINGS = Object.freeze({
  camera_index: 0, camera_name: "", camera_device_id: "", threshold: 0.40,
});
