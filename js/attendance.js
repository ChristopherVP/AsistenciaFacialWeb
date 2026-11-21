import { CONFIRM_FRAMES } from "./config.js";
import { AttendanceError, StorageError } from "./errors.js";
import { nameSortKey } from "./validators.js";

export const PERCENT_HEADER = "% Asistencia";
export const PERCENT_COLUMN = 3;
export const FIRST_DATE_COLUMN = 4;

export function columnLetter(number) {
  let letters = "";
  for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

/** Sesión de reconocimiento: confirma a un estudiante tras N lecturas seguidas. */
export class AttendanceSession {
  constructor(engine, gallery, threshold, margin = 0.0, confirmFrames = CONFIRM_FRAMES) {
    this._engine = engine;
    this._gallery = gallery;
    this._threshold = threshold;
    this._margin = margin;
    this._confirmFrames = confirmFrames;
    this._streaks = new Map();
    this._present = new Map();
    this._events = [];
  }

  get present() { return new Map(this._present); }

  popEvents() {
    const events = this._events;
    this._events = [];
    return events;
  }

  async process(frame) {
    const results = [];
    const seen = new Set();
    for (const face of await this._engine.detect(frame)) {
      const box = [0, 1, 2, 3].map((i) => Math.trunc(face[i]));
      const feature = await this._engine.embed(frame, face);
      const student = this._gallery.identify(feature, this._threshold, this._margin);
      if (student === null) {
        results.push({ box, label: "Desconocido", recognized: false });
        continue;
      }
      seen.add(student.student_id);
      results.push({ box, label: student.name, recognized: true });
    }
    this._streaks = new Map([...seen].map((id) => [id, (this._streaks.get(id) ?? 0) + 1]));
    const confirmed = new Map();
    const newEvents = [];
    for (const [studentId, count] of this._streaks) {
      if (count !== this._confirmFrames) continue;
      if (this._present.has(studentId)) {
        newEvents.push(["already", studentId]);
      } else {
        confirmed.set(studentId, new Date());
        newEvents.push(["registered", studentId]);
      }
    }
    this._present = new Map([...this._present, ...confirmed]);
    this._events = [...this._events, ...newEvents];
    return results;
  }
}

const minuteOf = (moment) => Math.floor(moment.getTime() / 60000) * 60000;

/**
 * Libro de asistencia de un curso (equivalente al Excel de la app de escritorio).
 * Se guarda en IndexedDB y se descarga como .xlsx con excel.js.
 */
export class AttendanceBook {
  constructor(repository, courseId, sheetTitle = "Asistencia") {
    this._repository = repository;
    this._courseId = courseId;
    const cleaned = sheetTitle.replace(/[[\]:*?/\\]/g, "").trim();
    this._sheetTitle = cleaned.slice(0, 31) || "Asistencia";
  }

  async _load() {
    let stored;
    try {
      stored = await this._repository.get(this._courseId);
    } catch (error) {
      throw new AttendanceError(`No se pudo abrir el Excel (${error.message}).`);
    }
    return stored
      ? structuredClone(stored)
      : { course_id: this._courseId, sheet_title: this._sheetTitle, rows: [], columns: [] };
  }

  async _save(book) {
    try {
      await this._repository.save(book);
    } catch (error) {
      if (error instanceof StorageError) throw new AttendanceError(`No se pudo guardar el Excel (${error.message}).`);
      throw error;
    }
  }

  static withStudents(book, students) {
    const known = new Set(book.rows.map((row) => row.id));
    const added = students.filter((student) => !known.has(student.student_id));
    if (!added.length) return book;
    const rows = [...book.rows, ...added.map((s) => ({ id: s.student_id, name: s.name }))]
      .sort((a, b) => nameSortKey(a.name).localeCompare(nameSortKey(b.name)));
    return { ...book, rows };
  }

  async exists() { return Boolean(await this._repository.get(this._courseId)); }

  async syncStudents(students) {
    await this._save(AttendanceBook.withStudents(await this._load(), students));
  }

  /** Abre una columna nueva con todos en 0. Devuelve su índice. */
  async startList(moment, students) {
    const book = AttendanceBook.withStudents(await this._load(), students);
    const marks = Object.fromEntries(students.map((s) => [s.student_id, 0]));
    const columns = [...book.columns, { moment: minuteOf(moment), marks }];
    await this._save({ ...book, columns });
    return columns.length - 1;
  }

  async markPresent(column, studentId) {
    const book = await this._load();
    if (!book.rows.some((row) => row.id === studentId)) {
      throw new AttendanceError(`La cédula ${studentId} no está en el Excel.`);
    }
    book.columns[column].marks[studentId] = 1;
    await this._save(book);
  }

  async finalize(column, presentIds, students) {
    const book = AttendanceBook.withStudents(await this._load(), students);
    const roster = new Set(students.map((s) => s.student_id));
    for (const id of roster) book.columns[column].marks[id] = presentIds.has(id) ? 1 : 0;
    await this._save(book);
    const present = [...roster].filter((id) => presentIds.has(id)).length;
    return { column_letter: columnLetter(FIRST_DATE_COLUMN + column), present, total: roster.size };
  }
}
