import { canOfferInstall, installApp } from "./install-help.js";
import { APP_TITLE, SECURITY_QUESTIONS } from "../config.js";
import { AppError } from "../errors.js";
import {
  allowsCedulaInput, allowsNameInput, allowsUsernameInput, normalizeUsername,
} from "../validators.js";
import { brandPanel } from "./branding.js";
import { h, restrictInput } from "./dom.js";

const MAX_SAVED_CARDS = 4;

/**
 * Pantalla de acceso. Devuelve una promesa con el usuario que ingresó.
 * El acceso SIEMPRE es lo primero; crear cuenta y recuperar contraseña son enlaces.
 */
export function runLogin(root, users) {
  return new Promise((resolve) => new LoginScreen(root, users, resolve));
}

class LoginScreen {
  constructor(root, users, onFinish) {
    this._users = users;
    this._onFinish = onFinish;
    this._passwordInputs = [];
    this._showPassword = false;
    this._submit = () => {};
    this._content = h("div", { class: "login-form" });
    root.replaceChildren(h("div", { class: "login" }, brandPanel(), h("main", { class: "login-side" }, this._content)));
    root.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.tagName !== "BUTTON" && event.target.tagName !== "A") this._submit();
    });
    document.title = `${APP_TITLE} — Acceso`;
    this._showLogin();
  }

  /* ---------- piezas reutilizables ---------- */

  _reset(title, hint) {
    this._passwordInputs = [];
    this._error = h("p", { class: "error", role: "alert" });
    this._content.replaceChildren(h("h2", {}, title), h("p", { class: "lead" }, hint));
    return this._content;
  }

  _field(parent, caption, { restrict = null, secret = false, value = "" } = {}) {
    const id = `campo-${crypto.randomUUID().slice(0, 8)}`;
    const input = h("input", {
      class: "input", id, value, autocomplete: secret ? "new-password" : "off",
      type: secret ? "password" : "text", spellcheck: false,
    });
    if (restrict) restrictInput(input, restrict);
    if (secret) {
      this._passwordInputs.push(input);
      input.type = this._showPassword ? "text" : "password";
    }
    parent.append(h("label", { class: "field", for: id }, h("span", {}, caption), input));
    return input;
  }

  _pair(parent) {
    const left = h("div"); const right = h("div");
    parent.append(h("div", { class: "pair" }, left, right));
    return [left, right];
  }

  _passwordToggle(parent) {
    const toggle = h("input", {
      type: "checkbox", checked: this._showPassword,
      onChange: () => {
        this._showPassword = toggle.checked;
        for (const input of this._passwordInputs) input.type = this._showPassword ? "text" : "password";
      },
    });
    parent.append(h("label", { class: "check", style: "margin-top:10px" }, toggle, "👁  Mostrar contraseña"));
  }

  _button(parent, text, style, action) {
    parent.append(h("button", { type: "button", class: `btn ${style} btn-block btn-big`, onClick: action }, text));
  }

  _link(text, action) {
    return h("button", { type: "button", class: "link", onClick: action }, text);
  }

  _fail(error) {
    this._error.textContent = error.message;
  }

  _finish(user) {
    document.title = APP_TITLE;
    this._onFinish(user);
  }

  /* ---------- iniciar sesión ---------- */

  _showLogin(username = "", notice = "") {
    const hint = this._users.hasUsers
      ? "Ingresa con tu usuario y contraseña."
      : "Aún no hay cuentas. Pulsa «Regístrate aquí» para crear la tuya.";
    const body = this._reset("Iniciar sesión", notice || hint);
    const saved = this._users.rememberedUsers().slice(0, MAX_SAVED_CARDS);
    if (saved.length) {
      body.append(h("div", { style: "font-weight:700;font-size:13px" }, "Entrar con un clic"),
        ...saved.map((user) => this._savedCard(user)), h("hr"));
    }
    const userInput = this._field(body, "Usuario", { restrict: allowsUsernameInput, value: username });
    const passwordInput = this._field(body, "Contraseña", { secret: true });
    this._passwordToggle(body);
    body.append(this._error);
    this._submit = () => this._login(userInput.value, passwordInput.value);
    this._button(body, "Ingresar", "btn-primary", () => this._submit());
    body.append(h("div", { class: "links" },
      this._link("¿Olvidaste tu contraseña?", () => this._showRecover(userInput.value)),
      this._link("¿No tienes cuenta? Regístrate aquí", () => this._showRegister()),
      canOfferInstall() ? this._link("📲 Instalar aplicación", () => installApp()) : null));
    (username ? passwordInput : userInput).focus();
  }

  _savedCard(user) {
    return h("button", { type: "button", class: "saved-user", onClick: () => this._enterSaved(user) },
      h("strong", {}, `👤  ${user.full_name}`), h("small", {}, `@${user.username}  ·  ▶ clic para entrar`));
  }

  _enterSaved(user) {
    try {
      this._finish(this._users.authenticateRemembered(user.cedula));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this._showLogin("", error.message);
    }
  }

  async _login(username, password) {
    if (!this._users.hasUsers) {
      this._error.textContent = "Todavía no existe ninguna cuenta. Pulsa «Regístrate aquí» para crear una.";
      return;
    }
    if (!username.trim() || !password) { this._error.textContent = "Escribe tu usuario y tu contraseña."; return; }
    try {
      this._finish(await this._users.authenticate(username, password));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this._fail(error);
    }
  }

  /* ---------- crear cuenta ---------- */

  _usernameStatus(text) {
    if (!text) return ["", "var(--muted)"];
    let name;
    try {
      name = normalizeUsername(text);
    } catch (error) {
      return [error.message, "var(--muted)"];
    }
    return this._users.usernameTaken(name)
      ? [`✖  «${name}» ya está en uso`, "var(--danger)"]
      : [`✔  «${name}» está disponible`, "var(--success)"];
  }

  _showRegister() {
    const hint = this._users.hasUsers ? "Cada cédula y cada usuario son únicos." : "Crea tu cuenta para poder ingresar.";
    const body = this._reset("Crear cuenta", hint);
    const [left, right] = this._pair(body);
    const cedula = this._field(left, "Cédula", { restrict: allowsCedulaInput });
    const username = this._field(right, "Usuario", { restrict: allowsUsernameInput });
    const status = h("div", { class: "hint", style: "font-size:12px;margin-top:4px", "aria-live": "polite" });
    username.addEventListener("input", () => {
      const [text, color] = this._usernameStatus(username.value);
      status.textContent = text;
      status.style.color = color;
    });
    body.append(status);
    const name = this._field(body, "Apellidos y nombres", { restrict: allowsNameInput });
    const [passLeft, passRight] = this._pair(body);
    const password = this._field(passLeft, "Contraseña (mín. 8)", { secret: true });
    const confirm = this._field(passRight, "Repetir contraseña", { secret: true });
    this._passwordToggle(body);
    const questionId = "pregunta-seguridad";
    const question = h("select", { class: "input", id: questionId }, SECURITY_QUESTIONS.map((text) => h("option", { value: text }, text)));
    body.append(h("label", { class: "field", for: questionId }, h("span", {}, "Pregunta de seguridad (para recuperar la cuenta)"), question));
    const answer = this._field(body, "Respuesta");
    body.append(this._error);
    this._submit = async () => {
      try {
        const user = await this._users.register(cedula.value, name.value, username.value, password.value, confirm.value, question.value, answer.value);
        this._showLogin(user.username, "✔ Cuenta creada. Ahora inicia sesión.");
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        this._fail(error);
      }
    };
    this._button(body, "Crear cuenta", "btn-success", () => this._submit());
    body.append(h("div", { class: "links" }, this._link("← Volver a iniciar sesión", () => this._showLogin())));
    cedula.focus();
  }

  /* ---------- recuperar contraseña ---------- */

  _showRecover(username = "") {
    const body = this._reset("Recuperar contraseña", "Escribe tu usuario para ver tu pregunta de seguridad.");
    const input = this._field(body, "Usuario", { restrict: allowsUsernameInput, value: username });
    body.append(this._error);
    this._submit = () => {
      try {
        const question = this._users.securityQuestion(input.value);
        this._showResetForm(input.value.trim().toLowerCase(), question);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        this._fail(error);
      }
    };
    this._button(body, "Continuar", "btn-primary", () => this._submit());
    body.append(h("div", { class: "links" }, this._link("← Volver a iniciar sesión", () => this._showLogin())));
    input.focus();
  }

  _showResetForm(username, question) {
    const body = this._reset("Nueva contraseña", `Usuario @${username}`);
    const answer = this._field(body, question);
    const password = this._field(body, "Nueva contraseña (mínimo 8 caracteres)", { secret: true });
    const confirm = this._field(body, "Repetir nueva contraseña", { secret: true });
    this._passwordToggle(body);
    body.append(this._error);
    this._submit = async () => {
      try {
        const user = await this._users.recoverPassword(username, answer.value, password.value, confirm.value);
        this._showLogin(user.username, "✔ Contraseña actualizada. Inicia sesión.");
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        this._fail(error);
      }
    };
    this._button(body, "Cambiar contraseña", "btn-success", () => this._submit());
    body.append(h("div", { class: "links" }, this._link("← Volver a iniciar sesión", () => this._showLogin())));
    answer.focus();
  }
}
