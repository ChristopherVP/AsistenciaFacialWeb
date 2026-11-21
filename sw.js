/* Service worker: la aplicación funciona sin internet tras la primera visita. */
const VERSION = "asistencia-facial-v4";
const CORE = [
  "./", "./index.html", "./excel.html", "./manifest.webmanifest", "./css/estilos.css", "./icons/icon.svg",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./js/main.js", "./js/config.js", "./js/errors.js", "./js/models.js", "./js/validators.js", "./js/scheduler.js",
  "./js/storage.js", "./js/auth.js", "./js/face-engine.js", "./js/model-loader.js", "./js/enrollment.js",
  "./js/attendance.js", "./js/excel.js", "./js/camera.js", "./js/voice.js", "./js/backup.js", "./js/pwa.js", "./js/excel-view.js", "./js/sheet-model.js", "./js/excel-import.js",
  "./js/ui/dom.js", "./js/ui/messagebox.js", "./js/ui/branding.js", "./js/ui/widgets.js", "./js/ui/dialogs.js",
  "./js/ui/state.js", "./js/ui/save-prompt.js", "./js/ui/login.js", "./js/ui/main-window.js",
  "./js/ui/attendance-tab.js", "./js/ui/courses-tab.js", "./js/ui/settings-tab.js",
];
// Pesados: se guardan sin bloquear la instalación (si falta alguno se guarda al usarlo).
const HEAVY = [
  "./modelos/face_detection_yunet_2023mar.onnx", "./modelos/face_recognition_sface_2021dec.onnx",
  "./vendor/ort/ort.wasm.min.mjs", "./vendor/ort/ort-wasm-simd-threaded.mjs",
  "./vendor/ort/ort-wasm-simd-threaded.wasm", "./vendor/xlsx.bundle.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    await Promise.allSettled(HEAVY.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
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
