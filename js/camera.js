import { VIEW_HEIGHT, VIEW_WIDTH } from "./config.js";
import { CameraError } from "./errors.js";

const INTEGRATED_HINTS = Object.freeze([
  "integrated", "internal", "built-in", "builtin", "laptop", "hp wide vision", "hp truevision",
  "hp true vision", "facetime", "front camera", "surface camera", "integrada", "frontal",
]);
const VIRTUAL_HINTS = Object.freeze([
  "obs", "virtual", "manycam", "xsplit", "snap camera", "streamlabs", "nvidia broadcast",
  "splitcam", "mmhmm", "unity video capture", "youcam", "e2esoft",
]);
export const isVirtualCamera = (name) => VIRTUAL_HINTS.some((hint) => name.toLowerCase().includes(hint));
export const BLUE = "rgb(46,134,193)";
export const GREEN = "rgb(46,139,87)";
export const RED = "rgb(176,58,46)";
const CYAN = [0, 220, 255];
const FONT = '"Segoe UI", system-ui, sans-serif';

const openError = (name) => new CameraError(
  `No se pudo abrir la cámara ${name}. Verifica que esté conectada, que ninguna otra aplicación ` +
  "la esté usando y que el navegador tenga permiso para usar la cámara.");

/** Quita el ID de hardware «(vvvv:pppp)» que Windows añade al nombre; solo para mostrar. */
export const displayName = (name) => String(name).replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*/gi, " ").trim();

export class Camera {
  constructor(stream, video) {
    this._stream = stream;
    this._video = video;
    this._canvas = document.createElement("canvas");
    this._context = this._canvas.getContext("2d", { willReadFrequently: true });
  }

  static async open(deviceId = "", name = "") {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CameraError("Este navegador no permite usar la cámara. Use HTTPS o localhost.");
    }
    const video = { width: { ideal: VIEW_WIDTH }, height: { ideal: VIEW_HEIGHT } };
    if (deviceId) video.deviceId = { exact: deviceId };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      if (error.name === "NotAllowedError") {
        throw new CameraError("El navegador no tiene permiso para usar la cámara. Permítalo en el candado de la barra de direcciones.");
      }
      throw openError(name || "seleccionada");
    }
    const element = document.createElement("video");
    element.muted = true;
    element.playsInline = true;
    element.srcObject = stream;
    try {
      await element.play();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      throw openError(name || "seleccionada");
    }
    return new Camera(stream, element);
  }

  /** Imagen actual (ImageData, máx. 640 px de ancho) o null si aún no hay imagen. */
  read() {
    const video = this._video;
    const track = this._stream.getVideoTracks()[0];
    if (!track || track.readyState === "ended" || video.readyState < 2 || !video.videoWidth) return null;
    const scale = Math.min(1, VIEW_WIDTH / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    if (this._canvas.width !== width) this._canvas.width = width;
    if (this._canvas.height !== height) this._canvas.height = height;
    this._context.drawImage(video, 0, 0, width, height);
    return this._context.getImageData(0, 0, width, height);
  }

  release() {
    this._stream.getTracks().forEach((track) => track.stop());
    this._video.srcObject = null;
  }
}

export const classifyCamera = (name) =>
  INTEGRATED_HINTS.some((hint) => name.toLowerCase().includes(hint)) ? "integrated" : "unknown";

/** Lista las cámaras con su nombre real. El navegador exige permiso para mostrar los nombres. */
export async function detectCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    probe.getTracks().forEach((track) => track.stop());
  } catch (error) {
    if (error.name === "NotAllowedError") {
      throw new CameraError("El navegador no tiene permiso para usar la cámara. Permítalo en el candado de la barra de direcciones y pulse Buscar cámaras.");
    }
    if (error.name !== "NotFoundError") throw openError("del sistema");
  }
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((item) => item.kind === "videoinput");
  return devices
    .map((device, index) => ({ device, name: device.label || `Cámara ${index}` }))
    .filter(({ name }) => !isVirtualCamera(name)) // OBS y similares no son cámaras reales
    .map(({ device, name }, index) =>
      Object.freeze({ index, name, deviceId: device.deviceId, kind: classifyCamera(name), available: true }));
}

/** Abre la cámara guardada en los ajustes; si no hay una válida, la primera cámara real. */
export async function openConfiguredCamera(settings) {
  let deviceId = settings.camera_device_id;
  let name = settings.camera_name;
  if (navigator.mediaDevices?.enumerateDevices) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const real = devices.filter((item) => item.kind === "videoinput" && item.label && !isVirtualCamera(item.label));
    if (real.length) {
      if (name && !isVirtualCamera(name)) {
        const match = real.find((item) => item.label === name);
        if (!match) {
          throw new CameraError(`No se encuentra la cámara «${name}». Conéctala y pulsa Buscar cámaras en Ajustes.`);
        }
        deviceId = match.deviceId;
      } else {
        deviceId = real[0].deviceId;
        name = real[0].label;
      }
    }
  }
  return Camera.open(deviceId, name);
}

function drawCorners(ctx, x, y, w, h, color) {
  const length = Math.max(18, Math.trunc(Math.min(w, h) * 0.22));
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * length);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * length, cy);
    ctx.stroke();
  }
}

function drawScan(ctx, canvas, scan) {
  if (!scan.box) return;
  const [x, y, w, h] = scan.box;
  drawCorners(ctx, x, y, w, h, `rgb(${CYAN})`);
  const phase = (scan.tick * 0.9) % 2.0;
  const fraction = phase <= 1.0 ? phase : 2.0 - phase;
  const lineY = y + Math.trunc(fraction * h);
  ctx.lineWidth = 3;
  for (const [offset, alpha] of [[0, 235], [-3, 150], [-6, 95], [-9, 55], [-12, 25]]) {
    ctx.strokeStyle = `rgba(${CYAN},${alpha / 255})`;
    ctx.beginPath();
    ctx.moveTo(x, lineY + offset);
    ctx.lineTo(x + w, lineY + offset);
    ctx.stroke();
  }
  ctx.fillStyle = `rgb(${CYAN})`;
  ctx.font = `bold 17px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText(`ESCANEANDO  ${Math.trunc(scan.progress * 100)} %`, x, Math.min(canvas.height - 28, y + h + 6));
}

/** Dibuja la imagen con los rostros, el aviso superior y la animación de escaneo. */
export function renderFrame(canvas, frame, results = [], banner = null, scan = null) {
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(frame, 0, 0);
  ctx.textBaseline = "top";
  for (const { box: [x, y, w, h], label, recognized } of results) {
    const color = recognized ? GREEN : RED;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    if (!label) continue;
    ctx.font = `bold 17px ${FONT}`;
    const textY = Math.max(0, y - 26);
    const width = ctx.measureText(label).width;
    ctx.fillStyle = color;
    ctx.fillRect(x - 4, textY - 2, width + 8, 24);
    ctx.fillStyle = "white";
    ctx.fillText(label, x, textY);
  }
  if (scan) drawScan(ctx, canvas, scan);
  if (banner) {
    ctx.fillStyle = banner.color;
    ctx.fillRect(0, 0, canvas.width, 46);
    ctx.fillStyle = "white";
    ctx.font = `bold 23px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.fillText(banner.text, 14, 8);
  }
}
