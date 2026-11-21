import { downloadBlob } from "./backup.js";
import { buildWorkbookBytes, loadXlsx } from "./excel.js";
import { parseWorkbook } from "./excel-import.js";
import { courseAddStudent, createStudent } from "./models.js";
import * as sheet from "./sheet-model.js";
import { BookRepository, CourseRepository, excelFileName } from "./storage.js";
import { h } from "./ui/dom.js";
import { normalizeFullName, validateCedula } from "./validators.js";

const REFRESH_MS = 2000;
const books = new BookRepository();
const channel = globalThis.BroadcastChannel ? new BroadcastChannel("af-courses") : null;
const $ = (id) => document.getElementById(id);
const box = $("hoja"); const select = $("curso"); const status = $("estado");
const embedded = new URLSearchParams(location.search).has("embed") && window.parent !== window;
if (embedded) document.body.classList.add("embed");
const past = []; const future = [];
let repository = null; let courses = []; let current = null; let book = null; let lastJson = "";
let menu = null; let editing = null; let dragging = null; let selMode = "cell"; let baseStatus = "";
let grid = { cols: [], rows: [] }; let anchor = { c: 0, r: 1 }; let focus = { c: 0, r: 1 };

document.head.append(h("style", {}, `
  .sheet { user-select: none; -webkit-user-select: none; cursor: cell; }
  .sheet td.sel { background: #DCE9F5 !important; outline: 0; }
  .sheet td.head.sel { background: #2F6EA8 !important; }
  .sheet td.cur:not(.head) { background: #fff !important; }
  .sheet td.cur { outline: 2px solid #1E7B46 !important; outline-offset: -2px; }
  .sheet th.hl { background: #CFE0F1 !important; font-weight: 700; }
  .sheet td[contenteditable="true"] { user-select: text; -webkit-user-select: text; cursor: text; background: #fff !important; }
  #hoja:focus { outline: 0; }`));
box.tabIndex = 0;
$("ocultar-col").after(h("button", { id: "ocultar-fila", type: "button" }, "🙈 Ocultar filas"));
$("ocultar-col").textContent = "🙈 Ocultar columnas";
$("col-borrar").textContent = "🗑 Eliminar columnas";
$("fila-borrar").textContent = "🗑 Eliminar filas";

const say = (message) => { status.textContent = message; };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const maxC = () => grid.cols.length - 1;
const maxR = () => grid.rows.length; // fila 0 = encabezados
const rowAt = (r) => (r === 0 ? null : grid.rows[r - 1]);
const idAt = (r) => rowAt(r)?.id ?? "";
const range = () => ({ c1: Math.min(anchor.c, focus.c), c2: Math.max(anchor.c, focus.c), r1: Math.min(anchor.r, focus.r), r2: Math.max(anchor.r, focus.r) });
const tdAt = (c, r) => box.querySelector(`td[data-c="${c}"][data-r="${r}"]`);
const editableAt = (c, r) => (r === 0 ? sheet.kindOf(book, grid.cols[c]) === "extra" : sheet.isEditable(book, grid.cols[c]));
const textAt = (c, r) => (r === 0 ? sheet.titleOf(book, grid.cols[c]) : String(sheet.display(book, grid.cols[c], rowAt(r))));
const rawAt = (c, r) => (r === 0 ? sheet.titleOf(book, grid.cols[c]) : sheet.rawOf(book, grid.cols[c], rowAt(r)));
const cellRef = (c, r) => `${sheet.columnLetterOf(grid.cols[c])}${r === 0 ? 1 : book.rows.indexOf(rowAt(r)) + 2}`;
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- Volver al programa (siempre regresa) ---------- */

function goBack() {
  if (embedded) { parent.postMessage("af-volver", location.origin); return; } // dentro del programa: vuelve a la pestaña anterior
  try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch { /* el navegador puede negar el foco */ }
  window.close();
  // Si el navegador no deja cerrar esta pestaña, se vuelve al programa en la misma pestaña (la sesión y la pestaña se restauran).
  setTimeout(() => { location.href = "./index.html"; }, 300);
}

/* ---------- Dibujo ---------- */

function render() {
  closeMenu(); editing = null;
  $("deshacer").disabled = !past.length; $("rehacer").disabled = !future.length;
  grid = { cols: [], rows: [] };
  if (!current) { box.replaceChildren(h("p", { class: "empty" }, "Aún no hay cursos. Cree uno en el programa.")); return; }
  if (!book) { box.replaceChildren(h("p", { class: "empty" }, "Este curso aún no tiene Excel. Importe uno o registre un estudiante.")); return; }
  grid = { cols: sheet.visibleColumns(book), rows: sheet.visibleRows(book) };
  anchor = { c: clamp(anchor.c, 0, maxC()), r: clamp(anchor.r, 0, maxR()) };
  focus = { c: clamp(focus.c, 0, maxC()), r: clamp(focus.r, 0, maxR()) };
  const cell = (c, r) => {
    const col = grid.cols[c]; const row = grid.rows[r - 1];
    const value = sheet.display(book, col, row); const kind = sheet.kindOf(book, col);
    const cls = col === 3 ? "pct" : kind === "fixed" ? "" : `mark${value === 1 ? " yes" : value === 0 ? " no" : ""}`;
    return h("td", { class: cls, "data-c": c, "data-r": r, "data-col": col, "data-id": row.id, contenteditable: "false" }, String(value));
  };
  const letters = h("tr", {}, h("th", { class: "corner", title: "Seleccionar todo" }), grid.cols.map((col, c) => h("th", { scope: "col", "data-hc": c }, sheet.columnLetterOf(col))));
  const titles = h("tr", {}, h("th", { "data-hr": 0 }, "1"), grid.cols.map((col, c) =>
    h("td", { class: "head", "data-c": c, "data-r": 0, "data-col": col, "data-id": "", contenteditable: "false" }, sheet.titleOf(book, col))));
  const body = grid.rows.map((row, i) => h("tr", {}, h("th", { "data-hr": i + 1 }, String(book.rows.indexOf(row) + 2)), grid.cols.map((_, c) => cell(c, i + 1))));
  box.replaceChildren(h("table", { class: "sheet", "aria-label": `Asistencia de ${current.name}` }, h("thead", {}, letters), h("tbody", {}, titles, body)));
  const hidden = book.hidden.cols.length + book.hidden.rows.length;
  baseStatus = `${book.rows.length} estudiante(s) · ${book.columns.length} lista(s)${hidden ? ` · ${hidden} oculta(s): clic derecho → Mostrar` : ""}`;
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
  await repository.save(course);
  current = course;
  channel?.postMessage("changed");
  return fresh.length;
}

async function addStudent() {
  try {
    const id = validateCedula(prompt("Cédula (10 dígitos):") ?? "");
    const name = normalizeFullName(prompt("Apellidos y nombres:") ?? "");
    await addPending([{ id, name }]);
    await apply((b) => sheet.addRow(b, { id, name }));
  } catch (error) {
    if (error.message) say(`⚠ ${error.message}`);
  }
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

const newColumn = () => { const title = prompt("Nombre de la columna (ej.: Participación):"); if (title !== null) apply((b) => sheet.addExtra(b, title)); };

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
  for (let r = Math.max(r1, 1); r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) if (editableAt(c, r) && grid.cols[c] !== 2) jobs.push([grid.cols[c], idAt(r)]);
  if (jobs.length) apply((b) => jobs.reduce((acc, [col, id]) => sheet.setCell(acc, col, id, ""), b));
}
function fillDown() {
  const { c1, c2, r1, r2 } = range(); const top = Math.max(r1, 1); const jobs = [];
  for (let c = c1; c <= c2; c += 1) for (let r = top + 1; r <= r2; r += 1) if (editableAt(c, r) && grid.cols[c] !== 2) jobs.push([grid.cols[c], idAt(r), rawAt(c, top)]);
  if (jobs.length) apply((b) => jobs.reduce((acc, [col, id, v]) => sheet.setCell(acc, col, id, v), b));
}
function selectionText() {
  const { c1, c2, r1, r2 } = range(); const lines = [];
  for (let r = r1; r <= r2; r += 1) lines.push(Array.from({ length: c2 - c1 + 1 }, (_, i) => textAt(c1 + i, r)).join("\t"));
  return lines.join("\n");
}
function pasteText(text) {
  const { c1, r1 } = range(); const jobs = [];
  text.replace(/\r/g, "").replace(/\n$/, "").split("\n").forEach((line, i) => line.split("\t").forEach((value, j) => {
    const c = c1 + j; const r = Math.max(r1, 1) + i;
    if (c <= maxC() && r <= maxR() && editableAt(c, r)) jobs.push([grid.cols[c], idAt(r), value]);
  }));
  if (!jobs.length) { say("⚠ No hay dónde pegar ahí."); return; }
  apply((b) => jobs.reduce((acc, [col, id, value]) => { try { return sheet.setCell(acc, col, id, value); } catch { return acc; } }, b));
}

/* ---------- Edición de una celda ---------- */

function startEdit(c, r, first = null) {
  if (!editableAt(c, r)) { say("⚠ Esa celda no se puede editar."); return; }
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
  if (text !== original.trim()) await apply((b) => sheet.setCell(b, col, id, text)); else td.textContent = textAt(c, r);
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
document.addEventListener("mousemove", (event) => {
  if (!dragging) return;
  if (event.buttons === 0) { dragging = null; return; }
  const point = hit(event.target);
  if (point && point.mode === dragging) setSelection(anchor, point, dragging);
});
document.addEventListener("mouseup", () => { dragging = null; });
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

const boxIsActive = () => !editing && book && [box, document.body].includes(document.activeElement);
document.addEventListener("copy", (event) => { if (boxIsActive()) { event.clipboardData.setData("text/plain", selectionText()); event.preventDefault(); } });
document.addEventListener("cut", (event) => { if (boxIsActive()) { event.clipboardData.setData("text/plain", selectionText()); event.preventDefault(); clearSelection(); } });
document.addEventListener("paste", (event) => { if (boxIsActive()) { event.preventDefault(); pasteText(event.clipboardData.getData("text/plain")); } });

$("formula").addEventListener("keydown", (event) => {
  if (!book) return;
  if (event.key === "Escape") { paint(); box.focus(); return; }
  if (event.key !== "Enter") return;
  const { c, r } = focus;
  if (!editableAt(c, r)) { say("⚠ Esa celda no se puede editar."); return; }
  apply((b) => sheet.setCell(b, grid.cols[c], idAt(r), $("formula").value)).then(() => box.focus());
});

/* ---------- Descarga y carga ---------- */

async function download() {
  if (!book) return;
  const XLSX = await loadXlsx();
  const bytes = buildWorkbookBytes(XLSX, structuredClone(book)); // copia: lo descargado no afecta al programa
  downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), excelFileName(current.name));
}

async function show() {
  const changedCourse = !current || current.course_id !== select.value;
  current = courses.find((c) => c.course_id === select.value) ?? null;
  $("descargar").disabled = current === null;
  past.length = 0; future.length = 0;
  if (changedCourse) { anchor = { c: 0, r: 1 }; focus = { c: 0, r: 1 }; }
  if (!current) { book = null; render(); return; }
  history.replaceState(null, "", `#${current.course_id}`);
  const stored = await books.get(current.course_id);
  book = stored ? sheet.normalize(stored) : null;
  lastJson = JSON.stringify(book);
  $("nombre-hoja").textContent = (book?.sheet_title || current.name).slice(0, 31);
  render();
}

async function reload(force = false) {
  if ((editing || dragging) && !force) return;
  repository = await CourseRepository.load();
  courses = repository.courses;
  const wanted = location.hash.slice(1) || select.value;
  select.replaceChildren(...courses.map((c) => h("option", { value: c.course_id }, c.name)));
  select.value = courses.some((c) => c.course_id === wanted) ? wanted : (courses[0]?.course_id ?? "");
  const stored = current ? await books.get(select.value) : null;
  if (force || !current || select.value !== current.course_id || JSON.stringify(stored ? sheet.normalize(stored) : null) !== lastJson) await show();
  else current = courses.find((c) => c.course_id === select.value) ?? current;
}

document.addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
select.addEventListener("change", show);
$("volver").addEventListener("click", goBack);
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
if (channel) channel.onmessage = () => reload();
window.addEventListener("hashchange", () => reload(true)); // el programa cambia de curso con #idCurso
reload(true);
setInterval(() => { if (!document.hidden && !menu) reload(); }, REFRESH_MS);
