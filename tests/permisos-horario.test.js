import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM('<!doctype html><body><div id="overlay-root"></div></body>', { url: "http://localhost/" });
for (const name of ["window", "document", "Node", "HTMLElement", "Event", "KeyboardEvent", "HTMLInputElement", "HTMLDialogElement"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? window : window[name], configurable: true });
}
window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
window.HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };

const permissions = await import("../js/permissions.js");
const models = await import("../js/models.js");
const { SlotDialog } = await import("../js/ui/dialogs.js");

test("plataforma: detecta iPhone, iPad, Android y computador", () => {
  assert.equal(permissions.detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5), "ios");
  assert.equal(permissions.detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), "ios");
  assert.equal(permissions.detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), "desktop");
  assert.equal(permissions.detectPlatform("Mozilla/5.0 (Linux; Android 14; SM-S911B) Chrome/120", 5), "android");
  assert.equal(permissions.detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120", 0), "desktop");
});

test("permisos: hay pasos para cada tema y dispositivo, y el mensaje cambia según el equipo", () => {
  for (const kind of ["camera", "notifications", "install"]) {
    for (const platform of Object.keys(permissions.PLATFORMS)) assert.ok(permissions.helpSteps(kind, platform).length > 0, `${kind}/${platform}`);
  }
  assert.match(permissions.blockedMessage("camera", "desktop", true), /menú ⋮ de la ventana/);
  assert.match(permissions.blockedMessage("camera", "desktop", false), /candado/);
  assert.match(permissions.blockedMessage("camera", "android", true), /Información de la aplicación/);
  assert.doesNotMatch(permissions.blockedMessage("camera", "android", true), /menú ⋮ de la ventana/);
  assert.match(permissions.blockedMessage("camera", "ios", false), /aA/);
  assert.match(permissions.blockedMessage("notifications", "ios", true), /pantalla de inicio/);
});

test("horario: máximo 1 hora, y los cursos guardados con más tiempo se siguen leyendo", () => {
  assert.equal(models.createSlot([0], "07:00", "08:00").end, "08:00");
  assert.throws(() => models.createSlot([0], "07:00", "08:01"), /más de 1 hora/);
  assert.throws(() => models.createSlot([0], "08:00", "07:00"), /posterior/);
  assert.equal(models.createSlot([0], "07:00", "09:00", { legacy: true }).end, "09:00");
  const course = models.courseFromDict({ course_id: "c", name: "Curso", students: [], slots: [{ days: [0], start: "07:00", end: "10:00" }] });
  assert.equal(course.slots.length, 1);
});

test("diálogo de horario: el fin nunca pasa de 1 hora y el inicio arrastra al fin", async () => {
  let saved = null;
  new SlotDialog(async (slot) => { saved = slot; });
  const [startHour, , endHour, endMinute] = document.querySelectorAll(".time-picker input");
  const set = (input, value) => { input.value = value; input.dispatchEvent(new window.Event("input", { bubbles: true })); input.dispatchEvent(new window.Event("blur")); };
  set(endHour, "10");
  assert.equal(endHour.value, "08");
  assert.equal(endMinute.value, "00");
  assert.match(document.querySelector(".summary-box").textContent, /como máximo 1 hora/);
  set(startHour, "13");
  assert.equal(endHour.value, "14");
  [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Guardar")).click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(saved.start, "13:00");
  assert.equal(saved.end, "14:00");
});
