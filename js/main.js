import { APP_TITLE } from "./config.js";
import { DEFAULT_SETTINGS } from "./models.js";
import { loadFaceEngine } from "./model-loader.js";
import { registerServiceWorker } from "./pwa.js";
import { BookRepository, CourseRepository, SettingsRepository } from "./storage.js";
import { UserRepository } from "./auth.js";
import { makeLogo } from "./ui/branding.js";
import { h } from "./ui/dom.js";
import { runLogin } from "./ui/login.js";
import { MainWindow } from "./ui/main-window.js";
import { AppState } from "./ui/state.js";

const splash = {
  root: document.getElementById("splash"),
  message: document.getElementById("splash-message"),
  bar: document.getElementById("splash-bar"),
  actions: document.getElementById("splash-actions"),
};

function reportProgress(message, fraction) {
  splash.message.textContent = message;
  splash.bar.style.width = `${Math.round(fraction * 100)}%`;
}

function showFailure(message) {
  return new Promise((resolve) => {
    splash.message.textContent = message;
    splash.actions.replaceChildren(
      h("button", { type: "button", class: "btn btn-primary", onClick: () => { splash.actions.replaceChildren(); resolve(); } }, "Reintentar"));
  });
}

async function loadEngineWithRetry() {
  for (;;) {
    try {
      return await loadFaceEngine(reportProgress);
    } catch (error) {
      reportProgress("", 0);
      await showFailure(error.message);
    }
  }
}

async function boot() {
  reportProgress("Cargando cursos y ajustes…", 0.02);
  const [repository, { settings, warning }, users] = await Promise.all([
    CourseRepository.load(), new SettingsRepository().load(), UserRepository.load(),
  ]);
  const engine = await loadEngineWithRetry();
  const warnings = [...repository.loadWarnings, users.loadWarning, warning].filter(Boolean);
  const state = new AppState({
    engine, repository, bookRepository: new BookRepository(), settingsRepository: new SettingsRepository(),
    settings: Object.freeze({ ...settings, threshold: DEFAULT_SETTINGS.threshold }), users,
  });
  return { state, warnings };
}

async function main() {
  document.getElementById("splash-logo").append(makeLogo("logo"));
  document.querySelector("#splash-logo .logo").style.cssText = "width:96px;height:96px";
  registerServiceWorker();
  navigator.storage?.persist?.().catch(() => {}); // evita que el navegador borre los datos por falta de espacio
  let context;
  try {
    context = await boot();
  } catch (error) {
    reportProgress(`No se pudo iniciar ${APP_TITLE}: ${error.message}`, 0);
    return;
  }
  const app = document.getElementById("app");
  splash.root.hidden = true;
  app.hidden = false;
  let warnings = context.warnings;
  for (;;) {
    const saved = sessionStorage.getItem("af_user"); // viene de volver desde el Excel
    const user = (saved && context.state.users.get(saved)) || await runLogin(app, context.state.users);
    sessionStorage.setItem("af_user", user.cedula);
    context.state.signIn(user);
    await new MainWindow(app, context.state, warnings).run();
    warnings = [];
    sessionStorage.removeItem("af_user");
    sessionStorage.removeItem("af_tab");
    sessionStorage.removeItem("af_course");
    context.state.clearSubscribers();
    context.state.signOut();
  }
}

main();
