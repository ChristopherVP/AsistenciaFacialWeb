import { DETECTOR_FILE, MIN_MODEL_BYTES, MODELS_PATH, RECOGNIZER_FILE } from "./config.js";
import { ModelError } from "./errors.js";
import { FaceEngine } from "./face-engine.js";

async function fetchBytes(file, report) {
  let response;
  try {
    response = await fetch(`${MODELS_PATH}${file}`);
  } catch (error) {
    throw new ModelError(`No se pudo cargar el modelo ${file}: ${error.message}. Conéctese a internet la primera vez.`);
  }
  if (!response.ok) {
    throw new ModelError(`No se encontró el modelo ${file} (HTTP ${response.status}). Copie los archivos .onnx en la carpeta «modelos».`);
  }
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) report(Math.min(1, received / total));
  }
  if (received <= MIN_MODEL_BYTES) {
    throw new ModelError(`El modelo ${file} está incompleto (¿es un puntero de Git LFS?). Copie el .onnx real.`);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function loadOrt() {
  const ort = await import("../vendor/ort/ort.wasm.min.mjs");
  ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
  ort.env.wasm.numThreads = 1; // GitHub Pages no permite aislamiento entre orígenes (hilos).
  return ort;
}

/** Carga ORT y los dos modelos informando (mensaje, fracción 0-1). */
export async function loadFaceEngine(onProgress = () => {}) {
  onProgress("Preparando detector de rostros…", 0.05);
  const ort = await loadOrt();
  const detector = await fetchBytes(DETECTOR_FILE, () => {});
  onProgress("Cargando modelo de reconocimiento (solo la primera vez)…", 0.10);
  const recognizer = await fetchBytes(RECOGNIZER_FILE, (fraction) =>
    onProgress("Cargando modelo de reconocimiento (solo la primera vez)…", 0.10 + 0.80 * fraction));
  onProgress("Cargando modelos…", 0.95);
  return FaceEngine.create(ort, detector, recognizer);
}
