import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("service worker: instalar es rápido y los archivos pesados tienen su propia caché que no se borra al actualizar", () => {
  const sw = read("sw.js");
  const install = sw.slice(sw.indexOf('addEventListener("install"'), sw.indexOf('addEventListener("activate"'));
  assert.doesNotMatch(install, /HEAVY/);
  assert.match(sw, /const HEAVY_CACHE = "asistencia-facial-pesados-v\d+"/);
  assert.match(sw, /key !== VERSION && key !== HEAVY_CACHE/);
  assert.match(sw, /adoptOldHeavy/);
  assert.match(sw, /WARM_HEAVY/);
});

test("Netlify: los modelos y el runtime se guardan un año en el navegador", () => {
  assert.ok(existsSync(new URL("../_headers", import.meta.url)));
  const headers = read("_headers");
  assert.match(headers, /\/modelos\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/vendor\/ort\/\*/);
});

test("instalación en iPhone y Android: etiquetas de la página y pasos para cada dispositivo", async () => {
  const html = read("index.html");
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  const { helpSteps } = await import("../js/permissions.js");
  assert.match(helpSteps("install", "ios").join(" "), /Agregar a pantalla de inicio/);
  assert.match(helpSteps("install", "android").join(" "), /Instalar aplicación/);
});

test("el botón instalar siempre está disponible si la app no está instalada y explica los pasos si el navegador no deja instalar con un toque", async () => {
  const { window } = new JSDOM('<!doctype html><body><div id="overlay-root"></div></body>', { url: "http://localhost/" });
  for (const name of ["window", "document", "Node", "HTMLElement", "Event", "HTMLDialogElement"]) {
    Object.defineProperty(globalThis, name, { value: name === "window" ? window : window[name], configurable: true });
  }
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  window.HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
  const { canOfferInstall, installApp } = await import("../js/ui/install-help.js");
  assert.equal(canOfferInstall(), true);
  const pending = installApp();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const dialog = document.querySelector("dialog[open]");
  assert.match(dialog.textContent, /Para instalar la aplicación/);
  assert.match(dialog.textContent, /1\./);
  [...dialog.querySelectorAll("button")][0].click();
  assert.equal(await pending, "manual");
});

test("la sesión sigue abierta al cerrar la ventana: se guarda en localStorage y solo Cerrar sesión la borra", () => {
  const main = read("js/main.js");
  assert.match(main, /localStorage\.setItem\("af_user"/);
  assert.match(main, /localStorage\.removeItem\("af_user"\)/);
  assert.doesNotMatch(main, /sessionStorage/);
});

test("la versión que se muestra en Ajustes coincide con la del service worker", async () => {
  const { APP_VERSION } = await import("../js/config.js");
  assert.match(read("sw.js"), new RegExp(`const VERSION = "asistencia-facial-v${APP_VERSION}"`));
});
