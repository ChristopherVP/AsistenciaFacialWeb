import { renderFrame } from "../camera.js";
import { h } from "./dom.js";

export function card(content, { padding = 16, className = "" } = {}) {
  const body = h("div", { class: "card-body", style: `padding:${padding}px` }, content);
  return Object.assign(h("div", { class: `card ${className}`.trim() }, body), { body });
}

export function makeChip(text, color) {
  return h("span", { class: "chip", style: `background:${color}` }, text);
}

export function setChip(chip, text, color) {
  chip.textContent = text;
  chip.style.background = color;
}

export class StatCard {
  constructor(caption, color) {
    this._value = h("div", { class: "stat-value", style: `color:${color}` }, "–");
    this._caption = h("div", { class: "stat-caption" }, caption);
    this.el = h("div", { class: "stat-card" }, this._value, this._caption);
  }

  set(value, caption = null) {
    this._value.textContent = value;
    if (caption !== null) this._caption.textContent = caption;
  }
}

export class Stepper {
  constructor(steps) {
    this._steps = steps.map((label, index) => ({
      label, index,
      dot: h("div", { class: "dot", "aria-hidden": "true" }),
      el: h("li", { class: "step" }),
    }));
    this.el = h("ol", { class: "stepper", "aria-label": "Pasos del registro", style: "list-style:none;margin:0;padding:8px 0 4px" });
    for (const step of this._steps) {
      step.el.append(step.dot, step.label);
      this.el.append(step.el);
    }
    this.setActive(0);
  }

  setActive(active) {
    for (const { el, dot, index } of this._steps) {
      const done = index < active;
      el.className = `step${done ? " is-done" : ""}${index === active ? " is-active" : ""}`;
      dot.textContent = done ? "✔" : String(index + 1);
      if (index === active) el.setAttribute("aria-current", "step"); else el.removeAttribute("aria-current");
    }
  }
}

export class ProgressBar {
  constructor(className = "progress-scan") {
    this._bar = h("div", { class: "progress-bar" });
    this.el = h("div", { class: `progress ${className}`, role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, this._bar);
  }

  set(percent) {
    this._bar.style.width = `${percent}%`;
    this.el.setAttribute("aria-valuenow", String(Math.round(percent)));
  }
}

export class CameraView {
  constructor(placeholder) {
    this._placeholderText = placeholder;
    this.canvas = h("canvas", { width: 640, height: 480, "aria-label": "Imagen de la cámara", role: "img" });
    this._placeholder = h("div", { class: "camera-placeholder" }, placeholder);
    this.el = h("div", { class: "camera-view" }, this.canvas, this._placeholder);
  }

  show(frame, results = [], banner = null, scan = null) {
    renderFrame(this.canvas, frame, results, banner, scan);
    this._placeholder.hidden = true;
  }

  clear() {
    const ctx = this.canvas.getContext("2d");
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._placeholder.hidden = false;
    this._placeholder.textContent = this._placeholderText;
  }
}

/** Tabla con filas seleccionables (ratón y teclado) y filas alternadas. */
export class DataTable {
  /** columns: [{ key, title, align?: "center", width? }] */
  constructor(columns, { height = 290, label = "Tabla" } = {}) {
    this._columns = columns;
    this._rows = new Map();
    this._selected = null;
    this.onSelect = () => {};
    this._body = h("tbody");
    const head = h("tr", {}, columns.map((c) => h("th", { scope: "col", class: c.align === "center" ? "center" : "", style: c.width ? `width:${c.width}px` : "" }, c.title)));
    this._table = h("table", { class: "table", "aria-label": label }, h("thead", {}, head), this._body);
    this._empty = h("div", { class: "table-empty", hidden: true });
    this.el = h("div", { class: "table-wrap", style: `--table-height:${height}px` }, this._table, this._empty);
    this._body.addEventListener("keydown", (event) => this._onKey(event));
  }

  get selected() { return this._selected; }

  clear() {
    this._body.replaceChildren();
    this._rows.clear();
    this._selected = null;
  }

  setEmptyText(text) {
    this._empty.textContent = text ?? "";
    this._empty.hidden = !text || this._rows.size > 0;
  }

  add(values, id, tag = "") {
    const row = h("tr", { tabindex: this._rows.size === 0 ? "0" : "-1", class: tag ? `t-${tag}` : "", "aria-selected": "false", dataset: { id } },
      this._columns.map((column, index) => h("td", { class: column.align === "center" ? "center" : "" },
        typeof Node !== "undefined" && values[index] instanceof Node ? values[index] : String(values[index] ?? ""))));
    row.addEventListener("click", () => this.select(id, true));
    this._rows.set(id, row);
    this._body.append(row);
    this._empty.hidden = true;
  }

  select(id, notify = false) {
    for (const [rowId, row] of this._rows) row.setAttribute("aria-selected", String(rowId === id));
    this._selected = this._rows.has(id) ? id : null;
    if (notify) this.onSelect(this._selected);
  }

  _onKey(event) {
    const ids = [...this._rows.keys()];
    const index = ids.indexOf(this._selected);
    let target = null;
    if (event.key === "ArrowDown") target = ids[Math.min(ids.length - 1, index + 1)];
    else if (event.key === "ArrowUp") target = ids[Math.max(0, index - 1)];
    else if (event.key === "Enter" || event.key === " ") target = document.activeElement?.dataset?.id;
    if (target === null || target === undefined) return;
    event.preventDefault();
    this.select(target, true);
    this._rows.get(target)?.focus();
  }
}
