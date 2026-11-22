import { APP_SUBTITLE, APP_TITLE, DAY_LABELS } from "../config.js";
import { formatClock, weekday } from "../models.js";
import { AttendanceTab } from "./attendance-tab.js";
import { makeLogo } from "./branding.js";
import { CoursesTab } from "./courses-tab.js";
import { ExcelTab } from "./excel-tab.js";
import { ScheduleReminders } from "./reminders.js";
import { getThemePreference, resolveTheme, toggleTheme } from "../theme.js";
import { h, wait } from "./dom.js";
import { askYesNo, showWarning } from "./messagebox.js";
import { SavePrompt } from "./save-prompt.js";
import { SettingsTab } from "./settings-tab.js";

const PROMPT_DELAY_MS = 700;
const EXCEL_TAB = 2;

const pad2 = (value) => String(value).padStart(2, "0");
const clockText = (now) =>
  `${DAY_LABELS[weekday(now)]} ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}   ${formatClock(now)}`;

/** Ventana principal: encabezado, pestañas y reloj. `run()` termina al cerrar sesión. */
const reportExitError = (error) => console.error("No se pudo guardar al salir:", error);

export class MainWindow {
  constructor(root, state, warnings = []) {
    this._root = root;
    this._state = state;
    this._warnings = warnings;
    this._timers = [];
    this._attendance = new AttendanceTab(state);
    this._courses = new CoursesTab(state);
    this._settings = new SettingsTab(state);
    this._reminders = new ScheduleReminders(state, { isBusy: () => this._attendance.isRunning });
    this._excel = new ExcelTab(state);
    this._tab = -1; this._before = 1;
    this._courses.onViewExcel = (id) => { this._excel.open(id); this._selectTab(EXCEL_TAB); };
    this._clock = h("span", { class: "header-clock", "aria-label": "Fecha y hora" });
    // Solo hay aviso del navegador (su texto no se puede personalizar) si hay una lista en curso o una celda a medio editar;
    // todo lo demás ya se guarda al instante y al salir se termina de guardar lo pendiente.
    this._leaveGuard = (event) => {
      if (!this._atRisk()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    this._exitSave = () => this._flushForExit();
    this._hiddenSave = () => { if (document.visibilityState === "hidden") this._excel.flush().catch(reportExitError); };
  }

  _atRisk() { return this._attendance.isRunning || this._excel.hasPendingEdit; }

  _flushForExit() {
    this._excel.flush().catch(reportExitError);
    if (this._attendance.isRunning) this._attendance.finishSession().catch(reportExitError);
  }

  _removeExitHandlers() {
    window.removeEventListener("beforeunload", this._leaveGuard);
    window.removeEventListener("pagehide", this._exitSave);
    document.removeEventListener("visibilitychange", this._hiddenSave);
  }

  run() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      document.title = APP_TITLE;
      this._root.replaceChildren(this._buildHeader(), this._buildNotebook());
      window.addEventListener("beforeunload", this._leaveGuard);
      window.addEventListener("pagehide", this._exitSave);
      document.addEventListener("visibilitychange", this._hiddenSave);
      this._showWarnings();
      this._tick();
      this._timers.push(setInterval(() => this._tick(), 1000));
      this._timers.push(setTimeout(() => this._settings.autoRefreshIfPermitted(), 400));
      this._timers.push(setTimeout(() => this._offerRemember(), PROMPT_DELAY_MS));
    });
  }

  async _showWarnings() {
    for (const warning of this._warnings) await showWarning(warning, APP_TITLE);
  }

  /** Botón día/noche del encabezado: muestra a qué tema se cambiará. */
  _buildThemeButton() {
    const button = h("button", { type: "button", class: "btn-header", onClick: toggleTheme });
    const refresh = () => {
      const dark = resolveTheme(getThemePreference()) === "dark";
      button.textContent = dark ? "☀️  Día" : "🌙  Noche";
      button.title = dark ? "Cambiar al tema claro (día)" : "Cambiar al tema oscuro (noche)";
    };
    globalThis.addEventListener?.("af-theme", refresh);
    refresh();
    return button;
  }

  _buildHeader() {
    const user = this._state.currentUser;
    return h("header", { class: "app-header" },
      makeLogo("logo"),
      h("div", { class: "header-titles" }, h("h1", {}, APP_TITLE), h("p", {}, APP_SUBTITLE)),
      user ? h("span", { class: "header-user" }, `👤  ${user.full_name}`) : null,
      this._buildThemeButton(),
      h("button", { type: "button", class: "btn-header", onClick: () => this._logout() }, "Cerrar sesión"),
      this._clock);
  }

  _buildNotebook() {
    const tabs = [
      ["  📷  Tomar lista  ", this._attendance.el],
      ["  📚  Cursos  ", this._courses.el],
      ["  📊  Excel  ", this._excel.el],
      ["  ⚙  Ajustes  ", this._settings.el],
    ];
    const buttons = []; const panels = [];
    this._selectTab = (selected) => {
      if (selected !== this._tab) { if (this._tab !== EXCEL_TAB && this._tab >= 0) this._before = this._tab; this._tab = selected; }
      try { sessionStorage.setItem("af_tab", String(selected)); } catch { /* sin almacenamiento de sesión */ }
      tabs.forEach((_, index) => {
        buttons[index].setAttribute("aria-selected", String(index === selected));
        buttons[index].tabIndex = index === selected ? 0 : -1;
        panels[index].hidden = index !== selected;
      });
      if (selected === EXCEL_TAB) this._excel.activate();
    };
    tabs.forEach(([title, content], index) => {
      const id = `pestana-${index}`;
      buttons.push(h("button", { type: "button", class: "tab", role: "tab", id, "aria-controls": `${id}-panel`, onClick: () => this._selectTab(index),
        onKeydown: (event) => {
          const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!move) return;
          const next = (index + move + tabs.length) % tabs.length;
          this._selectTab(next);
          buttons[next].focus();
        } }, title));
      panels.push(h("section", { class: "tab-panel", role: "tabpanel", id: `${id}-panel`, "aria-labelledby": id }, content));
    });
    const saved = Number(sessionStorage.getItem("af_tab"));
    this._selectTab(saved >= 0 && saved < tabs.length ? saved : 0);
    return h("main", { class: "notebook" }, h("div", { class: "tabs", role: "tablist" }, buttons), panels);
  }

  _tick() {
    const now = new Date();
    this._clock.textContent = clockText(now);
    this._attendance.onTick(now);
    this._reminders.check(now);
  }

  _offerRemember() {
    const user = this._state.currentUser;
    if (user !== null && !user.remembered) {
      this._prompt = new SavePrompt(async () => {
        await this._state.setRememberCurrentUser(true);
        this._settings.syncRemember();
      });
    }
  }

  async _confirmEndSession(action) {
    if (!this._attendance.isRunning) return true;
    if (!(await askYesNo(`Hay una lista en curso.\n¿Finalizar y guardar antes de ${action}?`, APP_TITLE))) return false;
    await this._attendance.finishSession();
    return true;
  }

  async _logout() {
    if (!(await askYesNo("¿Seguro que quieres cerrar sesión?", APP_TITLE))) return;
    if (!(await this._confirmEndSession("cerrar sesión"))) return;
    for (const timer of this._timers) { clearInterval(timer); clearTimeout(timer); }
    this._removeExitHandlers();
    this._prompt?.dismiss();
    await wait(0);
    this._resolve();
  }
}
