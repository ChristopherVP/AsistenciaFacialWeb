import test from "node:test";
import assert from "node:assert/strict";
import { ScheduleReminders, getReminderLeads, saveReminderLeads } from "../js/ui/reminders.js";
import { weekday } from "../js/models.js";

const memoryStorage = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };
const setup = (options = {}, start = "10:08") => {
  const now = new Date(2026, 10, 23, 10, 0, 0);
  const course = { course_id: "c1", name: "Redes", schedule_enabled: true, last_auto_date: "", slots: [{ days: [weekday(now)], start, end: "11:00", enabled: true }] };
  const calls = { notify: [], speak: [] };
  const reminders = new ScheduleReminders({ repository: { courses: [course] } }, {
    speaker: { speak: (text) => calls.speak.push(text) }, notify: (n) => calls.notify.push(n), storage: memoryStorage(),
    permission: () => "granted", standalone: () => true, ...options,
  });
  return { now, calls, reminders, course };
};
const at = (now, seconds) => new Date(now.getTime() + seconds * 1000);
const armThenWait = (setupResult, seconds) => {
  setupResult.reminders.check(setupResult.now);
  setupResult.reminders.check(at(setupResult.now, seconds));
};

test("avisa 5 minutos antes (una vez) y la voz un minuto antes, sin adelantarse", () => {
  const { now, calls, reminders } = setup();
  reminders.check(now);
  reminders.check(at(now, 170));
  assert.equal(calls.notify.length + calls.speak.length, 0);
  reminders.check(at(now, 185)); reminders.check(at(now, 186));
  assert.equal(calls.notify.length, 1);
  assert.match(calls.notify[0].title, /Redes/);
  assert.match(calls.notify[0].body, /en 5 min/);
  assert.equal(calls.speak.length, 0);
  reminders.check(at(now, 419));
  assert.equal(calls.speak.length, 0);
  reminders.check(at(now, 421)); reminders.check(at(now, 422));
  assert.deepEqual(calls.speak, ["Pronto iniciará la lista programada del curso Redes."]);
  assert.equal(calls.notify.length, 1);
});

test("un horario que se ve por primera vez dentro de la ventana no avisa de golpe", () => {
  const { now, calls, reminders } = setup({}, "10:03");
  reminders.check(now);
  reminders.check(at(now, 10));
  assert.equal(calls.notify.length + calls.speak.length, 0);
  reminders.check(at(now, 121));
  assert.equal(calls.notify.length, 0);
  assert.deepEqual(calls.speak, ["Pronto iniciará la lista programada del curso Redes."]);
});

test("un horario creado a menos de un minuto no avisa de nada", () => {
  const { now, calls, reminders } = setup({}, "10:00");
  reminders.check(at(now, -40));
  reminders.check(at(now, -20));
  assert.equal(calls.notify.length + calls.speak.length, 0);
});

test("los minutos de aviso se pueden elegir y se guardan", () => {
  const storage = memoryStorage();
  assert.deepEqual({ ...getReminderLeads(storage) }, { notifyMinutes: 5, voiceMinutes: 1 });
  saveReminderLeads({ notifyMinutes: 2, voiceMinutes: 1 }, storage);
  assert.deepEqual({ ...getReminderLeads(storage) }, { notifyMinutes: 2, voiceMinutes: 1 });
  assert.throws(() => saveReminderLeads({ notifyMinutes: 3, voiceMinutes: 3 }, storage), /más cerca de la hora/);
  assert.throws(() => saveReminderLeads({ notifyMinutes: 7, voiceMinutes: 1 }, storage), /Elija minutos/);
  const custom = setup({ leads: () => getReminderLeads(storage) }, "10:04");
  custom.reminders.check(custom.now);
  custom.reminders.check(at(custom.now, 100));
  assert.equal(custom.calls.notify.length, 0);
  custom.reminders.check(at(custom.now, 125));
  assert.equal(custom.calls.notify.length, 1);
  assert.match(custom.calls.notify[0].body, /en 2 min/);
  custom.reminders.check(at(custom.now, 185));
  assert.equal(custom.calls.speak.length, 1);
});

test("no avisa si ya empezó, si no hay permiso, si la lista ya se tomó hoy o si el horario está apagado", () => {
  const started = setup(); started.reminders.check(started.now); started.reminders.check(at(started.now, 500));
  assert.equal(started.calls.notify.length + started.calls.speak.length, 0);
  const denied = setup({ permission: () => "denied" }); armThenWait(denied, 200);
  assert.equal(denied.calls.notify.length, 0);
  const done = setup(); done.reminders._state.repository.courses[0].last_auto_date = "2026-11-23"; armThenWait(done, 200);
  assert.equal(done.calls.notify.length, 0);
  const off = setup(); off.course.slots[0].enabled = false; armThenWait(off, 200);
  assert.equal(off.calls.notify.length, 0);
  const masterOff = setup(); masterOff.course.schedule_enabled = false; armThenWait(masterOff, 200);
  assert.equal(masterOff.calls.notify.length, 0);
});

test("con la aplicación instalada en uso, el navegador no avisa; sin app instalada sí", () => {
  const storage = memoryStorage();
  const app = setup({ storage, standalone: () => true });
  const web = setup({ storage, standalone: () => false });
  armThenWait(web, 200);
  assert.equal(web.calls.notify.length, 0);
  const alone = setup({ standalone: () => false }); armThenWait(alone, 200);
  assert.equal(alone.calls.notify.length, 1);
  armThenWait(app, 200);
  assert.equal(app.calls.notify.length, 1);
});

test("no habla si hay una lista en curso", () => {
  const busy = setup({ isBusy: () => true });
  busy.reminders.check(busy.now); busy.reminders.check(at(busy.now, 430));
  assert.equal(busy.calls.speak.length, 0);
});
