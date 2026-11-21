import "fake-indexeddb/auto";
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("excel.html muestra la hoja de asistencia con % y columnas", async () => {
  const html = fs.readFileSync(new URL("../excel.html", import.meta.url), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  const { window } = new JSDOM(html, { url: "http://localhost/excel.html#c1" });
  for (const name of ["window", "document", "Node", "HTMLElement"]) {
    Object.defineProperty(globalThis, name, { value: name === "window" ? window : window[name], configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, "location", { value: window.location, configurable: true });
  Object.defineProperty(globalThis, "history", { value: window.history, configurable: true });
  const { putRecord } = await import("../js/storage.js");
  await putRecord("courses", { course_id: "c1", name: "Redes", students: [], slots: [], schedule_enabled: false, last_auto_date: "" });
  await putRecord("books", {
    course_id: "c1", sheet_title: "Redes",
    rows: [{ id: "111", name: "ANDRADE ANA" }, { id: "222", name: "BRAVO BETO" }],
    columns: [{ moment: new Date(2026, 10, 18, 7, 0).getTime(), marks: { 111: 1, 222: 0 } }, { moment: new Date(2026, 10, 19, 7, 0).getTime(), marks: { 111: 1 } }],
  });
  globalThis.setInterval = () => 0;
  await import("../js/excel-view.js");
  for (let i = 0; i < 50 && !document.querySelector("table.sheet"); i += 1) await new Promise((r) => setTimeout(r, 20));
  const text = document.querySelector("table.sheet").textContent;
  assert.match(text, /ANDRADE ANA/);
  assert.match(text, /18\/11\/2026 07:00/);
  const cells = [...document.querySelectorAll("td.pct")].map((cell) => cell.textContent);
  assert.deepEqual(cells, ["100%", "0%"]);
  assert.equal(document.getElementById("curso").value, "c1");
});
