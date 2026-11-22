import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("tema: claro por defecto, oscuro/automático se guardan y se aplican", async () => {
  const { window } = new JSDOM('<!doctype html><meta name="theme-color" content="#1F4E79"><body></body>', { url: "http://localhost/" });
  Object.defineProperty(globalThis, "document", { value: window.document, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true });
  let dark = false;
  Object.defineProperty(globalThis, "matchMedia", { value: () => ({ matches: dark, addEventListener() {} }), configurable: true });
  const theme = await import("../js/theme.js");
  const html = () => document.documentElement.dataset.theme;
  theme.initTheme();
  assert.equal(theme.getThemePreference(), "light");
  assert.equal(html(), "light");
  theme.toggleTheme();
  assert.equal(html(), "dark");
  assert.equal(window.localStorage.getItem("af_theme"), "dark");
  assert.equal(document.querySelector('meta[name="theme-color"]').getAttribute("content"), "#17395A");
  theme.setThemePreference("auto"); assert.equal(html(), "light");
  dark = true; theme.applyTheme(); assert.equal(html(), "dark");
  theme.setThemePreference("inventado"); assert.equal(theme.getThemePreference(), "auto");
});
