import { Camera } from "./camera.js";
import { renderFrame } from "./camera.js";
import { loadFaceEngine } from "./model-loader.js";

const log = document.getElementById("registro");
const canvas = document.getElementById("lienzo");
const write = (text) => { log.textContent += `\n${text}`; };
let engine = null;

async function analyze(frame) {
  const started = performance.now();
  const faces = await engine.detect(frame);
  write(`Detección: ${faces.length} rostro(s) en ${(performance.now() - started).toFixed(0)} ms`);
  const results = faces.map((f) => ({ box: [0, 1, 2, 3].map((i) => Math.trunc(f[i])), label: `${(f[14] * 100).toFixed(0)} %`, recognized: true }));
  renderFrame(canvas, frame, results);
  for (const [index, face] of faces.entries()) {
    const t0 = performance.now();
    const feature = await engine.embed(frame, face);
    const norm = Math.hypot(...feature);
    write(`  Rostro ${index + 1}: score ${face[14].toFixed(3)} · embedding ${feature.length} valores · norma ${norm.toFixed(3)} · ${(performance.now() - t0).toFixed(0)} ms`);
    return feature;
  }
  return null;
}

document.getElementById("cargar").addEventListener("click", async () => {
  log.textContent = "Cargando…";
  const started = performance.now();
  try {
    engine = await loadFaceEngine((message, fraction) => { log.textContent = `${message} ${Math.round(fraction * 100)} %`; });
    log.textContent = `✔ Modelos cargados en ${((performance.now() - started) / 1000).toFixed(1)} s`;
    document.getElementById("camara").disabled = false;
  } catch (error) {
    log.textContent = `✖ ${error.message}`;
  }
});

document.getElementById("camara").addEventListener("click", async () => {
  let camera;
  try {
    camera = await Camera.open();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const first = await analyze(camera.read());
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const second = await analyze(camera.read());
    if (first && second) {
      const dot = first.reduce((sum, v, i) => sum + v * second[i], 0) / (Math.hypot(...first) * Math.hypot(...second));
      write(`Similitud coseno entre las dos capturas (misma persona debe ser > 0.40): ${dot.toFixed(3)}`);
    }
  } catch (error) {
    write(`✖ ${error.message}`);
  } finally {
    camera?.release();
  }
});

document.getElementById("foto").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file || !engine) { write("Primero cargue los modelos."); return; }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 640 / bitmap.width);
  const work = document.createElement("canvas");
  work.width = Math.round(bitmap.width * scale);
  work.height = Math.round(bitmap.height * scale);
  const context = work.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, work.width, work.height);
  await analyze(context.getImageData(0, 0, work.width, work.height));
});
