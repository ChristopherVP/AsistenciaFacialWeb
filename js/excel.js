import {
  FIRST_DATE_COLUMN, PERCENT_COLUMN, PERCENT_HEADER, columnLetter,
} from "./attendance.js";
import { COLORS } from "./config.js";

const HEADER_STYLE = Object.freeze({
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: COLORS.primary.slice(1) } },
  alignment: { horizontal: "center", vertical: "center" },
});
const CENTER = Object.freeze({ alignment: { horizontal: "center" } });
const PERCENT_STYLE = Object.freeze({ font: { bold: true }, alignment: { horizontal: "center" }, numFmt: "0%" });
const DATE_FORMAT = "DD/MM/YYYY HH:MM";

/** Número de serie de Excel (hora local, sin zona horaria). */
export function excelSerial(timestamp) {
  const moment = new Date(timestamp);
  const utc = Date.UTC(moment.getFullYear(), moment.getMonth(), moment.getDate(), moment.getHours(), moment.getMinutes());
  return utc / 86_400_000 + 25_569;
}

/** Construye la hoja con las mismas columnas, fórmula de % y estilos que la app de escritorio. */
export function buildSheet(XLSX, book) {
  const sheet = {};
  const put = (column, row, cell) => { sheet[XLSX.utils.encode_cell({ c: column - 1, r: row - 1 })] = cell; };
  put(1, 1, { t: "s", v: "Cédula", s: HEADER_STYLE });
  put(2, 1, { t: "s", v: "Apellidos y nombres", s: HEADER_STYLE });
  put(PERCENT_COLUMN, 1, { t: "s", v: PERCENT_HEADER, s: HEADER_STYLE });
  book.columns.forEach((column, index) => {
    put(FIRST_DATE_COLUMN + index, 1, { t: "n", v: excelSerial(column.moment), z: DATE_FORMAT, s: HEADER_STYLE });
  });
  book.rows.forEach((row, index) => {
    const line = index + 2;
    const span = `${columnLetter(FIRST_DATE_COLUMN)}${line}:XFD${line}`;
    put(1, line, { t: "s", v: row.id });
    put(2, line, { t: "s", v: row.name });
    put(PERCENT_COLUMN, line, {
      t: "n", f: `IF(COUNT(${span})=0,"",SUM(${span})/COUNT(${span}))`, z: "0%", s: PERCENT_STYLE,
    });
    book.columns.forEach((column, columnIndex) => {
      const mark = column.marks[row.id];
      if (mark !== undefined) put(FIRST_DATE_COLUMN + columnIndex, line, { t: "n", v: mark, s: CENTER });
    });
  });
  const lastColumn = FIRST_DATE_COLUMN + Math.max(book.columns.length, 1) - 1;
  sheet["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: lastColumn - 1, r: Math.max(book.rows.length, 1) } });
  sheet["!cols"] = [{ wch: 16 }, { wch: 38 }, { wch: 15 }, ...book.columns.map(() => ({ wch: 18 }))];
  return sheet;
}

export function buildWorkbookBytes(XLSX, book) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSheet(XLSX, book), book.sheet_title || "Asistencia");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

let xlsxPromise = null;

/** Carga SheetJS (con estilos) la primera vez que se necesita. */
export function loadXlsx() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  xlsxPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("../vendor/xlsx.bundle.js", import.meta.url).href;
    script.onload = () => resolve(globalThis.XLSX);
    script.onerror = () => { xlsxPromise = null; reject(new Error("No se pudo cargar la librería de Excel.")); };
    document.head.append(script);
  });
  return xlsxPromise;
}
