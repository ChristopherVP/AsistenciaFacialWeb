import { loadXlsx } from "./excel.js";
import { validateCedula, nameSortKey } from "./validators.js";

const text = (value) => String(value ?? "").trim();
const DATE_TEXT = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;
const floorMinute = (ms) => Math.floor(ms / 60000) * 60000;

/** Encabezado de fecha: serie de Excel o "DD/MM/AAAA [HH:MM]". Devuelve milisegundos o null. */
export function toMoment(value) {
  if (typeof value === "number" && value > 30000 && value < 80000) {
    return floorMinute(new Date(1899, 11, 30).getTime() + Math.round(value * 86_400_000));
  }
  const m = DATE_TEXT.exec(text(value));
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime() : null;
}

export function normalizeCedula(value) {
  const digits = text(value).replace(/\D/g, "");
  return digits.length === 9 ? `0${digits}` : digits; // Excel pierde el cero inicial
}

/** Convierte las filas de una hoja en estudiantes, fechas y columnas extra. */
export function parseRows(rows) {
  const headerAt = rows.findIndex((row) => row.some((cell) => nameSortKey(text(cell)).startsWith("cedula")));
  if (headerAt < 0) throw new Error("No encontré una columna «Cédula» en el Excel.");
  const header = rows[headerAt];
  const key = (cell) => nameSortKey(text(cell));
  const idCol = header.findIndex((cell) => key(cell).startsWith("cedula"));
  const nameCols = header.map((cell, i) => [key(cell), i]).filter(([k]) => k.includes("apellido") || k.includes("nombre")).map(([, i]) => i);
  if (!nameCols.length) throw new Error("No encontré la columna «Apellidos y nombres».");
  const students = []; const skipped = []; const dates = []; const extras = [];
  header.forEach((cell, col) => {
    if (col === idCol || nameCols.includes(col) || !text(cell) || key(cell).includes("asistencia")) return;
    const moment = toMoment(cell);
    (moment === null ? extras : dates).push({ col, moment, title: text(cell), marks: {}, cells: {} });
  });
  for (const row of rows.slice(headerAt + 1)) {
    const name = nameCols.map((i) => text(row[i])).filter(Boolean).join(" ").toUpperCase();
    const id = normalizeCedula(row[idCol]);
    if (!id && !name) continue;
    try { validateCedula(id); } catch (error) { skipped.push(`${id || "(vacía)"}: ${error.message}`); continue; }
    if (!name) { skipped.push(`${id}: sin nombre`); continue; }
    students.push({ id, name });
    for (const date of dates) { const v = Number(row[date.col]); if (text(row[date.col]) !== "" && (v === 0 || v === 1)) date.marks[id] = v; }
    for (const extra of extras) if (text(row[extra.col]) !== "") extra.cells[id] = text(row[extra.col]);
  }
  return { students, dates, extras, skipped };
}

export async function parseWorkbook(file) {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("El archivo no tiene hojas.");
  return parseRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }));
}
