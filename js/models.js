import { DAY_LABELS, TIME_PATTERN } from "./config.js";
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

export function createSlot(days, start, end) {
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ValidationError("Selecciona al menos un día de la semana.");
  }
  if (parseTime(start) >= parseTime(end)) {
    throw new ValidationError("La hora de fin debe ser posterior a la hora de inicio.");
  }
  return Object.freeze({ days: Object.freeze([...days]), start, end });
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

export function courseAddSlot(course, slot) {
  if (course.slots.some((item) => slotEquals(item, slot))) {
    throw new ValidationError("Ese horario ya existe en el curso.");
  }
  return createCourse({ ...course, slots: [...course.slots, slot] });
}

export const courseRemoveSlot = (course, index) =>
  createCourse({ ...course, slots: course.slots.filter((_, i) => i !== index) });

/** Reconstruye un curso desde JSON (también acepta el curso.json de la app de escritorio). */
export function courseFromDict(raw) {
  const students = (raw.students ?? []).map((item) =>
    createStudent(item.student_id, item.name, item.embeddings));
  const slots = (raw.slots ?? []).map((item) =>
    createSlot(item.days.map(Number), String(item.start), String(item.end)));
  return createCourse({
    course_id: String(raw.course_id), name: String(raw.name), students, slots,
    schedule_enabled: Boolean(raw.schedule_enabled), last_auto_date: String(raw.last_auto_date ?? ""),
  });
}

export const DEFAULT_SETTINGS = Object.freeze({
  camera_index: 0, camera_name: "", camera_device_id: "", threshold: 0.40,
});
