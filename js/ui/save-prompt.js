import { h } from "./dom.js";

const AUTO_HIDE_MS = 15_000;
const RESULT_MS = 1_800;
const SLIDE_MS = 260;

/**
 * Aviso que se desliza desde arriba para guardar el usuario. No es modal:
 * se cierra solo, con «Ahora no» o con la ✕. `onSave` puede lanzar un error si falla.
 */
export class SavePrompt {
  constructor(onSave) {
    this._onSave = onSave;
    this._hideTimer = null;
    this._title = h("h3", {}, "¿Guardar usuario?");
    this._detail = h("p", {}, "Entra con un solo clic la próxima vez. Puedes cambiarlo en Ajustes.");
    this._buttons = h("div", { class: "buttons" },
      h("button", { type: "button", class: "pill", onClick: () => this.dismiss() }, "Ahora no"),
      h("button", { type: "button", class: "pill strong", onClick: () => this._save() }, "Guardar"));
    this.el = h("section", { class: "save-prompt", role: "status", "aria-live": "polite" },
      h("div", { class: "accent" }),
      h("div", { class: "content" },
        h("div", { class: "icon", "aria-hidden": "true" }, "🔑"),
        h("div", {}, this._title, this._detail),
        h("button", { type: "button", class: "close", "aria-label": "Cerrar", onClick: () => this.dismiss() }, "✕")),
      this._buttons);
    document.body.append(this.el);
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.add("is-visible")));
    this._hideTimer = setTimeout(() => this.dismiss(), AUTO_HIDE_MS);
  }

  async _save() {
    clearTimeout(this._hideTimer);
    try {
      await this._onSave();
    } catch (error) {
      this._showResult(`⚠  No se pudo guardar: ${error.message}`, "var(--muted)");
      return;
    }
    this._showResult("✔  Usuario guardado", "var(--success)");
  }

  _showResult(text, color) {
    this._buttons.remove();
    this._detail.remove();
    this._title.textContent = text;
    this._title.style.color = color;
    this._hideTimer = setTimeout(() => this.dismiss(), RESULT_MS);
  }

  dismiss() {
    clearTimeout(this._hideTimer);
    this.el.classList.remove("is-visible");
    setTimeout(() => this.el.remove(), SLIDE_MS);
  }
}
