import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("pestaña Excel: archivos por curso, abrir hoja, selección múltiple, ocultar y eliminar", async () => {
  const { window } = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
  for (const name of ["window", "document", "Node", "HTMLElement"]) {
    Object.defineProperty(globalThis, name, { value: name === "window" ? window : window[name], configurable: true, writable: true });
  }
  for (const [name, value] of [["innerWidth", 1000], ["innerHeight", 800]]) Object.defineProperty(globalThis, name, { value, configurable: true });
  globalThis.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const { putRecord, CourseRepository, BookRepository } = await import("../js/storage.js");
  const { ExcelTab } = await import("../js/ui/excel-tab.js");
  await putRecord("courses", { course_id: "c1", name: "Redes", students: [], slots: [], schedule_enabled: false, last_auto_date: "" });
  await putRecord("books", { course_id: "c1", sheet_title: "Redes", rows: [{ id: "111", name: "A A" }, { id: "222", name: "B B" }],
    columns: [{ moment: 1e12, marks: { 111: 1, 222: 0 } }, { moment: 1.1e12, marks: { 111: 1 } }, { moment: 1.2e12, marks: { 111: 0 } }] });
  const repository = await CourseRepository.load();
  const state = { repository, bookRepository: new BookRepository(), subscribe() {}, notifyCoursesChanged() {} };
  const tab = new ExcelTab(state);
  document.body.append(tab.el);
  const wait = async (check) => { for (let i = 0; i < 60 && !check(); i += 1) await new Promise((r) => setTimeout(r, 20)); };

  await wait(() => tab.el.querySelector("tbody tr"));
  assert.match(tab.el.textContent, /Redes_ListaAsistencia\.xlsx/);
  assert.equal(document.querySelectorAll("table.sheet").length, 0);

  tab.open("c1");
  await wait(() => document.querySelector("table.sheet"));
  const fire = (el, type) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, button: 0, buttons: 1 }));
  const td = (c, r) => document.querySelector(`td[data-c="${c}"][data-r="${r}"]`);
  fire(td(3, 1), "mousedown"); fire(td(4, 2), "mousemove"); fire(td(4, 2), "mouseup");
  assert.equal(document.querySelectorAll("td.sel").length, 4);
  assert.equal(document.getElementById("celda").value, "D2:E3");
  document.getElementById("ocultar-col").click();
  await wait(() => document.querySelectorAll("th[data-hc]").length === 4);
  assert.equal(document.querySelectorAll("th[data-hc]").length, 4);
  document.getElementById("mostrar").click();
  await wait(() => document.querySelectorAll("th[data-hc]").length === 6);
  fire(document.querySelector('th[data-hc="3"]'), "mousedown"); fire(document.querySelector('th[data-hc="4"]'), "mousemove"); fire(document.body, "mouseup");
  document.getElementById("col-borrar").click();
  await wait(() => document.querySelectorAll("th[data-hc]").length === 4);
  assert.equal(document.querySelectorAll("th[data-hc]").length, 4);

  document.getElementById("volver").click(); // vuelve a la lista de archivos
  await wait(() => !document.querySelector("table.sheet"));
  assert.equal(document.querySelectorAll("table.sheet").length, 0);
  assert.match(tab.el.textContent, /Mis hojas de asistencia/);
});
