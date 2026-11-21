import assert from "node:assert/strict";
import test from "node:test";
import { parseRows, normalizeCedula } from "../js/excel-import.js";
import * as sheet from "../js/sheet-model.js";

const base = () => sheet.normalize({ course_id: "c", sheet_title: "T", rows: [{ id: "1712345678", name: "ZAMBRANO ANA" }],
  columns: [{ moment: 1000, marks: { 1712345678: 1 } }, { moment: 2000, marks: { 1712345678: 0 } }] });

test("importar ordena por apellidos y fusiona fechas y extras", () => {
  const parsed = parseRows([["Cédula", "Apellidos y nombres", "% Asistencia", "Participación"],
    [1710034065, "Aguirre Luis", "", "3"], ["1712345678", "Zambrano Ana", "", ""]]);
  const merged = sheet.mergeImport(base(), parsed);
  assert.deepEqual(merged.rows.map((r) => r.name), ["AGUIRRE LUIS", "ZAMBRANO ANA"]);
  assert.equal(merged.extras[0].cells["1710034065"], "3");
  assert.equal(normalizeCedula(912345678), "0912345678");
});

test("fórmulas y % de asistencia", () => {
  let book = sheet.addExtra(base(), "Participación");
  book = sheet.setCell(book, 6, "1712345678", "=SUM(D2:E2)*2");
  assert.equal(sheet.display(book, 6, book.rows[0]), "2");
  assert.equal(sheet.display(book, 3, book.rows[0]), "50%");
  assert.equal(sheet.evaluate(book, "=ALERT(1)"), "#ERROR");
});

test("ocultar, mostrar y validar marcas", () => {
  let book = sheet.hideColumn(base(), 4);
  assert.equal(sheet.visibleColumns(book).includes(4), false);
  assert.equal(sheet.visibleColumns(sheet.showAll(book)).includes(4), true);
  assert.throws(() => sheet.setCell(base(), 4, "1712345678", "7"));
});
