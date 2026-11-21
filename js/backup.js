import { AppError } from "./errors.js";
import { clearStore, getAllRecords, putRecord } from "./storage.js";
import { courseFromDict } from "./models.js";

const BACKUP_KIND = "asistencia-facial-respaldo";
const BACKUP_VERSION = 1;

export async function exportBackup() {
  const [courses, books, settings, users] = await Promise.all(
    ["courses", "books", "settings", "users"].map(getAllRecords));
  return JSON.stringify({
    kind: BACKUP_KIND, version: BACKUP_VERSION, exported_at: new Date().toISOString(),
    courses, books, settings, users,
  }, null, 2);
}

export const backupFileName = (moment = new Date()) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `AsistenciaFacial_respaldo_${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}.json`;
};

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AppError(`El archivo no es un JSON válido (${error.message}).`);
  }
}

async function replaceAll(data) {
  const validCourses = data.courses.map((raw) => JSON.parse(JSON.stringify(courseFromDict(raw))));
  for (const store of ["courses", "books", "settings", "users"]) await clearStore(store);
  for (const course of validCourses) await putRecord("courses", course);
  for (const book of data.books ?? []) await putRecord("books", book);
  for (const setting of data.settings ?? []) await putRecord("settings", setting);
  for (const user of data.users ?? []) await putRecord("users", user);
  return `Respaldo restaurado: ${validCourses.length} curso(s) y ${(data.users ?? []).length} usuario(s).`;
}

/**
 * Importa un respaldo de esta aplicación (reemplaza todo) o, de la app de escritorio,
 * un curso.json (agrega el curso) o un usuarios.json (agrega las cuentas).
 */
export async function importBackup(text) {
  const data = parseJson(text);
  if (data?.kind === BACKUP_KIND && Array.isArray(data.courses)) return replaceAll(data);
  if (data?.course_id && Array.isArray(data.students)) {
    const course = courseFromDict(data);
    await putRecord("courses", JSON.parse(JSON.stringify(course)));
    return `Curso «${course.name}» importado con ${course.students.length} estudiante(s).`;
  }
  if (Array.isArray(data?.users)) {
    for (const user of data.users) await putRecord("users", { remembered: false, iterations: 200000, ...user, username: user.username || user.cedula });
    return `${data.users.length} usuario(s) importado(s).`;
  }
  throw new AppError("El archivo no es un respaldo de Asistencia Facial.");
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
