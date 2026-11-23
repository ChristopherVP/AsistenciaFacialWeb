import test from "node:test";
import assert from "node:assert/strict";
import { ScheduleReminders, VIBRATION_PATTERN, getReminderLead, saveReminderLead } from "../js/ui/reminders.js";
import { weekday } from "../js/models.js";

const memoryStorage = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };
const setup = (options = {}, start = "10:08") => {
  const now = new Date(2026, 10, 23, 10, 0, 0);
  const course = { course_id: "c1", name: "Redes", schedule_enabled: true, last_auto_date: "", slots: [{ days: [weekday(now)], start, end: "11:00", enabled: true }] };
  const calls = { vibrate: [], speak: [] };
  const reminders = new ScheduleReminders({ repository: { courses: [course] } }, {
    speaker: { speak: (text) => calls.speak.push(text) }, vibrate: (pattern) => calls.vibrate.push(pattern), storage: memoryStorage(), ...options,
  });
  return { now, calls, reminders, course };
};
const at = (now, seconds) => new Date(now.getTime() + seconds * 1000);

test("un minuto antes vibra y habla, una sola vez, sin adelantarse", () => {
  const { now, calls, reminders } = setup();
  reminders.check(now);
  reminders.check(at(now, 300));
  assert.equal(calls.speak.length + calls.vibrate.length, 0);
  reminders.check(at(now, 421)); reminders.check(at(now, 422));
  assert.deepEqual(calls.speak, ["Pronto se tomará lista al curso Redes."]);
  assert.equal(calls.vibrate.length, 1);
  assert.deepEqual(calls.vibrate[0], VIBRATION_PATTERN);
});

test("un horario que se ve por primera vez dentro de la ventana no avisa de golpe", () => {
  const { now, calls, reminders } = setup({}, "10:00");
  reminders.check(at(now, -40));
  reminders.check(at(now, -20));
  assert.equal(calls.speak.length + calls.vibrate.length, 0);
  const late = setup({}, "10:03");
  late.reminders.check(late.now);
  late.reminders.check(at(late.now, 121));
  assert.equal(late.calls.speak.length, 1);
});

test("los minutos de aviso se pueden elegir (1, 2 o 3) y se guardan", () => {
  const storage = memoryStorage();
  assert.equal(getReminderLead(storage), 1);
  saveReminderLead(2, storage);
  assert.equal(getReminderLead(storage), 2);
  assert.throws(() => saveReminderLead(7, storage), /1, 2 o 3/);
  const custom = setup({ lead: () => getReminderLead(storage) }, "10:04");
  custom.reminders.check(custom.now);
  custom.reminders.check(at(custom.now, 100));
  assert.equal(custom.calls.speak.length, 0);
  custom.reminders.check(at(custom.now, 125));
  assert.equal(custom.calls.speak.length, 1);
  assert.equal(custom.calls.vibrate.length, 1);
});

test("no avisa si ya empezó, si la lista ya se tomó hoy, si el horario está apagado o cumplido", () => {
  const started = setup(); started.reminders.check(started.now); started.reminders.check(at(started.now, 500));
  assert.equal(started.calls.speak.length, 0);
  const wait = (setupResult) => { setupResult.reminders.check(setupResult.now); setupResult.reminders.check(at(setupResult.now, 430)); };
  const done = setup(); done.reminders._state.repository.courses[0].last_auto_date = "2026-11-23"; wait(done);
  const off = setup(); off.course.slots[0].enabled = false; wait(off);
  const completed = setup(); completed.course.slots[0].completed_on = "2026-11-16"; wait(completed);
  const masterOff = setup(); masterOff.course.schedule_enabled = false; wait(masterOff);
  for (const item of [done, off, completed, masterOff]) assert.equal(item.calls.speak.length, 0);
});

test("no habla si hay una lista en curso, y funciona aunque el dispositivo no vibre", () => {
  const busy = setup({ isBusy: () => true });
  busy.reminders.check(busy.now); busy.reminders.check(at(busy.now, 430));
  assert.equal(busy.calls.speak.length, 0);
  const noVibration = setup({ vibrate: () => false });
  noVibration.reminders.check(noVibration.now); noVibration.reminders.check(at(noVibration.now, 430));
  assert.equal(noVibration.calls.speak.length, 1);
});
