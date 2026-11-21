import { APP_SUBTITLE, APP_TITLE } from "../config.js";
import { h, svgFromMarkup } from "./dom.js";

/** Logo de la app (mismo dibujo que branding.make_logo, en una cuadrícula de 100). */
export const LOGO_MARKUP = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Logo de Asistencia Facial">
  <rect x="2" y="2" width="96" height="96" rx="22" fill="#1F4E79"/>
  <rect x="30" y="24" width="22" height="14" rx="4" fill="#EAF2F8"/>
  <rect x="14" y="32" width="72" height="44" rx="9" fill="#EAF2F8"/>
  <circle cx="50" cy="55" r="18" fill="#1F4E79"/>
  <circle cx="50" cy="55" r="13" fill="#2E86C1"/>
  <circle cx="50" cy="55" r="7" fill="#153250"/>
  <circle cx="47.5" cy="51.5" r="2.5" fill="#fff" fill-opacity=".9"/>
  <circle cx="76" cy="42" r="4" fill="#B03A2E"/>
  <circle cx="78" cy="76" r="16" fill="#2E8B57" stroke="#fff" stroke-width="2.5"/>
  <polyline points="70,76 76,82 87,69" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export const makeLogo = (className = "logo") => {
  const svg = svgFromMarkup(LOGO_MARKUP);
  svg.setAttribute("class", className);
  return svg;
};

const FEATURES = Object.freeze([
  "📷  Registro rápido con tu rostro",
  "✔  Listas de asistencia en Excel",
  "🔒  Acceso protegido con tu cuenta",
]);

/** Visor de cámara con lente y marco de reconocimiento (equivale a BrandPanel). */
const LENS_MARKUP = (() => {
  const x = 150; const y = 150; const r = 58;
  const half = r * 1.35; const arm = r * 0.38; const badge = r * 0.3;
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => {
    const cx = x + sx * half; const cy = y + sy * half;
    return `<polyline points="${cx - sx * arm},${cy} ${cx},${cy} ${cx},${cy - sy * arm}" fill="none" stroke="#7FD1F0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  })).join("");
  const bx = x + half; const by = y + half;
  return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="${x}" cy="${y}" r="${r * 1.75}" fill="none" stroke="#2A6AA0"/>
    <circle cx="${x}" cy="${y}" r="${r * 1.45}" fill="none" stroke="#3A7DB5"/>
    <circle cx="${x}" cy="${y}" r="${r * 1.1}" fill="#0E2C4A" stroke="#4A90C8" stroke-width="3"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.82}" fill="#1F4E79" stroke="#2E86C1" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="#2E86C1"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.34}" fill="#0B2038"/>
    <circle cx="${x - r * 0.14}" cy="${y - r * 0.14}" r="${r * 0.09}" fill="#CFE8FA"/>
    ${corners}
    <line x1="${x - half}" y1="${y}" x2="${x + half}" y2="${y}" stroke="#5BC0EB" stroke-dasharray="6 6"/>
    <circle cx="${bx}" cy="${by}" r="${badge}" fill="#2E8B57" stroke="#fff" stroke-width="3"/>
    <polyline points="${bx - badge * 0.45},${by} ${bx - badge * 0.1},${by + badge * 0.4} ${bx + badge * 0.5},${by - badge * 0.35}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
})();

export function brandPanel() {
  return h("aside", { class: "brand-panel" },
    svgFromMarkup(LENS_MARKUP),
    h("h1", {}, APP_TITLE),
    h("p", { class: "tagline" }, APP_SUBTITLE),
    h("ul", {}, FEATURES.map((feature) => h("li", {}, feature))));
}
