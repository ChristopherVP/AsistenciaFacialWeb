import { DB_NAME, EXCEL_SUFFIX, NAME_MAX_LENGTH } from "./config.js";
import { StorageError, ValidationError } from "./errors.js";
import { DEFAULT_SETTINGS, courseFromDict, createCourse } from "./models.js";

const DB_VERSION = 1;
const STORE_KEYS = Object.freeze({
  courses: "course_id", books: "course_id", settings: "key", users: "cedula",
});
const SETTINGS_KEY = "ajustes";

let databasePromise = null;

function describe(error) {
  return error?.message || error?.name || String(error);
}

function openDatabase() {
  if (databasePromise !== null) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new StorageError("Este navegador no permite guardar datos locales (IndexedDB)."));
      return;
    }
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const [store, keyPath] of Object.entries(STORE_KEYS)) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, { keyPath });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError(`No se pudo abrir el almacenamiento local: ${describe(request.error)}`));
    request.onblocked = () => reject(new StorageError("El almacenamiento local está bloqueado por otra pestaña."));
  });
  databasePromise.catch(() => { databasePromise = null; });
  return databasePromise;
}

async function run(store, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let result;
    try {
      const transaction = database.transaction(store, mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(new StorageError(describe(transaction.error)));
      transaction.onabort = () => reject(new StorageError(describe(transaction.error)));
      const request = action(transaction.objectStore(store));
      request.onsuccess = () => { result = request.result; };
    } catch (error) {
      reject(new StorageError(describe(error)));
    }
  });
}

export const getRecord = (store, key) => run(store, "readonly", (s) => s.get(key));
export const getAllRecords = (store) => run(store, "readonly", (s) => s.getAll());
export const putRecord = (store, value) => run(store, "readwrite", (s) => s.put(value));
export const deleteRecord = (store, key) => run(store, "readwrite", (s) => s.delete(key));
export const clearStore = (store) => run(store, "readwrite", (s) => s.clear());

/** Nombre del archivo Excel de un curso (mismas reglas que la app de escritorio). */
export function excelFileName(courseName) {
  const safe = courseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().replace(/\.+$/, "");
  return `${safe || "Curso"}${EXCEL_SUFFIX}`;
}

export class SettingsRepository {
  async load() {
    try {
      const record = await getRecord("settings", SETTINGS_KEY);
      if (!record) return { settings: DEFAULT_SETTINGS, warning: null };
      const known = Object.keys(DEFAULT_SETTINGS);
      const values = Object.fromEntries(Object.entries(record.value).filter(([key]) => known.includes(key)));
      return { settings: Object.freeze({ ...DEFAULT_SETTINGS, ...values }), warning: null };
    } catch (error) {
      return {
        settings: DEFAULT_SETTINGS,
        warning: `No se pudieron leer los ajustes (${describe(error)}). Se usarán los valores por defecto.`,
      };
    }
  }

  async save(settings) {
    await putRecord("settings", { key: SETTINGS_KEY, value: { ...settings } });
  }
}

const slugOf = (name) =>
  name.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "curso";

export class CourseRepository {
  constructor() {
    this.loadWarnings = [];
    this._courses = new Map();
  }

  static async load() {
    const repository = new CourseRepository();
    let records = [];
    try {
      records = await getAllRecords("courses");
    } catch (error) {
      repository.loadWarnings.push(`No se pudieron leer los cursos (${describe(error)}).`);
    }
    for (const raw of records) {
      try {
        const course = courseFromDict(raw);
        repository._courses.set(course.course_id, course);
      } catch (error) {
        repository.loadWarnings.push(`No se pudo leer el curso ${raw?.name ?? raw?.course_id} (${describe(error)}).`);
      }
    }
    return repository;
  }

  get courses() {
    return [...this._courses.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  get(courseId) { return courseId ? this._courses.get(courseId) ?? null : null; }

  _validatedName(name, ignoreId = null) {
    const clean = name.split(/\s+/).filter(Boolean).join(" ");
    if (!clean) throw new ValidationError("Escribe el nombre del curso.");
    if (clean.length > NAME_MAX_LENGTH) {
      throw new ValidationError(`El nombre del curso no puede pasar de ${NAME_MAX_LENGTH} caracteres.`);
    }
    for (const course of this._courses.values()) {
      if (course.course_id !== ignoreId && course.name.toLowerCase() === clean.toLowerCase()) {
        throw new ValidationError("Ya existe un curso con ese nombre.");
      }
    }
    return clean;
  }

  async create(name) {
    const clean = this._validatedName(name);
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
    const course = createCourse({ course_id: `${slugOf(clean)}-${suffix}`, name: clean });
    await this.save(course);
    return course;
  }

  async rename(courseId, name) {
    const course = this._courses.get(courseId);
    const renamed = createCourse({ ...course, name: this._validatedName(name, courseId) });
    await this.save(renamed);
    return renamed;
  }

  async save(course) {
    await putRecord("courses", JSON.parse(JSON.stringify(course)));
    this._courses = new Map([...this._courses, [course.course_id, course]]);
  }

  async delete(courseId) {
    await deleteRecord("courses", courseId);
    await deleteRecord("books", courseId);
    this._courses = new Map([...this._courses].filter(([id]) => id !== courseId));
  }
}

export class BookRepository {
  get(courseId) { return getRecord("books", courseId); }
  save(book) { return putRecord("books", book); }
}
