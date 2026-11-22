import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM('<!doctype html><body><div id="overlay-root"></div></body>', { url: "http://localhost/" });
for (const name of ["window", "document", "Node", "HTMLElement", "Event", "KeyboardEvent", "HTMLInputElement", "HTMLDialogElement"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? window : window[name], configurable: true });
}
window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
window.HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };

const models = await import("../js/models.js");
const scheduler = await import("../js/scheduler.js");
const { SlotDialog } = await import("../js/ui/dialogs.js");

const monday = new Date(2026, 10, 16, 7, 10);
const baseCourse = () => {
  let course = models.createCourse({ course_id: "c1", name: "Redes" });
  course = models.courseAddSlot(course, models.createSlot([0], "07:00", "07:20"));
  course = models.courseAddSlot(course, models.createSlot([0], "09:00", "09:30"));
  return course;
};

test("horarios: el primer horario de un curso apagado queda apagado y se activa uno solo", () => {
  let course = baseCourse();
  assert.equal(course.schedule_enabled, false);
  assert.equal(models.activeSlotCount(course), 0);
  assert.equal(scheduler.dueCourses([course], monday).length, 0);
  course = models.courseToggleSlot(course, 0);
  assert.equal(course.schedule_enabled, true);
  assert.deepEqual(course.slots.map((slot) => slot.enabled), [true, false]);
  assert.equal(scheduler.dueCourses([course], monday).length, 1);
  assert.equal(scheduler.dueCourses([course], new Date(2026, 10, 16, 9, 10)).length, 0);
  course = models.courseToggleSlot(course, 0);
  assert.equal(course.schedule_enabled, false);
  assert.equal(scheduler.nextRun(course, monday), null);
});

test("horarios: activar todos, desactivar todos y modificar conservando el estado", () => {
  let course = models.courseSetAllSlots(baseCourse(), true);
  assert.equal(models.activeSlotCount(course), 2);
  course = models.courseToggleSlot(course, 1);
  assert.equal(models.activeSlotCount(course), 1);
  course = models.courseReplaceSlot(course, 1, models.createSlot([1], "10:00", "10:30"));
  assert.equal(course.slots[1].start, "10:00");
  assert.equal(course.slots[1].enabled, false);
  assert.equal(course.slots[0].enabled, true);
  assert.throws(() => models.courseReplaceSlot(course, 1, models.createSlot([0], "07:00", "07:20")), /ya existe/);
  course = models.courseSetAllSlots(course, false);
  assert.equal(course.schedule_enabled, false);
  course = models.courseSetAllSlots(models.courseRemoveSlot(course, 0), true);
  assert.equal(course.slots.length, 1);
  assert.equal(course.schedule_enabled, true);
});

test("horarios: un curso guardado con la lista automática prendida o apagada se lee igual que antes", () => {
  const slots = [{ days: [0], start: "07:00", end: "07:20" }, { days: [2], start: "08:00", end: "08:20" }];
  const on = models.courseFromDict({ course_id: "a", name: "A", students: [], slots, schedule_enabled: true });
  assert.deepEqual(on.slots.map((slot) => slot.enabled), [true, true]);
  assert.equal(on.schedule_enabled, true);
  const off = models.courseFromDict({ course_id: "b", name: "B", students: [], slots, schedule_enabled: false });
  assert.deepEqual(off.slots.map((slot) => slot.enabled), [false, false]);
  assert.equal(off.schedule_enabled, false);
});

test("diálogo de horario: al modificar aparece con los datos del horario y guarda los cambios", async () => {
  let saved = null;
  new SlotDialog(async (slot) => { saved = slot; }, models.createSlot([1, 3], "09:00", "09:30"));
  assert.match(document.querySelector("dialog").textContent, /Modificar horario/);
  const [startHour, startMinute, endHour, endMinute] = [...document.querySelectorAll(".time-picker input")].map((input) => input.value);
  assert.deepEqual([startHour, startMinute, endHour, endMinute], ["09", "00", "09", "30"]);
  const checked = [...document.querySelectorAll(".days input")].map((input) => input.checked);
  assert.deepEqual(checked, [false, true, false, true, false, false, false]);
  [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Guardar cambios")).click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual([...saved.days], [1, 3]);
  assert.equal(saved.start, "09:00");
  assert.equal(saved.end, "09:30");
});

test("horarios: un horario cumplido queda bloqueado, no vuelve a arrancar y solo se puede quitar", () => {
  let course = models.courseSetAllSlots(baseCourse(), true);
  const first = course.slots[0];
  course = models.courseCompleteSlot(course, first, "2026-11-16");
  assert.equal(models.isSlotCompleted(course.slots[0]), true);
  assert.equal(course.slots[0].enabled, false);
  assert.equal(models.completedSlotCount(course), 1);
  assert.equal(models.activeSlotCount(course), 1);
  assert.equal(scheduler.dueCourses([course], monday).length, 0);
  assert.throws(() => models.courseToggleSlot(course, 0), /ya se cumplió/);
  assert.throws(() => models.courseReplaceSlot(course, 0, models.createSlot([1], "08:00", "08:20")), /ya se cumplió/);
  const all = models.courseSetAllSlots(course, false);
  assert.equal(models.isSlotCompleted(all.slots[0]), true);
  assert.equal(all.slots[0].completed_on, "2026-11-16");
  course = models.courseAddSlot(course, models.createSlot([0], "07:00", "07:20"));
  assert.equal(course.slots.length, 3);
  const reloaded = models.courseFromDict(JSON.parse(JSON.stringify(course)));
  assert.equal(models.isSlotCompleted(reloaded.slots[0]), true);
  assert.equal(models.activeSlotCount(reloaded), 2);
  course = models.courseRemoveSlot(course, 0);
  assert.equal(course.slots.length, 2);
  assert.equal(models.completedSlotCount(course), 0);
});
