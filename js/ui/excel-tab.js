import { downloadBlob } from "../backup.js";
import { buildWorkbookBytes, loadXlsx } from "../excel.js";
import { parseWorkbook } from "../excel-import.js";
import { courseAddStudent, createStudent, formatDateTime } from "../models.js";
import * as sheet from "../sheet-model.js";
import { excelFileName } from "../storage.js";
import { normalizeFullName, validateCedula } from "../validators.js";
import { h } from "./dom.js";
import { showInfo, showError } from "./messagebox.js";

const REFRESH_MS = 2000;
const SHEET_HTML = "<header class=\"bar\"><button class=\"btn\" id=\"volver\" type=\"button\">← Volver</button><h1 id=\"titulo\"></h1><button class=\"btn btn-success\" id=\"descargar\" type=\"button\">⬇ Descargar .xlsx</button><input id=\"archivo\" type=\"file\" accept=\".xlsx,.xls\" hidden></header><nav class=\"tools\" aria-label=\"Herramientas de la hoja\">\n    <div class=\"group\"><button id=\"deshacer\" type=\"button\" title=\"Deshacer (Ctrl+Z)\">↶ Deshacer</button><button id=\"rehacer\" type=\"button\" title=\"Rehacer (Ctrl+Y)\">↷ Rehacer</button></div>\n    <div class=\"group\"><button id=\"importar\" type=\"button\">⬆ Importar</button></div>\n    <div class=\"group\"><button id=\"col-nueva\" type=\"button\">➕ Columna</button><button id=\"col-borrar\" type=\"button\" title=\"Elimina la columna de la celda activa\">🗑 Eliminar columnas</button></div>\n    <div class=\"group\"><button id=\"est-nuevo\" type=\"button\">➕ Fila (estudiante)</button><button id=\"fila-borrar\" type=\"button\" title=\"Elimina la fila de la celda activa\">🗑 Eliminar filas</button></div>\n    <div class=\"group\"><button id=\"ocultar-col\" type=\"button\">🙈 Ocultar columnas</button><button id=\"ocultar-fila\" type=\"button\">🙈 Ocultar filas</button><button id=\"mostrar\" type=\"button\">👁 Mostrar todo</button></div>\n  </nav>\n  <div class=\"fbar\"><input id=\"celda\" aria-label=\"Celda activa\" readonly><strong>fx</strong><input id=\"formula\" aria-label=\"Contenido de la celda\" placeholder=\"Seleccione una celda. Fórmulas: =SUM(D2:F2), =AVERAGE, =MIN, =MAX, =COUNT, =MEDIAN, =ROUND(D2/3,1)\"></div>\n  <main class=\"sheet-wrap\" id=\"hoja\" aria-live=\"polite\"></main><footer class=\"tabs-bottom\"><span class=\"sheet-tab\" id=\"nombre-hoja\">Asistencia</span><span class=\"hint\" id=\"estado\"></span></footer>";
const TYPE_TEXT = "Hoja de cálculo de Excel";

/** Hoja de asistencia de UN curso (editable como Excel). Devuelve { refresh, destroy }. */
function mountSheet(root, { state, courseId, onBack }) {
  root.innerHTML = SHEET_HTML;
  const $ = (id) => root.querySelector(`#${id}`);
  const books = state.bookRepository;
  const offs = [];
  const on = (target, type, handler) => { target.addEventListener(type, handler); offs.push(() => target.removeEventListener(type, handler)); };
  const box = $("hoja"); const status = $("estado");
  const past = []; const future = [];
  let current = state.repository.get(courseId); let book = null; let lastJson = "";
  let menu = null; let editing = null; let dragging = null; let selMode = "cell"; let baseStatus = "";
  let drafts = new Map(); let blankRows = 0;
  let grid = { cols: [], rows: [] }; let anchor = { c: 0, r: 1 }; let focus = { c: 0, r: 1 };
  box.tabIndex = 0;

const say = (message) => { status.textContent = message; };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const BLANK_COLS = 8; const MIN_ROWS = 30;
const maxC = () => grid.cols.length + BLANK_COLS - 1;
const maxR = () => grid.rows.length + blankRows; // fila 0 = encabezados
const isBlankCol = (c) => c >= grid.cols.length;
const isBlankRow = (r) => r > grid.rows.length;
const rowAt = (r) => (r === 0 ? null : grid.rows[r - 1]);
const idAt = (r) => rowAt(r)?.id ?? "";
const range = () => ({ c1: Math.min(anchor.c, focus.c), c2: Math.max(anchor.c, focus.c), r1: Math.min(anchor.r, focus.r), r2: Math.max(anchor.r, focus.r) });
const tdAt = (c, r) => box.querySelector(`td[data-c="${c}"][data-r="${r}"]`);
const colNumberAt = (c) => (isBlankCol(c) ? sheet.columnCount(book) + 1 + (c - grid.cols.length) : grid.cols[c]);
const draftAt = (c, r) => { const col = grid.cols[c]; return col === 1 || col === 2 ? (drafts.get(r - grid.rows.length)?.[col === 1 ? "id" : "name"] ?? "") : ""; };
const editableAt = (c, r) => {
  if (isBlankCol(c)) return r === 0; // el encabezado de una columna vacía crea la columna
  if (isBlankRow(r)) return grid.cols[c] === 1 || grid.cols[c] === 2; // cédula y nombre de un estudiante nuevo
  return r === 0 ? sheet.kindOf(book, grid.cols[c]) === "extra" : sheet.isEditable(book, grid.cols[c]);
};
const textAt = (c, r) => (isBlankCol(c) ? "" : isBlankRow(r) ? draftAt(c, r) : r === 0 ? sheet.titleOf(book, grid.cols[c]) : String(sheet.display(book, grid.cols[c], rowAt(r))));
const rawAt = (c, r) => (isBlankCol(c) ? "" : isBlankRow(r) ? draftAt(c, r) : r === 0 ? sheet.titleOf(book, grid.cols[c]) : sheet.rawOf(book, grid.cols[c], rowAt(r)));
const cellRef = (c, r) => `${sheet.columnLetterOf(colNumberAt(c))}${r === 0 ? 1 : isBlankRow(r) ? book.rows.length + 1 + (r - grid.rows.length) : book.rows.indexOf(rowAt(r)) + 2}`;
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- Dibujo ---------- */

function render() {
  closeMenu(); editing = null;
  $("deshacer").disabled = !past.length; $("rehacer").disabled = !future.length;
  grid = { cols: [], rows: [] };
  if (!current) { box.replaceChildren(h("p", { class: "empty" }, "Aún no hay cursos. Cree uno en el programa.")); return; }
  if (!book) { box.replaceChildren(h("p", { class: "empty" }, "Este curso aún no tiene Excel. Importe uno o registre un estudiante.")); return; }
  grid = { cols: sheet.visibleColumns(book), rows: sheet.visibleRows(book) };
  blankRows = Math.max(MIN_ROWS - grid.rows.length, 10);
  anchor = { c: clamp(anchor.c, 0, maxC()), r: clamp(anchor.r, 0, maxR()) };
  focus = { c: clamp(focus.c, 0, maxC()), r: clamp(focus.r, 0, maxR()) };
  const cell = (c, r) => {
    if (isBlankCol(c) || isBlankRow(r)) {
      return h("td", { class: "blank", "data-c": c, "data-r": r, "data-col": grid.cols[c] ?? "", "data-id": "", contenteditable: "false" }, textAt(c, r));
    }
    const col = grid.cols[c]; const row = grid.rows[r - 1];
    const value = sheet.display(book, col, row); const kind = sheet.kindOf(book, col);
    const cls = col === 3 ? "pct" : kind === "fixed" ? "" : `mark${value === 1 ? " yes" : value === 0 ? " no" : ""}`;
    return h("td", { class: cls, "data-c": c, "data-r": r, "data-col": col, "data-id": row.id, contenteditable: "false" }, String(value));
  };
  const columns = Array.from({ length: maxC() + 1 }, (_, c) => c);
  const letters = h("tr", {}, h("th", { class: "corner", title: "Seleccionar todo" }), columns.map((c) => h("th", { scope: "col", "data-hc": c }, sheet.columnLetterOf(colNumberAt(c)))));
  const titles = h("tr", {}, h("th", { "data-hr": 0 }, "1"), columns.map((c) => (isBlankCol(c)
    ? h("td", { class: "head blank", "data-c": c, "data-r": 0, "data-col": "", "data-id": "", contenteditable: "false", title: "Escriba aquí el nombre de una columna nueva" }, "")
    : h("td", { class: "head", "data-c": c, "data-r": 0, "data-col": grid.cols[c], "data-id": "", contenteditable: "false" }, sheet.titleOf(book, grid.cols[c])))));
  const body = Array.from({ length: maxR() }, (_, i) => {
    const row = grid.rows[i];
    const number = row ? book.rows.indexOf(row) + 2 : book.rows.length + 2 + (i - grid.rows.length);
    return h("tr", {}, h("th", { "data-hr": i + 1 }, String(number)), columns.map((c) => cell(c, i + 1)));
  });
  box.replaceChildren(h("table", { class: "sheet", "aria-label": `Asistencia de ${current.name}` }, h("thead", {}, letters), h("tbody", {}, titles, body)));
  const hidden = book.hidden.cols.length + book.hidden.rows.length;
  baseStatus = `${book.rows.length} estudiante(s) · ${book.columns.length} lista(s) · escriba en las filas vacías para agregar estudiantes y en la fila 1 para columnas nuevas${hidden ? ` · ${hidden} oculta(s): clic derecho → Mostrar` : ""}`;
  paint();
}

function paint(scroll = false) {
  box.querySelectorAll(".sel,.cur,.hl").forEach((el) => el.classList.remove("sel", "cur", "hl"));
  if (!book || !grid.cols.length) return;
  const { c1, c2, r1, r2 } = range();
  let cells = 0; let count = 0; let sum = 0;
  for (let r = r1; r <= r2; r += 1) {
    box.querySelector(`th[data-hr="${r}"]`)?.classList.add("hl");
    for (let c = c1; c <= c2; c += 1) {
      tdAt(c, r)?.classList.add("sel");
      cells += 1;
      const value = r > 0 ? textAt(c, r).trim() : "";
      if (value !== "" && Number.isFinite(Number(value))) { count += 1; sum += Number(value); }
    }
  }
  for (let c = c1; c <= c2; c += 1) box.querySelector(`th[data-hc="${c}"]`)?.classList.add("hl");
  const cur = tdAt(focus.c, focus.r);
  cur?.classList.add("cur");
  if (scroll) cur?.scrollIntoView({ block: "nearest", inline: "nearest" });
  $("celda").value = cells === 1 ? cellRef(focus.c, focus.r) : `${cellRef(c1, r1)}:${cellRef(c2, r2)}`;
  $("formula").value = rawAt(focus.c, focus.r);
  status.textContent = cells > 1
    ? `${cells} celdas seleccionadas${count ? ` · Recuento: ${count} · Suma: ${round2(sum)} · Promedio: ${round2(sum / count)}` : ""}`
    : baseStatus;
}

function setSelection(a, f, mode, scroll = false) {
  let from = a; let to = f;
  if (mode === "col") { from = { c: a.c, r: maxR() }; to = { c: f.c, r: 0 }; }
  else if (mode === "row") { from = { c: maxC(), r: a.r }; to = { c: 0, r: f.r }; }
  else if (mode === "all") { from = { c: maxC(), r: maxR() }; to = { c: 0, r: 0 }; }
  anchor = from; focus = to; selMode = mode;
  paint(scroll);
}

/* ---------- Cambios (con deshacer / rehacer) ---------- */

async function apply(change, record = true) {
  try {
    const before = book ? JSON.stringify(book) : null;
    book = sheet.normalize(change(book ?? sheet.normalize({ course_id: current.course_id, sheet_title: current.name, rows: [], columns: [] })));
    if (record && before) { past.push(before); if (past.length > 50) past.shift(); future.length = 0; }
    await books.save(book);
    lastJson = JSON.stringify(book);
  } catch (error) {
    say(`⚠ ${error.message}`);
  }
  render();
}

async function stepHistory(from, to) {
  if (!from.length || !book) return;
  to.push(JSON.stringify(book));
  const restored = JSON.parse(from.pop());
  await apply(() => restored, false);
}

/** Agrega al curso los estudiantes nuevos SIN rostro (quedan pendientes de registro facial). */
async function addPending(list) {
  const have = new Set(current.students.map((s) => s.student_id));
  const fresh = list.filter((s) => !have.has(s.id));
  if (!fresh.length) return 0;
  const course = fresh.reduce((acc, s) => courseAddStudent(acc, createStudent(s.id, s.name, [])), current);
  await state.repository.save(course);
  current = course;
  state.notifyCoursesChanged();
  return fresh.length;
}

/** Lleva el cursor a la primera fila vacía para escribir la cédula (como en Excel). */
function addStudent() {
  const c = grid.cols.indexOf(1);
  if (c < 0) { say("⚠ La columna Cédula está oculta: use «Mostrar todo»."); return; }
  const r = grid.rows.length + 1;
  setSelection({ c, r }, { c, r }, "cell", true);
  startEdit(c, r);
}

function completeDraft(k) {
  drafts.delete(k);
  drafts = new Map([...drafts].map(([key, value]) => [key > k ? key - 1 : key, value]));
}

/** Cédula + nombre completos en una fila vacía: se guarda el estudiante en el curso y en la hoja. */
async function draftCell(col, k, text) {
  const field = col === 1 ? "id" : "name";
  const draft = { id: "", name: "", ...drafts.get(k), [field]: text };
  try {
    if (draft.id) draft.id = validateCedula(draft.id);
    if (draft.name) draft.name = normalizeFullName(draft.name);
  } catch (error) {
    draft[field] = ""; drafts.set(k, draft); render(); say(`⚠ ${error.message}`); return;
  }
  if (!draft.id || !draft.name) {
    if (draft.id || draft.name) drafts.set(k, draft); else drafts.delete(k);
    render();
    say(draft.id ? "Falta el nombre y apellidos para guardar al estudiante." : draft.name ? "Falta la cédula para guardar al estudiante." : baseStatus);
    return;
  }
  if (book.rows.some((row) => row.id === draft.id)) { draft.id = ""; drafts.set(k, draft); render(); say("⚠ Esa cédula ya está en la hoja."); return; }
  try { await addPending([draft]); } catch (error) { render(); say(`⚠ ${error.message}`); return; }
  completeDraft(k);
  await apply((b) => sheet.addRow(b, draft));
  say("✔ Estudiante guardado en el curso. Falta registrar su rostro en la pestaña Cursos.");
}

/** Guarda lo escrito en una celda (existente o vacía). */
async function commitText(c, r, col, id, text) {
  if (isBlankCol(c)) { if (text) await apply((b) => sheet.addExtra(b, text)); else render(); return; } // columna nueva
  if (isBlankRow(r)) { await draftCell(col, r - grid.rows.length, text); return; } // estudiante nuevo
  await apply((b) => sheet.setCell(b, col, id, text));
}

async function importFile(file) {
  try {
    const parsed = await parseWorkbook(file);
    const note = parsed.skipped.length ? `\n${parsed.skipped.length} fila(s) omitidas por cédula inválida.` : "";
    if (!confirm(`Se importarán ${parsed.students.length} estudiante(s), ${parsed.dates.length} fecha(s) y ${parsed.extras.length} columna(s) extra.${note}\n\nQuedarán ordenados por apellidos. ¿Continuar?`)) return;
    const added = await addPending(parsed.students);
    await apply((b) => sheet.mergeImport(b, parsed));
    say(`✔ Importado. ${added} estudiante(s) nuevo(s) deben terminar su registro facial en Cursos.`);
  } catch (error) {
    say(`⚠ ${error.message}`);
  }
}

const newColumn = () => { // cursor al encabezado de la primera columna vacía
  const c = grid.cols.length;
  setSelection({ c, r: 0 }, { c, r: 0 }, "cell", true);
  startEdit(c, 0);
};

/* ---------- Acciones sobre la selección ---------- */

const selColumns = () => grid.cols.slice(range().c1, range().c2 + 1);
const selRowIds = () => grid.rows.slice(Math.max(range().r1, 1) - 1, range().r2).map((row) => row.id);

function hideCols() {
  const cols = selColumns();
  if (cols.length) apply((b) => cols.reduce((acc, col) => sheet.hideColumn(acc, col), b));
}
function hideRows() {
  const ids = selRowIds();
  if (!ids.length) { say("⚠ Seleccione una o más filas de estudiantes."); return; }
  apply((b) => ids.reduce((acc, id) => sheet.hideRow(acc, id), b));
}
function deleteCols() {
  const cols = selColumns().filter((col) => sheet.kindOf(book, col) !== "fixed").sort((a, b) => b - a);
  if (!cols.length) { say("⚠ Las 3 primeras columnas no se pueden eliminar."); return; }
  if (confirm(`¿Eliminar ${cols.length} columna(s)?`)) apply((b) => cols.reduce((acc, col) => sheet.removeColumn(acc, col), b));
}
function deleteRows() {
  const ids = selRowIds();
  if (!ids.length) { say("⚠ Seleccione una o más filas de estudiantes."); return; }
  if (confirm(`¿Eliminar ${ids.length} fila(s) del Excel? (los estudiantes siguen en el curso)`)) apply((b) => ids.reduce((acc, id) => sheet.removeRow(acc, id), b));
}
function clearSelection() {
  const { c1, c2, r1, r2 } = range(); const jobs = [];
  for (let r = Math.max(r1, 1); r <= r2; r += 1) {
    if (isBlankRow(r)) { drafts.delete(r - grid.rows.length); continue; }
    for (let c = c1; c <= c2; c += 1) if (!isBlankCol(c) && editableAt(c, r) && grid.cols[c] !== 2) jobs.push([grid.cols[c], idAt(r)]);
  }
  if (jobs.length) apply((b) => jobs.reduce((acc, [col, id]) => sheet.setCell(acc, col, id, ""), b)); else render();
}
function fillDown() {
  const { c1, c2, r1, r2 } = range(); const top = Math.max(r1, 1); const jobs = [];
  if (isBlankRow(top)) return;
  for (let c = c1; c <= c2; c += 1) for (let r = top + 1; r <= r2; r += 1) if (!isBlankCol(c) && !isBlankRow(r) && editableAt(c, r) && grid.cols[c] !== 2) jobs.push([grid.cols[c], idAt(r), rawAt(c, top)]);
  if (jobs.length) apply((b) => jobs.reduce((acc, [col, id, v]) => sheet.setCell(acc, col, id, v), b));
}
function selectionText() {
  const { c1, c2, r1, r2 } = range(); const lines = [];
  for (let r = r1; r <= r2; r += 1) lines.push(Array.from({ length: c2 - c1 + 1 }, (_, i) => textAt(c1 + i, r)).join("\t"));
  return lines.join("\n");
}
function pasteText(text) {
  const { c1, r1 } = range(); const jobs = []; const fresh = new Map();
  text.replace(/\r/g, "").replace(/\n$/, "").split("\n").forEach((line, i) => line.split("\t").forEach((value, j) => {
    const c = c1 + j; const r = Math.max(r1, 1) + i;
    if (c > maxC() || isBlankCol(c)) return;
    if (isBlankRow(r)) { // filas vacías: cédula + nombre crean estudiantes nuevos
      const col = grid.cols[c];
      if (col === 1 || col === 2) fresh.set(i, { ...fresh.get(i), [col === 1 ? "id" : "name"]: value.trim() });
    } else if (editableAt(c, r)) jobs.push([grid.cols[c], idAt(r), value]);
  }));
  const students = new Map();
  for (const draft of fresh.values()) {
    try { if (draft.id && draft.name && !book.rows.some((row) => row.id === draft.id)) students.set(validateCedula(draft.id), { id: validateCedula(draft.id), name: normalizeFullName(draft.name) }); } catch { /* fila inválida: se omite */ }
  }
  const added = [...students.values()];
  if (!jobs.length && !added.length) { say("⚠ No hay dónde pegar ahí."); return; }
  (async () => {
    if (added.length) await addPending(added);
    await apply((b) => added.reduce((acc, student) => { try { return sheet.addRow(acc, student); } catch { return acc; } },
      jobs.reduce((acc, [col, id, value]) => { try { return sheet.setCell(acc, col, id, value); } catch { return acc; } }, b)));
    if (added.length) say(`✔ ${added.length} estudiante(s) guardados en el curso. Falta registrar su rostro en la pestaña Cursos.`);
  })();
}

/* ---------- Edición de una celda ---------- */

function startEdit(c, r, first = null) {
  if (!editableAt(c, r)) {
    say(isBlankCol(c) ? "Primero escriba el nombre de la columna en su encabezado (fila 1)." : isBlankRow(r) ? "Para agregar un estudiante use las columnas Cédula y Apellidos y nombres." : "⚠ Esa celda no se puede editar.");
    return;
  }
  const td = tdAt(c, r); const original = rawAt(c, r);
  td.contentEditable = "true";
  td.textContent = first ?? original;
  editing = { td, c, r, original, col: grid.cols[c], id: idAt(r) };
  td.focus();
  const caret = document.createRange(); caret.selectNodeContents(td); caret.collapse(false);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(caret);
}

async function commitEdit(dc = 0, dr = 0) {
  if (!editing) return;
  const { td, c, r, col, id, original } = editing; const text = td.textContent.trim();
  editing = null; td.contentEditable = "false";
  if (text !== original.trim()) await commitText(c, r, col, id, text); else td.textContent = textAt(c, r);
  const to = { c: clamp(c + dc, 0, maxC()), r: clamp(r + dr, 0, maxR()) };
  setSelection(to, to, "cell", true);
  box.focus({ preventScroll: true });
}

function cancelEdit() {
  if (!editing) return;
  const { td, c, r } = editing; editing = null; td.contentEditable = "false"; td.textContent = textAt(c, r);
  box.focus({ preventScroll: true });
}

/* ---------- Ratón ---------- */

function hit(target) {
  const td = target.closest?.("td[data-c]"); if (td) return { c: +td.dataset.c, r: +td.dataset.r, mode: "cell" };
  const hc = target.closest?.("th[data-hc]"); if (hc) return { c: +hc.dataset.hc, r: 0, mode: "col" };
  const hr = target.closest?.("th[data-hr]"); if (hr) return { c: 0, r: +hr.dataset.hr, mode: "row" };
  return target.closest?.("th.corner") ? { c: 0, r: 0, mode: "all" } : null;
}
const inSelection = (p) => { const { c1, c2, r1, r2 } = range(); return p.c >= c1 && p.c <= c2 && p.r >= r1 && p.r <= r2; };

box.addEventListener("mousedown", (event) => {
  if (!book) return;
  if (editing && editing.td.contains(event.target)) return;
  const point = hit(event.target);
  if (editing) commitEdit();
  if (!point || (event.button === 2 && inSelection(point))) return;
  event.preventDefault();
  box.focus({ preventScroll: true });
  if (event.button !== 0) return;
  setSelection(event.shiftKey ? anchor : point, point, point.mode);
  dragging = point.mode;
});
on(document, "mousemove", (event) => {
  if (!dragging) return;
  if (event.buttons === 0) { dragging = null; return; }
  const point = hit(event.target);
  if (point && point.mode === dragging) setSelection(anchor, point, dragging);
});
on(document, "mouseup", () => { dragging = null; });
box.addEventListener("dblclick", (event) => { const point = hit(event.target); if (point?.mode === "cell") startEdit(point.c, point.r); });
box.addEventListener("focusout", (event) => { if (editing && event.target === editing.td) commitEdit(); });
box.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const point = hit(event.target);
  if (!point || !book) return;
  if (!inSelection(point)) setSelection(point, point, point.mode);
  openMenu(event);
});

function closeMenu() { menu?.remove(); menu = null; }
function openMenu(event) {
  closeMenu();
  const hidden = book.hidden.cols.length + book.hidden.rows.length;
  const items = [["🙈 Ocultar columnas", hideCols], ["🙈 Ocultar filas", hideRows]];
  if (hidden) items.push(["👁 Mostrar columnas y filas ocultas", () => apply(sheet.showAll)]);
  items.push(["🗑 Eliminar columnas", deleteCols], ["🗑 Eliminar filas (solo del Excel)", deleteRows], ["🧹 Borrar contenido (Supr)", clearSelection],
    ["➕ Agregar columna", newColumn], ["➕ Agregar estudiante", addStudent]);
  menu = h("div", { class: "ctx", role: "menu", style: `left:${Math.min(event.clientX, innerWidth - 240)}px;top:${Math.min(event.clientY, innerHeight - items.length * 36 - 10)}px` },
    items.map(([label, run]) => h("button", { type: "button", role: "menuitem", onClick: () => { closeMenu(); run(); } }, label)));
  document.body.append(menu);
  menu.querySelector("button").focus();
}

/* ---------- Teclado y portapapeles (como Excel) ---------- */

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function moveFocus(dc, dr, extend) {
  const to = { c: clamp(focus.c + dc, 0, maxC()), r: clamp(focus.r + dr, 0, maxR()) };
  setSelection(extend ? anchor : to, to, "cell", true);
}

box.addEventListener("keydown", (event) => {
  if (!book) return;
  const { key } = event;
  if (editing) {
    if (key === "Enter") { event.preventDefault(); commitEdit(0, event.shiftKey ? -1 : 1); }
    else if (key === "Tab") { event.preventDefault(); commitEdit(event.shiftKey ? -1 : 1, 0); }
    else if (key === "Escape") { event.preventDefault(); cancelEdit(); }
    return;
  }
  const mod = event.ctrlKey || event.metaKey;
  if (ARROWS[key]) {
    event.preventDefault();
    const [dc, dr] = ARROWS[key]; const big = mod ? 1000 : 1;
    moveFocus(dc * big, dr * big, event.shiftKey);
  } else if (mod) {
    const lower = key.toLowerCase();
    const actions = {
      a: () => setSelection({ c: 0, r: 0 }, { c: maxC(), r: maxR() }, "all"),
      z: () => (event.shiftKey ? stepHistory(future, past) : stepHistory(past, future)),
      y: () => stepHistory(future, past), d: fillDown, s: download, 9: hideRows, 0: hideCols,
      "-": () => (selMode === "row" ? deleteRows() : deleteCols()),
      home: () => setSelection({ c: 0, r: 0 }, { c: 0, r: 0 }, "cell", true),
    };
    if (actions[lower]) { event.preventDefault(); actions[lower](); }
  } else if (key === "Enter") { event.preventDefault(); moveFocus(0, event.shiftKey ? -1 : 1, false); }
  else if (key === "Tab") { event.preventDefault(); moveFocus(event.shiftKey ? -1 : 1, 0, false); }
  else if (key === "Home") { event.preventDefault(); moveFocus(-1000, 0, event.shiftKey); }
  else if (key === "End") { event.preventDefault(); moveFocus(1000, 0, event.shiftKey); }
  else if (key === "F2") { event.preventDefault(); startEdit(focus.c, focus.r); }
  else if (key === "Delete" || key === "Backspace") { event.preventDefault(); clearSelection(); }
  else if (key.length === 1 && !event.altKey) { event.preventDefault(); startEdit(focus.c, focus.r, key); }
});

const boxIsActive = () => !editing && book && document.activeElement === box;
on(document, "copy", (event) => { if (boxIsActive()) { event.clipboardData.setData("text/plain", selectionText()); event.preventDefault(); } });
on(document, "cut", (event) => { if (boxIsActive()) { event.clipboardData.setData("text/plain", selectionText()); event.preventDefault(); clearSelection(); } });
on(document, "paste", (event) => { if (boxIsActive()) { event.preventDefault(); pasteText(event.clipboardData.getData("text/plain")); } });

$("formula").addEventListener("keydown", (event) => {
  if (!book) return;
  if (event.key === "Escape") { paint(); box.focus(); return; }
  if (event.key !== "Enter") return;
  const { c, r } = focus;
  if (!editableAt(c, r)) { say("⚠ Esa celda no se puede editar."); return; }
  commitText(c, r, grid.cols[c], idAt(r), $("formula").value.trim()).then(() => box.focus());
});

/* ---------- Descarga y carga ---------- */

async function download() {
  if (!book) return;
  const XLSX = await loadXlsx();
  const bytes = buildWorkbookBytes(XLSX, structuredClone(book)); // copia: lo descargado no afecta al programa
  downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), excelFileName(current.name));
}


async function sync(force = false) {
  if ((editing || dragging) && !force) return;
  const course = state.repository.get(courseId);
  if (!course) { onBack(); return; } // el curso se eliminó
  current = course;
  const stored = await books.get(courseId);
  const next = stored ? sheet.normalize(stored) : null;
  if (!force && JSON.stringify(next) === lastJson) return;
  past.length = 0; future.length = 0;
  book = next ?? sheet.normalize({ course_id: courseId, sheet_title: current.name, rows: [], columns: [] }); // hoja en blanco hasta el primer cambio
  lastJson = JSON.stringify(next);
  $("titulo").textContent = `📗  ${excelFileName(current.name)}`;
  $("nombre-hoja").textContent = (book?.sheet_title || current.name).slice(0, 31);
  $("descargar").disabled = false;
  render();
}

on(document, "click", closeMenu);
on(document, "keydown", (event) => { if (event.key === "Escape") closeMenu(); });
$("volver").addEventListener("click", onBack);
$("col-nueva").addEventListener("click", newColumn);
$("est-nuevo").addEventListener("click", addStudent);
$("mostrar").addEventListener("click", () => apply(sheet.showAll));
$("descargar").addEventListener("click", download);
$("deshacer").addEventListener("click", () => stepHistory(past, future));
$("rehacer").addEventListener("click", () => stepHistory(future, past));
$("col-borrar").addEventListener("click", deleteCols);
$("fila-borrar").addEventListener("click", deleteRows);
$("ocultar-col").addEventListener("click", hideCols);
$("ocultar-fila").addEventListener("click", hideRows);
$("importar").addEventListener("click", () => $("archivo").click());
$("archivo").addEventListener("change", (event) => { const [file] = event.target.files; event.target.value = ""; if (file) importFile(file); });
sync(true);
const timer = setInterval(() => { if (!document.hidden && root.offsetParent !== null && !menu) sync(); }, REFRESH_MS);
return {
  refresh: () => sync(),
  isEditing: () => editing !== null,
  flush: () => commitEdit(),
  destroy() { clearInterval(timer); offs.forEach((off) => off()); closeMenu(); },
};
}

/** Pestaña Excel: lista de archivos (uno por curso, como carpeta de documentos) y editor al abrir uno. */
export class ExcelTab {
  constructor(state) {
    this._state = state;
    this._sheet = null;
    this._selected = null;
    this._token = 0;
    this.el = h("div", { class: "excel-tab" });
    state.subscribe(() => (this._sheet ? this._sheet.refresh() : this._renderList()));
    this._renderList();
  }

  activate() { if (!this._sheet) this._renderList(); }

  get hasPendingEdit() { return Boolean(this._sheet?.isEditing()); }

  flush() { return this._sheet ? this._sheet.flush() : Promise.resolve(); }

  open(courseId) {
    if (!this._state.repository.get(courseId)) return;
    this._sheet?.destroy();
    this._token += 1;
    const root = h("div", { class: "xl-root" });
    this.el.replaceChildren(root);
    this._sheet = mountSheet(root, { state: this._state, courseId, onBack: () => this._back() });
  }

  _back() {
    this._sheet?.destroy();
    this._sheet = null;
    this._renderList();
  }

  async _renderList() {
    const token = ++this._token;
    const courses = this._state.repository.courses;
    const stored = await Promise.all(courses.map((course) => this._state.bookRepository.get(course.course_id).catch(() => null)));
    if (token !== this._token || this._sheet) return;
    if (!courses.some((course) => course.course_id === this._selected)) this._selected = null;
    const rows = courses.map((course, index) => {
      const book = stored[index];
      const last = book?.columns?.length ? formatDateTime(new Date(Math.max(...book.columns.map((c) => c.moment)))) : "—";
      const row = h("tr", { tabindex: "0", "aria-selected": String(course.course_id === this._selected) },
        h("td", {}, h("span", { class: "xl-name" }, h("span", { "aria-hidden": "true" }, "📗"), excelFileName(course.name))),
        h("td", {}, last), h("td", { class: "center" }, String(book?.rows?.length ?? course.students.length)),
        h("td", { class: "center" }, String(book?.columns?.length ?? 0)), h("td", {}, TYPE_TEXT));
      row.addEventListener("click", () => this._select(course.course_id));
      row.addEventListener("dblclick", () => this.open(course.course_id));
      row.addEventListener("keydown", (event) => { if (event.key === "Enter") this.open(course.course_id); });
      row.dataset.id = course.course_id;
      return row;
    });
    const open = h("button", { type: "button", class: "btn btn-primary", onClick: () => this._withSelected((id) => this.open(id)) }, "📂  Abrir");
    const download = h("button", { type: "button", class: "btn", onClick: () => this._withSelected((id) => this._download(id)) }, "⬇  Descargar .xlsx");
    this._hint = h("p", { class: "hint", role: "status", style: "margin:8px 0 0" }, courses.length ? "Doble clic en un archivo para abrirlo y editarlo aquí mismo." : "");
    this.el.replaceChildren(h("div", { class: "xl-files card" }, h("div", { class: "card-body" },
      h("h2", { class: "card-title" }, "📁  Mis hojas de asistencia"),
      courses.length
        ? [h("div", { class: "row", style: "margin-bottom:10px" }, open, download),
          h("div", { class: "table-wrap", style: "--table-height:360px" }, h("table", { class: "table", "aria-label": "Archivos de Excel" },
            h("thead", {}, h("tr", {}, ["Nombre", "Última lista", "Estudiantes", "Listas", "Tipo"].map((title, i) => h("th", { scope: "col", class: i === 2 || i === 3 ? "center" : "" }, title)))),
            h("tbody", {}, rows))),
          this._hint]
        : h("p", { class: "hint", style: "text-align:center;padding:30px 0" }, "Aún no hay cursos.\nCree uno en la pestaña Cursos: su Excel aparecerá aquí como un archivo."))));
  }

  _select(courseId) {
    this._selected = courseId;
    this.el.querySelectorAll("tbody tr").forEach((row) => row.setAttribute("aria-selected", String(row.dataset.id === courseId)));
  }

  _withSelected(action) {
    if (!this._selected) { this._hint.textContent = "⚠ Seleccione un archivo de la lista."; return; }
    action(this._selected);
  }

  async _download(courseId) {
    const course = this._state.repository.get(courseId);
    try {
      const stored = await this._state.bookRepository.get(courseId);
      if (!stored) { await showInfo("El Excel aún no existe. Se crea al tomar la primera lista.", "Asistencia Facial"); return; }
      const XLSX = await loadXlsx();
      downloadBlob(new Blob([buildWorkbookBytes(XLSX, { ...stored, sheet_title: stored.sheet_title || course.name })],
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), excelFileName(course.name));
    } catch (error) {
      await showError(`No se pudo crear el Excel: ${error.message}`, "Asistencia Facial");
    }
  }
}
