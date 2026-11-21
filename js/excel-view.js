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
const past = []; const future = []; let active = null;
let repository = null; let courses = []; let current = null; let book = null; let lastJson = ""; let busy = false; let menu = null;

const say = (message) => { status.textContent = message; };

function goBack() {
  if (window.opener && !window.opener.closed) {
    try { window.opener.focus(); } catch { /* el navegador puede negar el foco */ }
    window.close();
    setTimeout(() => { location.href = "./index.html"; }, 200); // solo si la pestaña no se pudo cerrar
  } else {
    location.href = "./index.html";
  }
}

function render() {
  closeMenu();
  active = null; showActive();
  $("deshacer").disabled = !past.length; $("rehacer").disabled = !future.length;
  if (!current) { box.replaceChildren(h("p", { class: "empty" }, "Aún no hay cursos. Cree uno en el programa.")); return; }
  if (!book) { box.replaceChildren(h("p", { class: "empty" }, "Este curso aún no tiene Excel. Importe uno o registre un estudiante.")); return; }
  const cols = sheet.visibleColumns(book);
  const rows = sheet.visibleRows(book);
  const cell = (col, row) => {
    const value = sheet.display(book, col, row);
    const kind = sheet.kindOf(book, col);
    const cls = col === 3 ? "pct" : kind === "fixed" ? "" : `mark${value === 1 ? " yes" : value === 0 ? " no" : ""}`;
    return h("td", { class: cls, "data-col": col, "data-id": row.id, contenteditable: sheet.isEditable(book, col) ? "true" : "false" }, String(value));
  };
  const letters = h("tr", {}, h("th", {}), cols.map((col) => h("th", { scope: "col", "data-col": col }, sheet.columnLetterOf(col))));
  const titles = h("tr", {}, h("th", {}, "1"), cols.map((col) =>
    h("td", { class: "head", "data-col": col, "data-id": "", contenteditable: sheet.kindOf(book, col) === "extra" ? "true" : "false" }, sheet.titleOf(book, col))));
  const body = rows.map((row) => h("tr", {}, h("th", { "data-row": row.id }, String(book.rows.indexOf(row) + 2)), cols.map((col) => cell(col, row))));
  box.replaceChildren(h("table", { class: "sheet", "aria-label": `Asistencia de ${current.name}` }, h("thead", {}, letters), h("tbody", {}, titles, body)));
  const hidden = book.hidden.cols.length + book.hidden.rows.length;
  say(`${book.rows.length} estudiante(s) · ${book.columns.length} lista(s)${hidden ? ` · ${hidden} oculta(s): clic derecho → Mostrar` : ""}`);
}

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

function closeMenu() { menu?.remove(); menu = null; }
function openMenu(event, col, id) {
  event.preventDefault();
  closeMenu();
  if (!book) return;
  const items = [];
  if (col) items.push(["🙈 Ocultar columna", () => apply((b) => sheet.hideColumn(b, col))]);
  if (id) items.push(["🙈 Ocultar fila", () => apply((b) => sheet.hideRow(b, id))]);
  if (book.hidden.cols.length || book.hidden.rows.length) items.push(["👁 Mostrar columnas y filas ocultas", () => apply(sheet.showAll)]);
  if (col && sheet.kindOf(book, col) !== "fixed") items.push(["🗑 Eliminar columna", () => confirm("¿Eliminar esta columna?") && apply((b) => sheet.removeColumn(b, col))]);
  if (id) items.push(["🗑 Eliminar fila (solo del Excel)", () => confirm("¿Eliminar esta fila del Excel?") && apply((b) => sheet.removeRow(b, id))]);
  items.push(["➕ Agregar columna", newColumn], ["➕ Agregar estudiante", addStudent]);
  menu = h("div", { class: "ctx", role: "menu", style: `left:${Math.min(event.clientX, innerWidth - 240)}px;top:${Math.min(event.clientY, innerHeight - items.length * 36 - 10)}px` },
    items.map(([label, run]) => h("button", { type: "button", role: "menuitem", onClick: () => { closeMenu(); run(); } }, label)));
  document.body.append(menu);
  menu.querySelector("button").focus();
}
const newColumn = () => { const title = prompt("Nombre de la columna (ej.: Participación):"); if (title !== null) apply((b) => sheet.addExtra(b, title)); };

async function download() {
  if (!book) return;
  const XLSX = await loadXlsx();
  const bytes = buildWorkbookBytes(XLSX, structuredClone(book)); // copia: lo descargado no afecta al programa
  downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), excelFileName(current.name));
}

async function show() {
  current = courses.find((c) => c.course_id === select.value) ?? null;
  $("descargar").disabled = current === null;
  if (!current) { book = null; render(); return; }
  history.replaceState(null, "", `#${current.course_id}`);
  const stored = await books.get(current.course_id);
  book = stored ? sheet.normalize(stored) : null;
  lastJson = JSON.stringify(book);
  $("nombre-hoja").textContent = (book?.sheet_title || current.name).slice(0, 31);
  render();
}

async function reload(force = false) {
  if (busy && !force) return;
  repository = await CourseRepository.load();
  courses = repository.courses;
  const wanted = select.value || location.hash.slice(1);
  select.replaceChildren(...courses.map((c) => h("option", { value: c.course_id }, c.name)));
  select.value = courses.some((c) => c.course_id === wanted) ? wanted : (courses[0]?.course_id ?? "");
  const stored = current ? await books.get(select.value) : null;
  if (force || !current || select.value !== current.course_id || JSON.stringify(stored ? sheet.normalize(stored) : null) !== lastJson) await show();
  else current = courses.find((c) => c.course_id === select.value) ?? current;
}

function showActive() {
  const td = active && box.querySelector(`td[data-col="${active.col}"][data-id="${active.id}"]`);
  box.querySelectorAll("td.sel").forEach((cell) => cell.classList.remove("sel"));
  td?.classList.add("sel");
  const row = active && book?.rows.find((r) => r.id === active.id);
  $("celda").value = active ? `${sheet.columnLetterOf(active.col)}${row ? book.rows.indexOf(row) + 2 : 1}` : "";
  $("formula").value = active && book ? (row ? sheet.rawOf(book, active.col, row) : sheet.titleOf(book, active.col)) : "";
}

async function stepHistory(from, to) {
  if (!from.length || !book) return;
  to.push(JSON.stringify(book));
  const restored = JSON.parse(from.pop());
  await apply(() => restored, false);
}

function removeActive(kind) {
  if (!active || !book) { say("⚠ Haga clic en una celda primero."); return; }
  if (kind === "col") {
    if (sheet.kindOf(book, active.col) === "fixed") { say("⚠ Las 3 primeras columnas no se pueden eliminar."); return; }
    if (confirm(`¿Eliminar la columna «${sheet.titleOf(book, active.col)}»?`)) apply((b) => sheet.removeColumn(b, active.col));
  } else if (!active.id) {
    say("⚠ Elija una celda de un estudiante (no del encabezado).");
  } else if (confirm("¿Eliminar esta fila del Excel? (el estudiante sigue en el curso)")) {
    apply((b) => sheet.removeRow(b, active.id));
  }
}

box.addEventListener("click", (event) => {
  const td = event.target.closest?.("td[data-col]");
  if (td) { active = { col: Number(td.dataset.col), id: td.dataset.id }; showActive(); }
});
$("formula").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !active || !book || !active.id && sheet.kindOf(book, active.col) !== "extra") return;
  apply((b) => sheet.setCell(b, active.col, active.id, $("formula").value));
});
$("deshacer").addEventListener("click", () => stepHistory(past, future));
$("rehacer").addEventListener("click", () => stepHistory(future, past));
$("col-borrar").addEventListener("click", () => removeActive("col"));
$("fila-borrar").addEventListener("click", () => removeActive("row"));
$("ocultar-col").addEventListener("click", () => { if (active) apply((b) => sheet.hideColumn(b, active.col)); else say("⚠ Haga clic en una celda primero."); });
document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.target.isContentEditable || event.target.tagName === "INPUT") return;
  if (event.key.toLowerCase() === "z") { event.preventDefault(); stepHistory(past, future); }
  if (event.key.toLowerCase() === "y") { event.preventDefault(); stepHistory(future, past); }
});
if (channel) channel.onmessage = () => reload();

box.addEventListener("focusin", (event) => {
  busy = true;
  const td = event.target.closest?.("td[data-col]");
  if (!td || !book) return;
  active = { col: Number(td.dataset.col), id: td.dataset.id };
  const row = book.rows.find((r) => r.id === active.id);
  if (row && sheet.kindOf(book, active.col) === "extra") td.textContent = sheet.rawOf(book, active.col, row); // muestra la fórmula al editar
  showActive();
});
box.addEventListener("focusout", (event) => {
  busy = false;
  const td = event.target.closest?.("td[data-col]");
  if (!td || td.contentEditable !== "true") return;
  const col = Number(td.dataset.col);
  const row = book.rows.find((r) => r.id === td.dataset.id) ?? { id: "", name: "" };
  if (td.textContent.trim() !== String(td.dataset.id ? sheet.rawOf(book, col, row) : sheet.titleOf(book, col))) {
    apply((b) => sheet.setCell(b, col, td.dataset.id, td.textContent));
  }
});
box.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); event.target.blur(); } });
box.addEventListener("contextmenu", (event) => {
  const target = event.target.closest("[data-col],[data-row]");
  openMenu(event, Number(target?.dataset.col) || 0, target?.dataset.id || target?.dataset.row || "");
});
document.addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(); });
select.addEventListener("change", show);
$("volver").addEventListener("click", goBack);
$("col-nueva").addEventListener("click", newColumn);
$("est-nuevo").addEventListener("click", addStudent);
$("mostrar").addEventListener("click", () => apply(sheet.showAll));
$("descargar").addEventListener("click", download);
$("importar").addEventListener("click", () => $("archivo").click());
$("archivo").addEventListener("change", (event) => { const [file] = event.target.files; event.target.value = ""; if (file) importFile(file); });
reload(true);
setInterval(() => { if (!document.hidden && !menu) reload(); }, REFRESH_MS);
