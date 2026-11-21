import { APP_TITLE, COLORS, NOTICE_MS } from "../config.js";
import { DEFAULT_SETTINGS } from "../models.js";
import { Camera, detectCameras } from "../camera.js";
import { AuthError, CameraError } from "../errors.js";
import { installer } from "../pwa.js";
import { CameraPreviewDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { showError } from "./messagebox.js";
import { card } from "./widgets.js";

const NO_CAMERA_TEXT =
  "No se detectó ninguna cámara. Conecte la webcam y revise que el navegador tenga permiso para usarla " +
  "(candado de la barra de direcciones) y que el sistema permita el acceso a la cámara. Luego pulse Buscar cámaras.";

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
      this._buildAccount(),
      this._buildInstall());
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

  _buildInstall() {
    const box = card([
      h("h2", { class: "card-title" }, "📲  Instalar aplicación"),
      h("p", { class: "hint", style: "margin:4px 0 10px" }, "Instale la aplicación en este equipo para abrirla como un programa y usarla sin internet."),
      h("button", { type: "button", class: "btn", onClick: () => installer.prompt() }, "Instalar"),
    ], { padding: 18 });
    const update = () => { box.hidden = !installer.canInstall; };
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

  async refreshCameras() {
    if (this._state.sessionActive) { this._cameraStatus.textContent = "Finalice la lista en curso antes de buscar cámaras."; return; }
    this._cameraStatus.textContent = "Buscando cámaras…";
    let cameras;
    try {
      cameras = await detectCameras();
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
      `Cámaras del sistema: ${cameras.map((info) => info.name).join(", ")}. ${usable.length} disponible(s) para usar. ` +
      "La elegida dice «EN USO»; pulse «Guardar ajustes» para confirmar.";
  }

  /** Busca cámaras al abrir solo si el navegador ya dio permiso (no pide permiso por sorpresa). */
  async autoRefreshIfPermitted() {
    try {
      const permission = await navigator.permissions.query({ name: "camera" });
      if (permission.state === "granted") await this.refreshCameras();
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
        h("div", { class: "name" }, info.name),
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
