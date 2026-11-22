const KEY = "af_theme";
export const THEMES = Object.freeze({ light: "☀️  Claro (día)", dark: "🌙  Oscuro (noche)" });
const THEME_COLOR = Object.freeze({ light: "#1F4E79", dark: "#17395A" });

const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function getThemePreference() {
  try { const saved = storage()?.getItem(KEY); return saved in THEMES ? saved : "light"; } catch { return "light"; }
}

export const resolveTheme = (preference) => (preference === "dark" ? "dark" : "light");

export function applyTheme(preference = getThemePreference()) {
  const theme = resolveTheme(preference);
  const root = globalThis.document?.documentElement;
  if (root) root.dataset.theme = theme;
  globalThis.document?.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  globalThis.dispatchEvent?.(new globalThis.CustomEvent("af-theme", { detail: { preference, theme } }));
  return theme;
}

export function setThemePreference(preference) {
  if (!(preference in THEMES)) return;
  try { storage()?.setItem(KEY, preference); } catch { /* sin almacenamiento: vale solo en esta sesión */ }
  applyTheme(preference);
}

export const toggleTheme = () => setThemePreference(resolveTheme(getThemePreference()) === "dark" ? "light" : "dark");

export function initTheme() {
  applyTheme();
  globalThis.addEventListener?.("storage", (event) => { if (event.key === KEY) applyTheme(); });
}
