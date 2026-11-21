import { downloadBlob } from "./backup.js";
import { columnLetter, FIRST_DATE_COLUMN } from "./attendance.js";
import { buildWorkbookBytes, loadXlsx } from "./excel.js";
import { formatDateTime } from "./models.js";
import { BookRepository, CourseRepository, excelFileName } from "./storage.js";
import { h } from "./ui/dom.js";

const REFRESH_MS = 2000;
const books = new BookRepository();
const select = document.getElementById("curso");
const sheetBox = document.getElementById("hoja");
const sheetName = document.getElementById("nombre-hoja");
const status = document.getElementById("estado");
let courses = [];
let current = null;

/** % de asistencia como en la fórmula del Excel: suma / cantidad de celdas con dato. */
function percentOf(row, book) {
  const marks = book.columns.map((column) => column.marks[row.id]).filter((mark) => mark !== undefined);
  return marks.length ? `${Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 100)}%` : "";
}

function renderSheet(course, book) {
  const columns = book?.columns ?? [];
  const rows = book?.rows ?? [];
  const letters = ["A", "B", "C", ...columns.map((_, i) => columnLetter(FIRST_DATE_COLUMN + i))];
  const head = h("tr", {}, h("th", {}), letters.map((letter) => h("th", { scope: "col" }, letter)));
  const titles = h("tr", {}, h("th", {}, "1"),
    h("td", { class: "head" }, "Cédula"), h("td", { class: "head" }, "Apellidos y nombres"), h("td", { class: "head" }, "% Asistencia"),
    columns.map((column) => h("td", { class: "head" }, formatDateTime(new Date(column.moment)))));
  const body = rows.map((row, index) => h("tr", {}, h("th", {}, String(index + 2)),
    h("td", {}, row.id), h("td", {}, row.name), h("td", { class: "pct" }, percentOf(row, book)),
    columns.map((column) => {
      const mark = column.marks[row.id];
      return h("td", { class: `mark${mark === 1 ? " yes" : mark === 0 ? " no" : ""}` }, mark === undefined ? "" : String(mark));
    })));
  sheetBox.replaceChildren(h("table", { class: "sheet", "aria-label": `Asistencia de ${course.name}` }, h("thead", {}, head), h("tbody", {}, titles, body)));
  status.textContent = `${rows.length} estudiante(s) · ${columns.length} lista(s) · actualizado ${new Date().toLocaleTimeString("es-EC")}`;
}

async function show() {
  const course = courses.find((item) => item.course_id === select.value) ?? null;
  current = course;
  document.getElementById("descargar").disabled = course === null;
  if (course === null) {
    sheetBox.replaceChildren(h("p", { class: "empty" }, "Aún no hay cursos. Cree uno en el programa para ver su asistencia aquí."));
    return;
  }
  history.replaceState(null, "", `#${course.course_id}`);
  const book = await books.get(course.course_id);
  sheetName.textContent = (book?.sheet_title || course.name).slice(0, 31);
  if (!book) {
    sheetBox.replaceChildren(h("p", { class: "empty" }, "Este curso aún no tiene Excel. Se crea al registrar un estudiante o tomar la primera lista."));
    status.textContent = "";
    return;
  }
  renderSheet(course, book);
}

async function reload() {
  const repository = await CourseRepository.load();
  courses = repository.courses;
  const wanted = select.value || location.hash.slice(1);
  select.replaceChildren(...courses.map((course) => h("option", { value: course.course_id }, course.name)));
  select.value = courses.some((course) => course.course_id === wanted) ? wanted : (courses[0]?.course_id ?? "");
  await show();
}

async function download() {
  if (current === null) return;
  const book = await books.get(current.course_id);
  if (!book) return;
  const XLSX = await loadXlsx();
  const bytes = buildWorkbookBytes(XLSX, { ...book, sheet_title: book.sheet_title || current.name });
  downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), excelFileName(current.name));
}

select.addEventListener("change", show);
document.getElementById("actualizar").addEventListener("click", reload);
document.getElementById("descargar").addEventListener("click", download);
reload();
setInterval(() => { if (!document.hidden) reload(); }, REFRESH_MS);
