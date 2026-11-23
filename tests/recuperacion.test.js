import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { UserRepository } from "../js/auth.js";

const QUESTION = "¿Cuál es su comida favorita?";

test("recuperar contraseña por cédula: buscar cuenta, verificar respuesta y solo entonces cambiar la clave", async () => {
  let time = 0;
  const users = await UserRepository.load(() => time);
  await users.register("1710034065", "perez gomez juan", "juan.p", "clave1234", "clave1234", QUESTION, "Ceviche");
  assert.throws(() => users.recoveryQuestion("1710034099"), /No se encontró ninguna cuenta con esa cédula/);
  assert.throws(() => users.recoveryQuestion("123"), /cédula/i);
  assert.deepEqual(users.recoveryQuestion("1710034065"), { question: QUESTION, username: "juan.p" });
  await assert.rejects(users.verifyRecoveryAnswer("1710034065", "pizza"), /respuesta de seguridad es incorrecta/);
  await assert.rejects(users.recoverPasswordByCedula("1710034065", "pizza", "nueva12345", "nueva12345"), /incorrecta/);
  assert.equal((await users.authenticate("juan.p", "clave1234")).username, "juan.p");
  await assert.rejects(users.recoverPasswordByCedula("1710034065", "ceviche", "corta", "corta"), /contraseña/i);
  await users.recoverPasswordByCedula("1710034065", " CEVICHE ", "nueva12345", "nueva12345");
  assert.equal((await users.authenticate("juan.p", "nueva12345")).cedula, "1710034065");
  for (let attempt = 0; attempt < 5; attempt += 1) await assert.rejects(users.verifyRecoveryAnswer("1710034065", "mal"), /incorrecta/);
  await assert.rejects(users.verifyRecoveryAnswer("1710034065", "ceviche"), /Demasiados intentos/);
});

test("pantalla de recuperación: la pregunta solo aparece si la cédula existe y la clave nueva solo si la respuesta es correcta", async () => {
  const { window } = new JSDOM('<!doctype html><body><div id="app"></div></body>', { url: "http://localhost/" });
  for (const name of ["window", "document", "Node", "HTMLElement", "Event", "KeyboardEvent", "HTMLInputElement", "HTMLDialogElement"]) {
    Object.defineProperty(globalThis, name, { value: name === "window" ? window : window[name], configurable: true });
  }
  Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true });
  const users = await UserRepository.load();
  await users.register("0901234567", "lopez ruiz ana", "ana.l", "clave1234", "clave1234", QUESTION, "Ceviche");
  const { runLogin } = await import("../js/ui/login.js");
  const app = document.getElementById("app");
  const finished = runLogin(app, users);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (text) => [...document.querySelectorAll("button")].find((button) => button.textContent.includes(text)).click();
  const type = (input, value) => { input.value = value; input.dispatchEvent(new window.Event("input", { bubbles: true })); };
  const inputs = () => [...document.querySelectorAll("input.input")];
  const text = () => document.querySelector(".login-form").textContent;

  click("¿Olvidaste tu contraseña?");
  assert.match(text(), /Escribe tu número de cédula/);
  assert.doesNotMatch(text(), /comida favorita/);
  type(inputs()[0], "1710034099");
  click("Buscar cuenta");
  assert.match(document.querySelector(".error").textContent, /No se encontró ninguna cuenta con esa cédula/);
  assert.doesNotMatch(text(), /comida favorita/);

  const registered = users.findByUsername("ana.l");
  assert.ok(registered, "la cuenta de prueba existe");
  type(inputs()[0], registered.cedula);
  click("Buscar cuenta");
  assert.match(text(), /Cuenta encontrada: @ana\.l/);
  assert.match(text(), /comida favorita/);
  assert.equal(inputs().length, 1);

  type(inputs()[0], "pizza");
  click("Verificar respuesta");
  await sleep(300);
  assert.match(document.querySelector(".error").textContent, /incorrecta/);
  assert.equal(inputs().length, 1);

  type(inputs()[0], "ceviche");
  click("Verificar respuesta");
  await sleep(300);
  assert.match(text(), /Datos correctos/);
  assert.equal(inputs().length, 2);

  const [password, confirm] = inputs();
  type(password, "nueva12345");
  type(confirm, "nueva12345");
  click("Cambiar contraseña");
  await sleep(600);
  assert.match(text(), /Contraseña actualizada/);
  assert.equal((await users.authenticate("ana.l", "nueva12345")).username, "ana.l");
  void finished;
});
