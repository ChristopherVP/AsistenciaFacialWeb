export const PLATFORMS = Object.freeze({
  desktop: "💻  Computador (Windows, Mac, Linux)",
  android: "🤖  Celular o tablet Android",
  ios: "🍎  iPhone o iPad",
});

export function detectPlatform(userAgent = globalThis.navigator?.userAgent ?? "", touchPoints = globalThis.navigator?.maxTouchPoints ?? 0) {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

export const isInstalledApp = () =>
  Boolean(globalThis.matchMedia?.("(display-mode: standalone)").matches || globalThis.navigator?.standalone);

const STEPS = Object.freeze({
  camera: Object.freeze({
    desktop: Object.freeze([
      "Si su computador tiene tapa o interruptor de la cámara, ábralo. Luego pulse «📷 Permitir cámara» en esta pantalla y, en el aviso del navegador, elija «Permitir».",
      "Si el aviso no aparece o ya lo bloqueó, en el navegador pulse el candado 🔒 (o el icono de ajustes) junto a la dirección → Cámara → Permitir, y recargue la página.",
      "En la aplicación instalada: abra el menú ⋮ de la ventana (arriba a la derecha) → Configuración de la aplicación → Cámara → Permitir.",
      "Si la cámara sigue sin verse: en Windows abra Configuración → Privacidad y seguridad → Cámara y permita el acceso; cierre otros programas que la usen (Zoom, Teams, OBS).",
    ]),
    android: Object.freeze([
      "Pulse «📷 Permitir cámara» en esta pantalla y, en el aviso, elija «Permitir» o «Mientras la app está en uso».",
      "Si el aviso no aparece o ya lo bloqueó, en Chrome pulse el icono a la izquierda de la dirección (candado o ajustes) → Permisos → Cámara → Permitir, y recargue la página.",
      "Si instaló la aplicación: mantenga pulsado su icono → Información de la aplicación (ⓘ) → Permisos → Cámara → Permitir solo mientras se usa la aplicación.",
      "Otra vía: Ajustes del teléfono → Aplicaciones → Chrome (o Asistencia Facial) → Permisos → Cámara → Permitir.",
      "Cierre otras aplicaciones que estén usando la cámara.",
    ]),
    ios: Object.freeze([
      "Pulse «📷 Permitir cámara» en esta pantalla y, en el aviso, elija «Permitir».",
      "Si el aviso no aparece o ya lo bloqueó, en Safari toque «aA» junto a la dirección → Configuración del sitio web → Cámara → Permitir, y recargue la página.",
      "También: Ajustes del iPhone → Apps → Safari → Cámara → Preguntar o Permitir (en iOS anteriores a 18: Ajustes → Safari → Cámara).",
      "Si usa Chrome en iPhone: Ajustes → Chrome → Cámara → activar.",
      "Si agregó la aplicación a la pantalla de inicio, ábrala desde ese icono y elija «Permitir» cuando aparezca el aviso de la cámara.",
    ]),
  }),
  install: Object.freeze({
    desktop: Object.freeze([
      "En Chrome: pulse el icono de instalar en la barra de direcciones, o el menú ⋮ → Instalar Asistencia Facial.",
      "En Edge: menú ⋯ → Aplicaciones → Instalar este sitio como una aplicación.",
    ]),
    android: Object.freeze([
      "En Chrome: menú ⋮ → Instalar aplicación (o Agregar a la pantalla principal).",
      "La aplicación queda con su propio icono y sigue funcionando sin internet.",
    ]),
    ios: Object.freeze([
      "En Safari: botón Compartir → Agregar a pantalla de inicio.",
      "Abra siempre la aplicación desde ese icono.",
    ]),
  }),
});

export const helpSteps = (kind, platform) => STEPS[kind][platform];

const BLOCKED = Object.freeze({
  camera: Object.freeze({
    subject: "La cámara está bloqueada", label: "Cámara",
    android: "En Chrome pulse el icono a la izquierda de la dirección → Permisos → Cámara → Permitir y recargue la página. Con la aplicación instalada: mantenga pulsado su icono → Información de la aplicación → Permisos → Cámara → Permitir.",
    ios: "En Safari toque «aA» junto a la dirección → Configuración del sitio web → Cámara → Permitir, o abra Ajustes del iPhone → Apps → Safari → Cámara.",
  }),
});

const GUIDE_POINTER = "Los pasos para cada dispositivo están en Ajustes → Permisos del dispositivo.";

export function blockedMessage(kind, platform = detectPlatform(), installed = isInstalledApp()) {
  const text = BLOCKED[kind];
  let steps;
  if (platform === "android") steps = text.android;
  else if (platform === "ios") steps = text.ios;
  else if (installed) steps = `Abra el menú ⋮ de la ventana (arriba a la derecha) → Configuración de la aplicación → ${text.label} → Permitir. Luego vuelva a intentarlo.`;
  else steps = `Pulse el candado 🔒 de la barra de direcciones → ${text.label} → Permitir y recargue la página.`;
  return `${text.subject}. ${steps} ${GUIDE_POINTER}`;
}
