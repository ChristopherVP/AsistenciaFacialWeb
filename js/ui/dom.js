/** Crea un elemento: h("button", { class: "btn", onClick: fn }, "Texto", otroNodo). */
export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "class") element.className = value;
    else if (name === "for") element.setAttribute("for", value);
    else if (name === "style") element.style.cssText = value;
    else if (name.startsWith("on") && typeof value === "function") element.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name in element && typeof value !== "object") element[name] = value;
    else element.setAttribute(name, value === true ? "" : value);
  }
  append(element, children);
  return element;
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function replaceChildren(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
}

export const svgNs = "http://www.w3.org/2000/svg";

/** Parsea marcado SVG estático y devuelve el elemento. */
export function svgFromMarkup(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

export const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Solo deja escribir lo que `allows` acepta (equivale al validate="key" de Tkinter). */
export function restrictInput(input, allows) {
  let lastValid = input.value;
  input.addEventListener("input", () => {
    if (allows(input.value)) {
      lastValid = input.value;
    } else {
      const position = Math.max(0, (input.selectionStart ?? lastValid.length) - 1);
      input.value = lastValid;
      input.setSelectionRange(position, position);
    }
  });
}
