import { FIRST_DATE_COLUMN } from "./attendance.js";
import { ValidationError } from "./errors.js";
import { formatDateTime } from "./models.js";
import { nameSortKey } from "./validators.js";

const FIXED = FIRST_DATE_COLUMN - 1;
const FIXED_TITLES = ["Cédula", "Apellidos y nombres", "% Asistencia"];
const flat = (args) => args.flat();
const FUNCTIONS = Object.freeze({
  SUM: (...a) => flat(a).reduce((x, y) => x + y, 0),
  AVERAGE: (...a) => { const v = flat(a); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0; },
  MIN: (...a) => Math.min(...flat(a)), MAX: (...a) => Math.max(...flat(a)), COUNT: (...a) => flat(a).length,
  MEDIAN: (...a) => { const v = flat(a).sort((x, y) => x - y); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; },
  ROUND: (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n, ABS: (x) => Math.abs(x),
});
const byName = (a, b) => nameSortKey(a.name).localeCompare(nameSortKey(b.name));
const sortedRows = (rows) => [...rows].sort(byName);

export const normalize = (book) => ({
  ...book, extras: book.extras ?? [],
  hidden: { cols: book.hidden?.cols ?? [], rows: book.hidden?.rows ?? [] },
});
export { columnLetter as columnLetterOf } from "./attendance.js";
export const columnCount = (book) => FIXED + book.columns.length + book.extras.length;
export const kindOf = (book, col) => (col <= FIXED ? "fixed" : col <= FIXED + book.columns.length ? "date" : "extra");
const dateAt = (book, col) => book.columns[col - FIRST_DATE_COLUMN];
const extraAt = (book, col) => book.extras[col - FIRST_DATE_COLUMN - book.columns.length];

export function columnKey(book, col) {
  const kind = kindOf(book, col);
  return kind === "fixed" ? `f${col}` : kind === "date" ? `d${dateAt(book, col).moment}` : extraAt(book, col).key;
}
export function titleOf(book, col) {
  const kind = kindOf(book, col);
  return kind === "fixed" ? FIXED_TITLES[col - 1] : kind === "date" ? formatDateTime(new Date(dateAt(book, col).moment)) : extraAt(book, col).title;
}
/** Texto original de la celda (la fórmula, no su resultado). */
export function rawOf(book, col, row) {
  return kindOf(book, col) === "extra" ? (extraAt(book, col).cells[row.id] ?? "") : String(display(book, col, row));
}
export const isEditable = (book, col) => col === 2 || kindOf(book, col) !== "fixed";
export const visibleColumns = (book) =>
  Array.from({ length: columnCount(book) }, (_, i) => i + 1).filter((col) => !book.hidden.cols.includes(columnKey(book, col)));
export const visibleRows = (book) => book.rows.filter((row) => !book.hidden.rows.includes(row.id));

export function percentOf(book, row) {
  const marks = book.columns.map((c) => c.marks[row.id]).filter((m) => m !== undefined);
  return marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
}

/** Valor mostrado en una celda (calcula % y fórmulas). */
export function display(book, col, row, depth = 0) {
  const kind = kindOf(book, col);
  if (col === 1) return row.id;
  if (col === 2) return row.name;
  if (col === 3) { const p = percentOf(book, row); return p === null ? "" : `${Math.round(p * 100)}%`; }
  if (kind === "date") return dateAt(book, col).marks[row.id] ?? "";
  const text = extraAt(book, col).cells[row.id] ?? "";
  return text.startsWith("=") ? evaluate(book, text, depth) : text;
}

const lettersToNumber = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
function numberAt(book, letters, line, depth) {
  const row = book.rows[line - 2];
  const col = lettersToNumber(letters);
  if (!row || col < 1 || col > columnCount(book)) return null;
  if (col === 3) return percentOf(book, row);
  const value = display(book, col, row, depth + 1);
  return value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}

/** Evalúa "=SUM(D2:F2)/3", "=AVERAGE(D2:D40)", "=D2+E2*2"… Solo admite números, operadores y las funciones de la lista. */
export function evaluate(book, formula, depth = 0) {
  if (depth > 5) return "#CIRCULAR";
  try {
    const expr = formula.slice(1).toUpperCase()
      .replace(/([A-Z]+)(\d+):([A-Z]+)(\d+)/g, (_, c1, r1, c2, r2) => {
        const values = [];
        for (let c = lettersToNumber(c1); c <= lettersToNumber(c2); c += 1) {
          for (let r = Number(r1); r <= Number(r2); r += 1) {
            const v = numberAt(book, String.fromCharCode(64 + c), r, depth);
            if (v !== null) values.push(v);
          }
        }
        return `[${values.join(",")}]`;
      })
      .replace(/\b([A-Z]+)(\d+)\b/g, (_, c, r) => numberAt(book, c, Number(r), depth) ?? 0)
      .replace(/\b(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN|ROUND|ABS)\(/g, "F.$1(");
    if (!/^[\d\s+\-*/().,[\]]*$/.test(expr.replace(/F\.(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN|ROUND|ABS)/g, ""))) return "#ERROR";
    const result = new Function("F", `"use strict"; return (${expr});`)(FUNCTIONS);
    return Number.isFinite(result) ? String(Math.round(result * 100) / 100) : "#ERROR";
  } catch {
    return "#ERROR";
  }
}

export function setCell(book, col, id, text) {
  const value = text.trim();
  const kind = kindOf(book, col);
  if (id === "") {
    if (kind !== "extra" || !value) return book;
    return { ...book, extras: book.extras.map((e, i) => (i === col - FIRST_DATE_COLUMN - book.columns.length ? { ...e, title: value } : e)) };
  }
  if (col === 2) {
    if (!value) throw new ValidationError("El nombre no puede quedar vacío.");
    return { ...book, rows: sortedRows(book.rows.map((r) => (r.id === id ? { ...r, name: value.toUpperCase() } : r))) };
  }
  if (kind === "date") {
    if (value !== "" && value !== "0" && value !== "1") throw new ValidationError("En una fecha de asistencia solo se admite 0, 1 o vacío.");
    const index = col - FIRST_DATE_COLUMN;
    return { ...book, columns: book.columns.map((c, i) => {
      if (i !== index) return c;
      const { [id]: _removed, ...rest } = c.marks;
      return { ...c, marks: value === "" ? rest : { ...rest, [id]: Number(value) } };
    }) };
  }
  if (kind === "extra") {
    const index = col - FIRST_DATE_COLUMN - book.columns.length;
    return { ...book, extras: book.extras.map((e, i) => {
      if (i !== index) return e;
      const { [id]: _removed, ...rest } = e.cells;
      return { ...e, cells: value === "" ? rest : { ...rest, [id]: value } };
    }) };
  }
  return book;
}

export const addExtra = (book, title) =>
  ({ ...book, extras: [...book.extras, { key: `x${Date.now().toString(36)}${book.extras.length}`, title: title.trim() || "Nueva columna", cells: {} }] });

export function removeColumn(book, col) {
  const kind = kindOf(book, col);
  if (kind === "fixed") throw new ValidationError("Las 3 primeras columnas no se pueden eliminar.");
  return kind === "date"
    ? { ...book, columns: book.columns.filter((_, i) => i !== col - FIRST_DATE_COLUMN) }
    : { ...book, extras: book.extras.filter((_, i) => i !== col - FIRST_DATE_COLUMN - book.columns.length) };
}

export const hideColumn = (book, col) => ({ ...book, hidden: { ...book.hidden, cols: [...new Set([...book.hidden.cols, columnKey(book, col)])] } });
export const hideRow = (book, id) => ({ ...book, hidden: { ...book.hidden, rows: [...new Set([...book.hidden.rows, id])] } });
export const showAll = (book) => ({ ...book, hidden: { cols: [], rows: [] } });
export const addRow = (book, { id, name }) =>
  (book.rows.some((r) => r.id === id) ? book : { ...book, rows: sortedRows([...book.rows, { id, name }]) });
export const removeRow = (book, id) => ({ ...book, rows: book.rows.filter((r) => r.id !== id) });

/** Fusiona lo importado: lo ya existente manda; se ordena por apellidos y por fecha. */
export function mergeImport(book, parsed) {
  const known = new Set(book.rows.map((r) => r.id));
  const rows = sortedRows([...book.rows, ...parsed.students.filter((s) => !known.has(s.id))]);
  const columns = [...book.columns];
  for (const date of parsed.dates) {
    const at = columns.findIndex((c) => c.moment === date.moment);
    if (at < 0) columns.push({ moment: date.moment, marks: { ...date.marks } });
    else columns[at] = { ...columns[at], marks: { ...date.marks, ...columns[at].marks } };
  }
  columns.sort((a, b) => a.moment - b.moment);
  let result = { ...book, rows, columns };
  for (const extra of parsed.extras) {
    const at = result.extras.findIndex((e) => e.title.toLowerCase() === extra.title.toLowerCase());
    if (at < 0) result = { ...addExtra(result, extra.title), };
    const index = at < 0 ? result.extras.length - 1 : at;
    result = { ...result, extras: result.extras.map((e, i) => (i === index ? { ...e, cells: { ...extra.cells, ...e.cells } } : e)) };
  }
  return result;
}
