/* Service worker: la aplicación funciona sin internet tras la primera visita. */
const VERSION = "asistencia-facial-v13";
const HEAVY_CACHE = "asistencia-facial-pesados-v1";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest", "./css/estilos.css", "./icons/icon.svg",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./js/main.js", "./js/config.js", "./js/errors.js", "./js/models.js", "./js/validators.js", "./js/scheduler.js",
  "./js/storage.js", "./js/auth.js", "./js/face-engine.js", "./js/model-loader.js", "./js/enrollment.js",
  "./js/attendance.js", "./js/excel.js", "./js/camera.js", "./js/voice.js", "./js/backup.js", "./js/pwa.js", "./js/sheet-model.js", "./js/excel-import.js",
  "./js/ui/dom.js", "./js/ui/messagebox.js", "./js/ui/branding.js", "./js/ui/widgets.js", "./js/ui/dialogs.js",
  "./js/ui/state.js", "./js/ui/save-prompt.js", "./js/ui/login.js", "./js/ui/main-window.js",
  "./js/ui/attendance-tab.js", "./js/ui/courses-tab.js", "./js/ui/settings-tab.js", "./js/ui/excel-tab.js", "./js/ui/reminders.js",
  "./js/ui/install-help.js", "./js/theme.js", "./js/permissions.js",
];
const HEAVY = [
  "./modelos/face_detection_yunet_2023mar.onnx", "./modelos/face_recognition_sface_2021dec.onnx",
  "./vendor/ort/ort.wasm.min.mjs", "./vendor/ort/ort-wasm-simd-threaded.mjs",
  "./vendor/ort/ort-wasm-simd-threaded.wasm", "./vendor/xlsx.bundle.js",
];
const isHeavy = (path) => /\.(onnx|wasm)$/.test(path) || path.includes("/vendor/");

async function warmHeavy() {
  const cache = await caches.open(HEAVY_CACHE);
  for (const url of HEAVY) {
    if (await cache.match(url, { ignoreSearch: true })) continue;
    try { await cache.add(url); } catch (error) { console.warn("No se pudo guardar para uso sin internet:", url, error); }
  }
}

async function adoptOldHeavy() {
  const target = await caches.open(HEAVY_CACHE);
  for (const key of await caches.keys()) {
    if (key === VERSION || key === HEAVY_CACHE) continue;
    const old = await caches.open(key);
    for (const url of HEAVY) {
      if (await target.match(url, { ignoreSearch: true })) continue;
      const found = await old.match(url, { ignoreSearch: true });
      if (found) await target.put(url, found);
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await adoptOldHeavy();
    for (const key of await caches.keys()) if (key !== VERSION && key !== HEAVY_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "WARM_HEAVY") event.waitUntil(warmHeavy());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const path = new URL(request.url).pathname;
    const heavy = isHeavy(path);
    const cache = await caches.open(heavy ? HEAVY_CACHE : VERSION);
    if (!heavy && !path.includes("/icons/")) {
      // Código de la app: primero la red (siempre la última versión); sin internet usa la copia guardada.
      try {
        const response = await fetch(request, { cache: "no-cache" });
        if (response.ok && response.status === 200) cache.put(request, response.clone());
        return response;
      } catch { /* sin internet */ }
    }
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.status === 200) cache.put(request, response.clone());
      return response;
    } catch (error) {
      if (request.mode === "navigate") return (await cache.match("./index.html")) ?? Response.error();
      throw error;
    }
  })());
});
