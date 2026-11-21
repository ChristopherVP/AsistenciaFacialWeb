/** Registro del service worker y botón «Instalar aplicación». */
let deferredPrompt = null;
const listeners = new Set();

export const installer = {
  get canInstall() { return deferredPrompt !== null; },
  onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); },
  async prompt() {
    if (deferredPrompt === null) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    listeners.forEach((callback) => callback());
    return outcome === "accepted";
  },
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  listeners.forEach((callback) => callback());
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  listeners.forEach((callback) => callback());
});

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch (error) {
    console.warn("No se pudo registrar el service worker:", error);
    return null;
  }
}
