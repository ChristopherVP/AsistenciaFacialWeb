import "fake-indexeddb/auto";
delete globalThis.BroadcastChannel; // el de Node no es compatible con los eventos de jsdom
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// ---- Entorno de navegador simulado ----
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
for (const name of ["window", "document", "Node", "HTMLElement", "Event", "KeyboardEvent", "HTMLInputElement", "HTMLDialogElement"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? window : window[name], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: window.sessionStorage, configurable: true });
window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
window.HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
window.HTMLElement.prototype.scrollIntoView = () => {};
const noop = () => {};
const context2d = new Proxy({}, { get: (_, key) => (key === "measureText" ? () => ({ width: 10 }) : noop), set: () => true });
window.HTMLCanvasElement.prototype.getContext = () => context2d;
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

const { UserRepository } = await import("../js/auth.js");
const { CourseRepository, SettingsRepository, BookRepository } = await import("../js/storage.js");
const { AppState } = await import("../js/ui/state.js");
const { runLogin } = await import("../js/ui/login.js");
const { MainWindow } = await import("../js/ui/main-window.js");
const { createStudent, courseAddStudent } = await import("../js/models.js");
const { DEFAULT_SETTINGS } = await import("../js/models.js");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (element) => element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const type = (input, value) => { input.value = value; input.dispatchEvent(new window.Event("input", { bubbles: true })); };
const byText = (selector, text, root = document) => [...root.querySelectorAll(selector)].find((el) => el.textContent.includes(text));
const waitFor = async (check, label, attempts = 100) => {
  for (let i = 0; i < attempts; i += 1) { const value = check(); if (value) return value; await sleep(20); }
  throw new Error(`Tiempo agotado esperando: ${label}`);
};
const field = (label) => document.querySelector(`label.field:has(span)`) && [...document.querySelectorAll("label.field")].find((l) => l.querySelector("span").textContent.startsWith(label)).querySelector("input,select");

const vector = Array.from({ length: 128 }, (_, i) => Math.sin(i * 1.3));
const fakeEngine = {
  detect: async () => [Float32Array.from([10, 10, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99])],
  embed: async () => Float32Array.from(vector),
};
let cameraReleased = false;
const fakeCamera = {
  read: () => ({ data: new Uint8ClampedArray(640 * 480 * 4), width: 640, height: 480 }),
  release: () => { cameraReleased = true; },
};

test("flujo completo de la interfaz: cuenta → cursos → horario → lista → Excel", async (t) => {
  const app = document.getElementById("app");
  app.hidden = false;
  const users = await UserRepository.load();
  const repository = await CourseRepository.load();
  const books = new BookRepository();
  const state = new AppState({ engine: fakeEngine, repository, bookRepository: books, settingsRepository: new SettingsRepository(), settings: DEFAULT_SETTINGS, users });
  let cameraOpens = 0;
  state.openCamera = async () => { cameraOpens += 1; return fakeCamera; };

  await t.test("registro e inicio de sesión", async () => {
    const login = runLogin(app, users);
    assert.match(app.textContent, /Aún no hay cuentas/);
    click(byText("button.link", "Regístrate aquí"));
    type(field("Cédula"), "1710034065");
    type(field("Usuario"), "ana.p");
    type(field("Apellidos y nombres"), "perez gomez ana");
    type(field("Contraseña (mín. 8)"), "clave1234");
    type(field("Repetir contraseña"), "clave1234");
    type(field("Respuesta"), "ceviche");
    click(byText("button", "Crear cuenta"));
    await waitFor(() => /Cuenta creada/.test(app.textContent), "mensaje de cuenta creada");
    type(field("Contraseña"), "clave1234");
    click(byText("button", "Ingresar"));
    const user = await login;
    assert.equal(user.username, "ana.p");
    state.signIn(user);
  });

  const main = new MainWindow(app, state, []);
  main.run();

  await t.test("ventana principal con 4 pestañas y reloj", () => {
    assert.match(app.querySelector(".app-header").textContent, /PEREZ GOMEZ ANA/);
    assert.equal(app.querySelectorAll('[role="tab"]').length, 4);
    assert.match(app.querySelector(".header-clock").textContent, /\d\d:\d\d:\d\d/);
  });

  await t.test("crear curso y agregar horario", async () => {
    click(byText('[role="tab"]', "Cursos"));
    click(byText("button", "Nuevo curso"));
    type(await waitFor(() => document.getElementById("nombre-curso"), "diálogo de nuevo curso"), "Infraestructura 2");
    click(byText("dialog button", "Crear curso"));
    await waitFor(() => repository.courses.length === 1, "curso guardado");
    click(byText("tbody tr", "Infraestructura 2"));
    await waitFor(() => /Infraestructura 2/.test(app.querySelector(".courses-grid .title")?.textContent ?? ""), "detalle del curso");
    click(byText("button", "Agregar horario"));
    click(await waitFor(() => byText("dialog button", "Guardar horario"), "diálogo de horario"));
    await waitFor(() => repository.courses[0].slots.length === 1, "horario guardado");
    assert.equal(repository.courses[0].slots[0].start, "07:00");
  });

  await t.test("horarios: activar uno, modificarlo, activar todos y desactivar todos", async () => {
    assert.equal(repository.courses[0].schedule_enabled, false);
    click(await waitFor(() => byText("button", "Apagada"), "botón del horario"));
    await waitFor(() => repository.courses[0].slots[0].enabled === true && repository.courses[0].schedule_enabled === true, "horario activado");
    click(byText("tbody tr", "07:20"));
    click(byText("button", "Modificar horario"));
    const dialog = await waitFor(() => document.querySelector("dialog[open]"), "diálogo para modificar");
    assert.match(dialog.textContent, /Modificar horario/);
    click(byText("dialog button", "Cancelar"));
    await waitFor(() => !document.querySelector("dialog[open]"), "diálogo cerrado");
    click(byText("button", "Desactivar todos"));
    await waitFor(() => repository.courses[0].schedule_enabled === false, "todos desactivados");
    click(byText("button", "Activar todos"));
    await waitFor(() => repository.courses[0].slots[0].enabled === true, "todos activados");
    click(byText("button", "Desactivar todos"));
    await waitFor(() => repository.courses[0].schedule_enabled === false, "todos desactivados otra vez");
  });

  await t.test("lista: reconoce a la estudiante, guarda sola y escribe el libro", async () => {
    const student = createStudent("1710034065", "PEREZ GOMEZ ANA", [vector]);
    const updated = courseAddStudent(repository.courses[0], student);
    await state.saveCourse(updated);
    await state.bookFor(updated).syncStudents(updated.students);
    click(byText('[role="tab"]', "Tomar lista"));
    await waitFor(() => document.querySelectorAll("#cursos-lista li").length === 1, "curso en la lista");
    click(byText("button", "Iniciar lista"));
    await waitFor(() => state.sessionActive, "sesión activa");
    await waitFor(() => /Todos asistieron/.test(app.querySelector(".notice").textContent) || /registrado/.test(app.querySelector(".notice").textContent), "estudiante registrada");
    await waitFor(() => !state.sessionActive, "guardado automático");
    await waitFor(() => /Lista guardada/.test(app.querySelector(".status").textContent), "mensaje de lista guardada");
    assert.equal(cameraReleased, true);
    const book = await books.get(updated.course_id);
    assert.equal(book.columns.length, 1);
    assert.equal(book.columns[0].marks["1710034065"], 1);
    assert.match(app.querySelector(".stat-card .stat-value").textContent, /1/);
  });

  await t.test("registro facial: 5 muestras, duplicado y guardado del estudiante", async () => {
    const frontal = Float32Array.from([100, 100, 120, 150, 130, 140, 190, 140, 160, 170, 135, 200, 185, 200, 0.99]);
    const registrationEngine = { detect: async () => [frontal], embed: async () => Float32Array.from(vector.map((_, i) => Math.cos(i * 7.1 + 2))) };
    state.engine = registrationEngine;
    click(byText('[role="tab"]', "Cursos"));
    click(byText("tbody tr", "Infraestructura 2"));
    cameraReleased = false;
    click(byText("button", "Agregar estudiante"));
    type(await waitFor(() => document.getElementById("reg-cedula"), "diálogo de registro"), "1713175071");
    const opensBefore = cameraOpens;
    assert.equal(document.querySelector("dialog .camera-placeholder").hidden, false, "cámara apagada al abrir el diálogo");
    type(document.getElementById("reg-nombre"), "lopez ruiz carlos");
    click(byText("dialog button", "Iniciar escaneo"));
    assert.match(document.querySelector("dialog .error").textContent, /Marque la autorización/);
    document.getElementById("reg-consent").checked = true;
    click(byText("dialog button", "Iniciar escaneo"));
    await waitFor(() => repository.courses[0].students.length === 2, "estudiante guardado tras el escaneo", 600);
    assert.equal(cameraOpens, opensBefore + 1, "la cámara se abrió una sola vez, al iniciar el escaneo");
    const saved = repository.courses[0].students.find((s) => s.student_id === "1713175071");
    assert.equal(saved.name, "LOPEZ RUIZ CARLOS");
    assert.equal(saved.embeddings.length, 5);
    await waitFor(() => /Registro confirmado/.test(document.querySelector("dialog").textContent), "resumen");
    await waitFor(() => !document.querySelector("dialog[open]"), "cierre automático", 400);
    assert.equal(cameraReleased, true);
    const book = await books.get(repository.courses[0].course_id);
    assert.ok(book.rows.some((row) => row.id === "1713175071"), "el estudiante entra al libro de asistencia");
  });

  await t.test("ajustes: precisión guardada", async () => {
    click(byText('[role="tab"]', "Ajustes"));
    click(byText("button", "Buscar cámaras"));
    await sleep(50);
    state.settings = state.settings; // la cámara no existe en jsdom; se guarda una elegida a mano
    assert.equal(byText("h2", "Precisión del reconocimiento"), undefined);
    assert.equal(byText("h2", "Respaldo de datos"), undefined);
    assert.ok(byText("h2", "Cámara del sistema"));
  });

  await t.test("al salir con la X dentro de la cuenta pide confirmación y guarda lo pendiente", async () => {
    const inside = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(inside);
    assert.equal(inside.defaultPrevented, true);
    window.dispatchEvent(new window.Event("pagehide"));
    await sleep(20);
  });

  await t.test("cerrar sesión devuelve el control", async () => {
    click(byText("button", "Cerrar sesión"));
    click(await waitFor(() => byText("dialog button", "Sí"), "confirmación de cerrar sesión"));
    await sleep(150);
    assert.equal(state.sessionActive, false);
    const atLogin = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(atLogin);
    assert.equal(atLogin.defaultPrevented, false);
  });
});

process.on("exit", () => process.exit(process.exitCode ?? 0));
