import { APP_TITLE, APP_VERSION, COLORS, NOTICE_MS } from "../config.js";
import { DEFAULT_SETTINGS } from "../models.js";
import { Camera, detectCameras, displayName } from "../camera.js";
import { AuthError, CameraError } from "../errors.js";
import { installer } from "../pwa.js";
import { canOfferInstall, installApp } from "./install-help.js";
import { PLATFORMS, detectPlatform, helpSteps } from "../permissions.js";
import { CameraPreviewDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { THEMES, getThemePreference, setThemePreference } from "../theme.js";
import { ValidationError } from "../errors.js";
import { LEAD_CHOICES, getReminderLead, saveReminderLead, vibrationSupported } from "./reminders.js";
import { showError } from "./messagebox.js";
import { card } from "./widgets.js";

const NO_CAMERA_TEXT =
  "No se detectó ninguna cámara. Conecte la webcam (o revise la cámara del teléfono), compruebe que otra aplicación no la esté usando " +
  "y que el navegador tenga permiso para usarla. Los pasos para cada dispositivo están en «Permisos del dispositivo», más abajo. Luego pulse Buscar cámaras.";

const CAMERA_STATE_TEXT = Object.freeze({
  granted: "✔ Permitida",
  denied: "⛔ Bloqueada: siga los pasos de más abajo para su dispositivo",
  prompt: "Aún sin decidir: pulse «Permitir cámara» y elija «Permitir»",
});
const CAMERA_STATE_UNKNOWN = "No se puede comprobar en este navegador: pulse «Permitir cámara»";

export class SettingsTab {
  constructor(state) {
    this._state = state;
    this._cameras = [];
    this._selected = null;
    this._saveTimer = null;
    this._build();
  }

  _build() {
    this._cameraStatus = h("p", { class: "hint", style: "margin:10px 0 0", role: "status", "aria-live": "polite" },
      "Pulse «Buscar cámaras» para que el navegador pida permiso y muestre las cámaras disponibles.");
    this._cardsBox = h("div", { class: "camera-cards" });
    this._saveStatus = h("span", { class: "page-success", role: "status", "aria-live": "polite" });
    this.el = h("div", { class: "stack", style: "max-width:1100px" },
      card([
        h("div", { class: "row-between" },
          h("h2", { class: "card-title", style: "margin:0" }, "📷  Cámara del sistema"),
          h("button", { type: "button", class: "btn", onClick: () => this.refreshCameras() }, "🔄  Buscar cámaras")),
        h("p", { class: "hint", style: "margin:4px 0 10px" },
          "Elija la cámara que usará el programa. Pulse «Probar cámara» para ver en vivo cuál está grabando antes de elegirla."),
        this._cardsBox, this._cameraStatus,
      ], { padding: 18 }),
      h("div", { class: "row", style: "margin-top:14px" },
        h("button", { type: "button", class: "btn btn-primary", onClick: () => this._save() }, "💾  Guardar ajustes"),
        this._saveStatus),
      this._buildAppearance(),
      this._buildAccount(),
      this._buildPermissions(),
      this._buildReminders(),
      this._buildInstall(),
      h("p", { class: "hint", style: "text-align:center;margin:6px 0" }, `Versión de la aplicación: ${APP_VERSION}`));
  }

  _buildAccount() {
    const user = this._state.currentUser;
    this._remember = h("input", { type: "checkbox", checked: Boolean(user?.remembered), onChange: () => this._toggleRemember() });
    this._accountStatus = h("p", { class: "success", style: "margin:6px 0 0", role: "status", "aria-live": "polite" });
    return card([
      h("h2", { class: "card-title" }, "👤  Mi cuenta"),
      user ? h("p", { style: "margin:6px 0 8px" }, `${user.full_name}   ·   @${user.username}   ·   Cédula ${user.cedula}`) : null,
      h("label", { class: "check" }, this._remember, "Entrar con un clic (recordar mi usuario en este equipo)"),
      h("p", { class: "hint", style: "margin:4px 0 0" },
        "Si lo desactiva, tendrá que escribir su contraseña cada vez que abra el programa."),
      this._accountStatus,
    ], { padding: 18 });
  }

  _buildAppearance() {
    const radios = Object.entries(THEMES).map(([value, label]) => {
      const input = h("input", { type: "radio", name: "tema", value, checked: getThemePreference() === value, onChange: () => setThemePreference(value) });
      return h("label", { class: "check", style: "margin:4px 0" }, input, label);
    });
    globalThis.addEventListener?.("af-theme", () => radios.forEach((label) => { label.firstChild.checked = label.firstChild.value === getThemePreference(); }));
    return card([
      h("h2", { class: "card-title" }, "🌓  Apariencia"),
      h("p", { class: "hint", style: "margin:4px 0 8px" }, "Elija el tema de colores. También puede cambiarlo con el botón Día/Noche del encabezado. Se guarda en este dispositivo."),
      radios,
    ], { padding: 18 });
  }

  _guide(title, kind) {
    const detected = detectPlatform();
    return h("div", { style: "margin-top:14px" },
      h("h3", { style: "margin:0 0 6px;font-size:15px" }, title),
      Object.entries(PLATFORMS).map(([platform, label]) =>
        h("details", { style: "margin:4px 0", open: platform === detected },
          h("summary", { style: "cursor:pointer;font-weight:600" }, platform === detected ? `${label}  (su dispositivo)` : label),
          h("ol", { style: "margin:6px 0 4px;padding-left:22px;font-size:14px;line-height:1.45" },
            helpSteps(kind, platform).map((step) => h("li", { style: "margin:4px 0" }, step))))));
  }

  _buildPermissions() {
    this._cameraPermission = h("p", { style: "margin:10px 0 0", role: "status", "aria-live": "polite" });
    const permitCamera = async () => { await this.refreshCameras(); await this.refreshPermissions(); };
    globalThis.document?.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.refreshPermissions();
    });
    this.refreshPermissions();
    return card([
      h("h2", { class: "card-title" }, "🔐  Permisos del dispositivo"),
      h("p", { class: "hint", style: "margin:4px 0 10px" },
        "Desde aquí puede pedir cada permiso y ver su estado, sin usar el menú ⋮ de la ventana (que no existe en el celular). " +
        "La cámara es necesaria para tomar lista."),
      h("div", { class: "row", style: "flex-wrap:wrap" },
        h("button", { type: "button", class: "btn", onClick: permitCamera }, "📷  Permitir cámara"),
        h("button", { type: "button", class: "btn", onClick: () => this.refreshPermissions() }, "🔄  Actualizar estado")),
      this._cameraPermission,
      h("p", { class: "hint", style: "margin:10px 0 0" },
        "Si un permiso quedó bloqueado, el navegador ya no vuelve a preguntar: hay que activarlo a mano. Elija su dispositivo:"),
      this._guide("📷  Cómo prender la cámara y darle permiso", "camera"),
      this._guide("📲  Cómo instalar la aplicación", "install"),
    ], { padding: 18 });
  }

  async refreshPermissions() {
    let camera = CAMERA_STATE_UNKNOWN;
    try {
      const { state } = await navigator.permissions.query({ name: "camera" });
      camera = CAMERA_STATE_TEXT[state] ?? CAMERA_STATE_UNKNOWN;
    } catch {
      camera = CAMERA_STATE_UNKNOWN;
    }
    this._cameraPermission.textContent = `Cámara: ${camera}`;
  }

  _buildReminders() {
    const select = h("select", { class: "input", style: "width:auto", "aria-label": "Minutos de anticipación del aviso" },
      LEAD_CHOICES.map((minutes) => h("option", { value: String(minutes) }, minutes === 1 ? "1 minuto antes" : `${minutes} minutos antes`)));
    select.value = String(getReminderLead());
    const status = h("span", { class: "hint", role: "status", "aria-live": "polite" });
    const save = () => {
      try {
        saveReminderLead(Number(select.value));
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        status.textContent = `⚠ ${error.message}`;
        return;
      }
      status.textContent = "✔ Aviso guardado.";
    };
    const item = (title, text) => h("li", { style: "margin:6px 0" }, h("strong", {}, `${title} `), text);
    return card([
      h("h2", { class: "card-title" }, "⏰  Aviso de lista programada"),
      h("p", { class: "hint", style: "margin:4px 0 10px" },
        "Antes de que empiece una lista programada, el dispositivo vibra y una voz dice «Pronto se tomará lista al curso …». Cuando la lista empieza, la voz repite que va a empezar."),
      h("div", { class: "row", style: "flex-wrap:wrap" },
        h("label", { class: "row" }, "Avisar:", select),
        h("button", { type: "button", class: "btn", onClick: save }, "💾  Guardar aviso"),
        status),
      h("p", { class: "hint", style: "margin:8px 0 0" },
        vibrationSupported() ? "✔ Este dispositivo permite vibrar." : "Este dispositivo o navegador no permite vibrar (iPhone, iPad y la mayoría de computadores): solo sonará la voz."),
      h("h3", { style: "margin:16px 0 4px;font-size:15px" }, "Cosas que debe saber"),
      h("ul", { style: "margin:0;padding-left:20px;font-size:14px;line-height:1.45" },
        item("Solo con el programa abierto.", "Una página web cerrada no puede avisar, vibrar ni tomar lista: para que la lista automática funcione, el programa debe estar abierto con la sesión iniciada."),
        item("Sin sorpresas.", "Si crea o activa un horario cuando falta menos tiempo que el aviso, ese aviso no se da de golpe."),
        item("La vibración necesita un toque previo.", "El navegador solo deja vibrar si usted ya tocó la pantalla alguna vez con el programa abierto."),
        item("Nada más.", "No se envía ningún dato fuera de este dispositivo.")),
    ], { padding: 18 });
  }

  _buildInstall() {
    const box = card([
      h("h2", { class: "card-title" }, "📲  Instalar aplicación"),
      h("p", { class: "hint", style: "margin:4px 0 10px" }, "Instale la aplicación en este dispositivo (computador, Android o iPhone) para abrirla como un programa y usarla sin internet. Si el navegador no permite instalar con un toque, el botón le muestra los pasos para su dispositivo."),
      h("button", { type: "button", class: "btn btn-primary", onClick: () => installApp() }, "📲  Instalar aplicación"),
    ], { padding: 18 });
    const update = () => { box.hidden = !canOfferInstall(); };
    installer.onChange(update);
    update();
    return box;
  }

  /* ---------- Cuenta ---------- */

  syncRemember() { this._remember.checked = Boolean(this._state.currentUser?.remembered); }

  async _toggleRemember() {
    const wanted = this._remember.checked;
    try {
      await this._state.setRememberCurrentUser(wanted);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      this._remember.checked = !wanted;
      this._accountStatus.textContent = `⚠ ${error.message}`;
      return;
    }
    this._accountStatus.textContent = wanted
      ? "✔ Usuario guardado: la próxima vez entrará con un clic."
      : "✔ Ya no se guarda el usuario: se pedirá la contraseña al entrar.";
  }

  /* ---------- Cámaras ---------- */

  async refreshCameras(probe = true) {
    if (this._state.sessionActive) { this._cameraStatus.textContent = "Finalice la lista en curso antes de buscar cámaras."; return; }
    this._cameraStatus.textContent = "Buscando cámaras…";
    let cameras;
    try {
      cameras = await detectCameras(probe);
    } catch (error) {
      if (!(error instanceof CameraError)) throw error;
      this._cameras = [];
      this._selected = null;
      this._renderCards();
      this._cameraStatus.textContent = error.message;
      return;
    }
    this._cameras = cameras;
    const settings = this._state.settings;
    if (!cameras.length) {
      this._selected = null;
      this._renderCards();
      this._cameraStatus.textContent = NO_CAMERA_TEXT;
      return;
    }
    const usable = cameras.filter((info) => info.available);
    const saved = usable.find((info) =>
      (settings.camera_name && info.name === settings.camera_name) ||
      (!settings.camera_name && info.index === settings.camera_index));
    const others = usable.filter((info) => info.kind !== "integrated");
    const fallback = others.length === 1 ? others[0] : (usable.at(-1) ?? null);
    this._selected = saved ?? fallback;
    this._renderCards();
    this._cameraStatus.textContent =
      `Cámaras del sistema: ${cameras.map((info) => displayName(info.name)).join(", ")}. ${usable.length} disponible(s) para usar. ` +
      "La elegida dice «EN USO»; pulse «Guardar ajustes» para confirmar.";
  }

  /** Busca cámaras al abrir solo si el navegador ya dio permiso (no pide permiso por sorpresa). */
  async autoRefreshIfPermitted() {
    try {
      const permission = await navigator.permissions.query({ name: "camera" });
      if (permission.state === "granted") await this.refreshCameras(false); // sin encender la cámara
    } catch {
      /* Permissions API no disponible: el usuario pulsa «Buscar cámaras». */
    }
  }

  _renderCards() {
    this._cardsBox.replaceChildren();
    this._badges = [];
    for (const info of this._cameras) {
      const badge = h("button", { type: "button", class: "badge", onClick: () => this._select(info), disabled: !info.available });
      this._badges.push({ info, badge, card: null });
      const cardElement = h("div", { class: "camera-card" },
        h("div", { class: "name" }, displayName(info.name)),
        h("div", { class: "kind" }, info.kind === "integrated" ? "Cámara integrada de la laptop" : `Dispositivo ${info.index}`),
        h("div", { class: "state", style: `color:${info.available ? COLORS.success : COLORS.danger}` },
          info.available ? "● Disponible" : "● No disponible (en uso por otra app)"),
        h("button", { type: "button", class: "btn", disabled: !info.available, onClick: () => this._preview(info) }, "▶  Probar cámara"),
        h("div", {}, badge));
      this._badges.at(-1).card = cardElement;
      this._cardsBox.append(cardElement);
    }
    this._restyleCards();
  }

  async _preview(info) {
    if (this._state.sessionActive) { this._cameraStatus.textContent = "Finalice la lista en curso antes de probar una cámara."; return; }
    let camera;
    try {
      camera = await Camera.open(info.deviceId, info.name);
    } catch (error) {
      if (!(error instanceof CameraError)) throw error;
      await showError(error.message, APP_TITLE);
      return;
    }
    new CameraPreviewDialog({ info, camera, onUse: (chosen) => this._select(chosen) });
  }

  _select(info) {
    this._selected = info;
    this._restyleCards();
  }

  _restyleCards() {
    for (const { info, badge, card: cardElement } of this._badges ?? []) {
      const chosen = this._selected !== null && info.index === this._selected.index;
      cardElement.classList.toggle("is-chosen", chosen);
      badge.classList.toggle("is-chosen", chosen);
      badge.textContent = chosen ? "✔  EN USO" : info.available ? "Usar esta cámara" : "No disponible";
    }
  }

  /* ---------- Guardar ---------- */

  _showSaved(message) {
    clearTimeout(this._saveTimer);
    this._saveStatus.textContent = message;
    this._saveTimer = setTimeout(() => { this._saveStatus.textContent = ""; }, NOTICE_MS);
  }

  async _save() {
    if (this._selected === null) { this._showSaved("⚠ Elija una cámara. Si no hay ninguna, pulse Buscar cámaras."); return; }
    const settings = {
      ...this._state.settings,
      camera_index: this._selected.index, camera_name: this._selected.name,
      camera_device_id: this._selected.deviceId, threshold: DEFAULT_SETTINGS.threshold,
    };
    try {
      await this._state.updateSettings(settings);
    } catch (error) {
      this._showSaved(`⚠ No se pudieron guardar los ajustes: ${error.message}`);
      return;
    }
    this._showSaved("✔ Ajustes guardados");
  }
}
