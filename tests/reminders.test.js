import test from "node:test";
import assert from "node:assert/strict";
import { ScheduleReminders } from "../js/ui/reminders.js";
import { weekday } from "../js/models.js";

const memoryStorage = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };
const setup = (options = {}) => {
  const now = new Date(2026, 10, 23, 10, 0, 0); // lunes 10:00
  const course = { course_id: "c1", name: "Redes", schedule_enabled: true, last_auto_date: "", slots: [{ days: [weekday(now)], start: "10:04", end: "11:00" }] };
  const calls = { notify: [], speak: [] };
  const reminders = new ScheduleReminders({ repository: { courses: [course] } }, {
    speaker: { speak: (text) => calls.speak.push(text) }, notify: (n) => calls.notify.push(n), storage: memoryStorage(),
    permission: () => "granted", standalone: () => true, ...options,
  });
  return { now, calls, reminders };
};
const at = (now, seconds) => new Date(now.getTime() + seconds * 1000);

test("avisa 5 minutos antes (una vez) y la voz un minuto antes", () => {
  const { now, calls, reminders } = setup();
  reminders.check(now); reminders.check(at(now, 1));
  assert.equal(calls.notify.length, 1);
  assert.match(calls.notify[0].title, /Redes/);
  assert.equal(calls.speak.length, 0);
  reminders.check(at(now, 185)); reminders.check(at(now, 186));
  assert.deepEqual(calls.speak, ["Pronto iniciará la lista programada del curso Redes."]);
  assert.equal(calls.notify.length, 1);
});

test("no avisa si ya empezó, si no hay permiso o si la lista ya se tomó hoy", () => {
  const started = setup(); started.reminders.check(at(started.now, 250));
  assert.equal(started.calls.notify.length + started.calls.speak.length, 0);
  const denied = setup({ permission: () => "denied" }); denied.reminders.check(denied.now);
  assert.equal(denied.calls.notify.length, 0);
  const done = setup(); done.reminders._state.repository.courses[0].last_auto_date = "2026-11-23"; done.reminders.check(done.now);
  assert.equal(done.calls.notify.length, 0);
});

test("con la aplicación instalada en uso, el navegador no avisa; sin app instalada sí", () => {
  const storage = memoryStorage();
  const app = setup({ storage, standalone: () => true }); // la app instalada se abre y deja su marca
  const web = setup({ storage, standalone: () => false });
  web.reminders.check(web.now);
  assert.equal(web.calls.notify.length, 0);
  const alone = setup({ standalone: () => false }); alone.reminders.check(alone.now);
  assert.equal(alone.calls.notify.length, 1);
  app.reminders.check(app.now);
  assert.equal(app.calls.notify.length, 1);
});

test("no habla si hay una lista en curso", () => {
  const { now, calls, reminders } = setup({ isBusy: () => true });
  reminders.check(at(now, 190));
  assert.equal(calls.speak.length, 0);
});
