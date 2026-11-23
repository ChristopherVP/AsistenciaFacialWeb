import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx-js-style";

import { validateCedula, normalizeFullName, normalizeUsername, allowsHourInput, allowsCedulaInput } from "../js/validators.js";
import { createSlot, courseAddStudent, courseAddSlot, createCourse, createStudent, slotContains, parseTime } from "../js/models.js";
import { describeNext, dueCourses, nextRun } from "../js/scheduler.js";
import { Gallery } from "../js/face-engine.js";
import { AttendanceSession, AttendanceBook, columnLetter } from "../js/attendance.js";
import { buildWorkbookBytes } from "../js/excel.js";
import { FaceEnrollment, Phase, isFrontal } from "../js/enrollment.js";
import { UserRepository, LoginThrottle } from "../js/auth.js";
import { BookRepository, CourseRepository } from "../js/storage.js";
import { AuthError, ValidationError } from "../js/errors.js";

const vector = (seed) => Array.from({ length: 128 }, (_, i) => Math.sin(seed * 31 + i * 1.7));
const student = (id, name, seed) => createStudent(id, name, [vector(seed)]);

test("cédula: acepta una válida y rechaza las demás con el mensaje de Python", () => {
  assert.equal(validateCedula("1710034065"), "1710034065");
  assert.throws(() => validateCedula("1710034066"), /dígito verificador/);
  assert.throws(() => validateCedula("2510034065"), /entre 01 y 24/);
  assert.throws(() => validateCedula("17100"), /no es válida/);
  assert.throws(() => validateCedula("17a0034065"), /solo puede tener números/);
  assert.equal(allowsCedulaInput("12345678901"), false);
});

test("nombres y usuarios", () => {
  assert.equal(normalizeFullName("  pérez   gómez juan "), "PÉREZ GÓMEZ JUAN");
  assert.throws(() => normalizeFullName("Juan"), /al menos dos palabras/);
  assert.throws(() => normalizeFullName("Juan 2 Perez"), /solo pueden tener letras/);
  assert.equal(normalizeUsername(" Ana.Lopez "), "ana.lopez");
  assert.throws(() => normalizeUsername("1ana"), ValidationError);
  assert.equal(allowsHourInput("24"), false);
  assert.equal(allowsHourInput("23"), true);
});

test("horarios: validación y pertenencia (lunes = 0)", () => {
  assert.throws(() => createSlot([], "07:00", "07:20"), /al menos un día/);
  assert.throws(() => createSlot([0], "08:00", "07:00"), /posterior/);
  assert.throws(() => parseTime("7:00"), /Hora inválida/);
  const slot = createSlot([0, 2], "07:00", "07:20");
  assert.equal(slotContains(slot, new Date(2026, 10, 16, 7, 10)), true); // lunes
  assert.equal(slotContains(slot, new Date(2026, 10, 16, 7, 20)), false);
  assert.equal(slotContains(slot, new Date(2026, 10, 17, 7, 10)), false); // martes
});

test("scheduler: curso pendiente, próxima lista y mensaje", () => {
  let course = createCourse({ course_id: "c1", name: "Redes", schedule_enabled: true });
  course = courseAddSlot(course, createSlot([0], "07:00", "07:20"));
  assert.throws(() => courseAddSlot(course, createSlot([0], "07:00", "07:20")), /ya existe/);
  const monday = new Date(2026, 10, 16, 7, 5);
  assert.equal(dueCourses([course], monday).length, 1);
  assert.equal(dueCourses([{ ...course, slots: course.slots.map((slot) => ({ ...slot, ran_on: "2026-11-16" })) }], monday).length, 0);
  assert.match(describeNext([course], monday), /^En horario ahora: Redes · hasta las 07:20$/);
  assert.match(describeNext([course], new Date(2026, 10, 17, 9, 0)), /^Próxima lista automática: Redes · Lun 23\/11 de 07:00 a 07:20$/);
  assert.equal(describeNext([], monday), "Sin listas automáticas programadas");
  assert.equal(nextRun({ ...course, schedule_enabled: false }, monday), null);
});

test("Gallery: umbral, margen entre estudiantes y duplicados", () => {
  const ana = student("111", "ANDRADE ANA", 1);
  const beto = student("222", "BRAVO BETO", 2);
  const gallery = new Gallery([ana, beto]);
  assert.equal(gallery.identify(vector(1), 0.4, 0.05).student_id, "111");
  assert.equal(gallery.identify(vector(99), 0.9, 0), null);
  const twin = new Gallery([ana, student("333", "GEMELO ANA", 1)]);
  assert.equal(twin.identify(vector(1), 0.4, 0.05), null, "dos casi iguales no se asignan");
  assert.equal(gallery.bestMatch([vector(2)], 0.4).student_id, "222");
  assert.equal(gallery.bestMatch([], 0.4), null);
});

test("AttendanceSession: confirma a la 3.ª lectura y avisa «ya registrado»", async () => {
  const ana = student("111", "ANDRADE ANA", 1);
  const engine = {
    detect: async () => [Float32Array.from([10, 10, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99])],
    embed: async () => Float32Array.from(vector(1)),
  };
  const session = new AttendanceSession(engine, new Gallery([ana]), 0.4, 0.05, 3);
  for (let i = 0; i < 2; i += 1) await session.process({});
  assert.deepEqual(session.popEvents(), []);
  await session.process({});
  assert.deepEqual(session.popEvents(), [["registered", "111"]]);
  assert.equal(session.present.has("111"), true);
  assert.equal(session.popEvents().length, 0);
});

test("libro de asistencia + Excel: % con fórmula y celdas vacías antes del ingreso", async () => {
  const repo = new Map();
  const store = { get: async (id) => repo.get(id), save: async (book) => repo.set(book.course_id, structuredClone(book)) };
  const book = new AttendanceBook(store, "c1", "Curso: A/B");
  const ana = student("111", "ANDRADE ANA", 1);
  const beto = student("222", "BRAVO BETO", 2);
  const first = await book.startList(new Date(2026, 10, 18, 7, 0, 33), [ana]);
  assert.equal(first, 0);
  await book.markPresent(first, "111");
  await book.finalize(first, new Set(["111"]), [ana]);
  const second = await book.startList(new Date(2026, 10, 19, 7, 0), [ana, beto]);
  const result = await book.finalize(second, new Set(), [ana, beto]);
  assert.deepEqual(result, { column_letter: "E", present: 0, total: 2 });
  await assert.rejects(book.markPresent(0, "999"), /no está en el Excel/);
  const saved = repo.get("c1");
  assert.equal(saved.sheet_title, "Curso AB");
  assert.equal(saved.columns[1].marks["222"], 0);
  assert.equal(saved.columns[0].marks["222"], undefined);

  const workbook = XLSX.read(buildWorkbookBytes(XLSX, saved), { type: "array", cellStyles: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  assert.equal(sheet.A1.v, "Cédula");
  assert.equal(sheet.C1.v, "% Asistencia");
  assert.match(sheet.C2.f, /^IF\(COUNT\(D2:E2\)=0/);
  assert.equal(sheet.D2.v, 1);
  assert.equal(sheet.D3, undefined);
  assert.equal(sheet.E3.v, 0);
  assert.equal(columnLetter(28), "AB");
});

test("registro facial: 5 muestras de frente → DONE; de perfil → no toma muestras", async () => {
  let now = 0;
  const engine = { embed: async () => Float32Array.from(vector(3)) };
  const enrollment = new FaceEnrollment(engine, () => now);
  const frontal = Float32Array.from([100, 100, 120, 150, 130, 140, 190, 140, 160, 170, 135, 200, 185, 200, 0.99]);
  const profile = Float32Array.from([100, 100, 120, 150, 130, 140, 190, 140, 185, 170, 135, 200, 185, 200, 0.99]);
  assert.equal(isFrontal(frontal), true);
  assert.equal(isFrontal(profile), false);
  now = 1;
  assert.match((await enrollment.update({}, [profile])).prompt, /de frente/);
  assert.equal(enrollment.samples.length, 0);
  let last;
  for (let i = 0; i < 5; i += 1) { now += 0.7; last = await enrollment.update({}, [frontal]); }
  assert.equal(last.phase, Phase.DONE);
  assert.equal(enrollment.samples.length, 5);
  const lost = new FaceEnrollment(engine, () => now);
  now += 61;
  assert.equal((await lost.update({}, [])).phase, Phase.FAILED);
});

test("usuarios: registro, ingreso, bloqueo y recuperación (PBKDF2 real)", async () => {
  let time = 0;
  const users = await UserRepository.load(() => time);
  const user = await users.register("1710034065", "perez gomez juan", "Juan.P", "clave1234", "clave1234",
    "¿Cuál es su comida favorita?", "  Ceviche ");
  assert.equal(user.username, "juan.p");
  assert.equal(user.password_hash.length, 64);
  await assert.rejects(users.register("1710034065", "otro nombre", "otro", "clave1234", "clave1234", "¿Cuál es su comida favorita?", "abc"), /misma cédula|ya existe/i);
  assert.equal((await users.authenticate("JUAN.P", "clave1234")).cedula, "1710034065");
  for (let i = 0; i < 5; i += 1) await assert.rejects(users.authenticate("juan.p", "mala"), /incorrecta/);
  await assert.rejects(users.authenticate("juan.p", "clave1234"), /Demasiados intentos/);
  time = 31;
  await users.recoverPassword("juan.p", "ceviche", "nueva12345", "nueva12345");
  assert.equal((await users.authenticate("juan.p", "nueva12345")).username, "juan.p");
  await users.setRemembered("1710034065", true);
  assert.equal(users.rememberedUsers().length, 1);
  assert.throws(() => users.authenticateRemembered("0000"), AuthError);
  const reloaded = await UserRepository.load();
  assert.equal(reloaded.hasUsers, true);
  assert.equal(new LoginThrottle().check("x"), undefined);
});

test("cursos: crear, renombrar, duplicados, estudiantes ordenados y borrar", async () => {
  const courses = await CourseRepository.load();
  const created = await courses.create("  Infraestructura   2 ");
  assert.match(created.course_id, /^infraestructura-2-[0-9a-f]{6}$/);
  await assert.rejects(courses.create("infraestructura 2"), /Ya existe un curso/);
  await assert.rejects(courses.create("   "), /Escribe el nombre/);
  let course = courseAddStudent(created, student("222", "ÁLVAREZ ZOILA", 2));
  course = courseAddStudent(course, student("111", "BRAVO ANA", 1));
  assert.deepEqual(course.students.map((s) => s.student_id), ["222", "111"]); // Á ordena como A
  assert.throws(() => courseAddStudent(course, student("111", "OTRO NOMBRE", 5)), /Ya existe un estudiante/);
  await courses.save(course);
  const renamed = await courses.rename(created.course_id, "Redes");
  assert.equal(renamed.students.length, 2);
  const again = await CourseRepository.load();
  assert.equal(again.courses[0].name, "Redes");
  await new BookRepository().save({ course_id: created.course_id, rows: [], columns: [] });
  await again.delete(created.course_id);
  assert.equal((await CourseRepository.load()).courses.length, 0);
  assert.equal(await new BookRepository().get(created.course_id), undefined);
});

import { pickFemaleSpanishVoice } from "../js/voice.js";
import { isVirtualCamera } from "../js/camera.js";

test("voz: prefiere una mujer en español y descarta voces masculinas", () => {
  const voice = (name, lang) => ({ name, lang });
  const voices = [voice("Microsoft Raul - Spanish (Mexico)", "es-MX"), voice("Microsoft Helena - Spanish (Spain)", "es-ES"),
    voice("Microsoft Sabina - Spanish (Mexico)", "es-MX"), voice("Microsoft David - English", "en-US")];
  assert.match(pickFemaleSpanishVoice(voices).name, /Sabina/);
  assert.match(pickFemaleSpanishVoice(voices.slice(0, 2)).name, /Helena/);
  assert.equal(pickFemaleSpanishVoice([voice("Samantha", "en-US")]), null);
});

test("cámaras virtuales (OBS) no se listan como cámaras reales", () => {
  assert.equal(isVirtualCamera("OBS Virtual Camera"), true);
  assert.equal(isVirtualCamera("HP TrueVision HD Camera (30c9:0064)"), false);
});
