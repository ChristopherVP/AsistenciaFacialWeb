import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("tema: claro por defecto, oscuro se guarda y se aplican", async () => {
  const { window } = new JSDOM('<!doctype html><meta name="theme-color" content="#1F4E79"><body></body>', { url: "http://localhost/" });
  Object.defineProperty(globalThis, "document", { value: window.document, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true });
  const theme = await import("../js/theme.js");
  const html = () => document.documentElement.dataset.theme;
  theme.initTheme();
  assert.equal(theme.getThemePreference(), "light");
  assert.equal(html(), "light");
  theme.toggleTheme();
  assert.equal(html(), "dark");
  assert.equal(window.localStorage.getItem("af_theme"), "dark");
  assert.equal(document.querySelector('meta[name="theme-color"]').getAttribute("content"), "#17395A");
  theme.setThemePreference("inventado"); assert.equal(theme.getThemePreference(), "dark");
  window.localStorage.setItem("af_theme", "auto"); assert.equal(theme.getThemePreference(), "light");
});

test("modo noche: los cuadros de mensaje no llevan fondo blanco fijo", () => {
  const messagebox = readFileSync(new URL("../js/ui/messagebox.js", import.meta.url), "utf8");
  assert.doesNotMatch(messagebox, /background\s*:\s*#fff/i);
  const css = readFileSync(new URL("../css/estilos.css", import.meta.url), "utf8");
  assert.match(css, /\.msgbox \.dialog-actions/);
});
