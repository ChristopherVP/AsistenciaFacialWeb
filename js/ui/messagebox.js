import { APP_TITLE } from "../config.js";
import { h } from "./dom.js";

const ICONS = Object.freeze({ info: "ℹ️", warning: "⚠️", error: "⛔", question: "❓" });

function open({ title = APP_TITLE, text, kind, buttons }) {
  return new Promise((resolve) => {
    const labelId = `msg-${crypto.randomUUID().slice(0, 8)}`;
    const dialog = h("dialog", { class: "msgbox", "aria-labelledby": labelId });
    const close = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.append(
      h("div", { class: "dialog-header" }, h("h2", { id: labelId }, title)),
      h("div", { class: "dialog-body" },
        h("span", { class: "msgbox-icon", "aria-hidden": "true" }, ICONS[kind]),
        h("p", { class: "msgbox-text" }, text)),
      h("div", { class: "dialog-body dialog-actions" },
        buttons.map(({ label, value, style }) => h("button", { type: "button", class: `btn ${style}`, onClick: () => close(value) }, label))),
    );
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(buttons.at(-1).value); });
    document.getElementById("overlay-root").append(dialog);
    dialog.showModal();
    dialog.querySelector(".btn-primary")?.focus();
  });
}

const OK = [{ label: "Aceptar", value: true, style: "btn-primary" }];

export const showInfo = (text, title) => open({ title, text, kind: "info", buttons: OK });
export const showWarning = (text, title) => open({ title, text, kind: "warning", buttons: OK });
export const showError = (text, title) => open({ title, text, kind: "error", buttons: OK });
export const askYesNo = (text, title) => open({
  title, text, kind: "question",
  buttons: [{ label: "Sí", value: true, style: "btn-primary" }, { label: "No", value: false, style: "" }],
});
export const askRetryCancel = (title, text) => open({
  title, text, kind: "warning",
  buttons: [{ label: "Reintentar", value: true, style: "btn-primary" }, { label: "Cancelar", value: false, style: "" }],
});

/** Abre un diálogo modal propio; devuelve una función para cerrarlo. */
export function openDialog(dialog, onClose = () => {}) {
  document.getElementById("overlay-root").append(dialog);
  const close = () => {
    if (!dialog.isConnected) return;
    dialog.close();
    dialog.remove();
    onClose();
  };
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.showModal();
  return close;
}
