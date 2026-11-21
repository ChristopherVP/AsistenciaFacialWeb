import {
  DETECTOR_NMS_THRESHOLD, DETECTOR_SCORE_THRESHOLD, DETECTOR_TOP_K,
} from "./config.js";
import { ModelError } from "./errors.js";

const STRIDES = Object.freeze([8, 16, 32]);
const DIVISOR = 32;
const FALLBACK_INPUT = Object.freeze({ width: 640, height: 640 });
const ALIGNED_SIZE = 112;
const FACE_FIELDS = 15;
// Plantilla de 5 puntos (ojo der., ojo izq., nariz, boca der., boca izq.) y media usada por OpenCV.
const TEMPLATE = Object.freeze([
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041],
]);
const TEMPLATE_MEAN = Object.freeze([56.0262, 71.9008]);

/** frame = { data: Uint8ClampedArray RGBA, width, height } (como ImageData). */

export const paddedSize = (size) => (Math.floor((size - 1) / DIVISOR) + 1) * DIVISOR;

/** Tensor NCHW en orden BGR, 0-255, con relleno a 0 abajo/derecha (igual que OpenCV). */
export function buildDetectorInput(frame, padWidth, padHeight) {
  const plane = padWidth * padHeight;
  const input = new Float32Array(3 * plane);
  const { data, width, height } = frame;
  const copyWidth = Math.min(width, padWidth);
  const copyHeight = Math.min(height, padHeight);
  for (let y = 0; y < copyHeight; y += 1) {
    for (let x = 0; x < copyWidth; x += 1) {
      const source = (y * width + x) * 4;
      const target = y * padWidth + x;
      input[target] = data[source + 2];
      input[plane + target] = data[source + 1];
      input[2 * plane + target] = data[source];
    }
  }
  return input;
}

/** Decodifica las 12 salidas de YuNet (ver FaceDetectorYNImpl::postProcess de OpenCV). */
export function decodeDetections(outputs, padWidth, padHeight, scoreThreshold) {
  const faces = [];
  STRIDES.forEach((stride, i) => {
    const cols = Math.floor(padWidth / stride);
    const rows = Math.floor(padHeight / stride);
    const cls = outputs[i];
    const obj = outputs[i + 3];
    const bbox = outputs[i + 6];
    const kps = outputs[i + 9];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const idx = r * cols + c;
        const clsScore = Math.min(Math.max(cls[idx], 0), 1);
        const objScore = Math.min(Math.max(obj[idx], 0), 1);
        const score = Math.fround(Math.sqrt(clsScore * objScore));
        if (score < scoreThreshold) continue;
        const face = new Float32Array(FACE_FIELDS);
        const w = Math.exp(bbox[idx * 4 + 2]) * stride;
        const h = Math.exp(bbox[idx * 4 + 3]) * stride;
        face[0] = (c + bbox[idx * 4]) * stride - w / 2;
        face[1] = (r + bbox[idx * 4 + 1]) * stride - h / 2;
        face[2] = w;
        face[3] = h;
        for (let n = 0; n < 5; n += 1) {
          face[4 + 2 * n] = (kps[idx * 10 + 2 * n] + c) * stride;
          face[5 + 2 * n] = (kps[idx * 10 + 2 * n + 1] + r) * stride;
        }
        face[14] = score;
        faces.push(face);
      }
    }
  });
  return faces;
}

function jaccard(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const inter = right > left && bottom > top ? (right - left) * (bottom - top) : 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Supresión de no máximos idéntica a cv::dnn::NMSBoxes (cajas enteras, eta = 1). */
export function nonMaxSuppression(faces, scoreThreshold, nmsThreshold, topK) {
  const boxes = faces.map((face) => ({
    x: Math.trunc(face[0]), y: Math.trunc(face[1]), w: Math.trunc(face[2]), h: Math.trunc(face[3]),
  }));
  let order = faces.map((face, index) => ({ score: face[14], index }))
    .filter((item) => item.score > scoreThreshold)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (topK > 0 && topK < order.length) order = order.slice(0, topK);
  const kept = [];
  for (const { index } of order) {
    if (kept.every((other) => jaccard(boxes[index], boxes[other]) <= nmsThreshold)) kept.push(index);
  }
  return kept.map((index) => faces[index]);
}

/** Matriz 2x3 [a,b,tx,c,d,ty] de la transformación de similitud (Umeyama) usada por alignCrop. */
export function similarityTransform(face) {
  const src = Array.from({ length: 5 }, (_, i) => [face[4 + 2 * i], face[5 + 2 * i]]);
  const mean = [0, 1].map((axis) => src.reduce((sum, point) => sum + point[axis], 0) / 5);
  const demeanSrc = src.map((point) => [point[0] - mean[0], point[1] - mean[1]]);
  const demeanDst = TEMPLATE.map((point) => [point[0] - TEMPLATE_MEAN[0], point[1] - TEMPLATE_MEAN[1]]);
  const covariance = [[0, 0], [0, 0]];
  for (let i = 0; i < 5; i += 1) {
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) covariance[row][col] += demeanDst[i][row] * demeanSrc[i][col] / 5;
    }
  }
  const [[a, b], [c, d]] = covariance;
  const angle = Math.atan2(c - b, a + d);
  const strength = Math.hypot(a + d, c - b);
  const variance = demeanSrc.reduce((sum, p) => sum + p[0] * p[0] + p[1] * p[1], 0) / 5;
  const scale = variance > 0 ? strength / variance : 0;
  const m00 = Math.cos(angle) * scale;
  const m01 = -Math.sin(angle) * scale;
  const m10 = Math.sin(angle) * scale;
  const m11 = Math.cos(angle) * scale;
  return [
    m00, m01, TEMPLATE_MEAN[0] - (m00 * mean[0] + m01 * mean[1]),
    m10, m11, TEMPLATE_MEAN[1] - (m10 * mean[0] + m11 * mean[1]),
  ];
}

/** Recorte alineado 112x112 (bilineal, borde 0) como tensor NCHW en orden RGB, 0-255. */
export function alignCrop(frame, face) {
  const [a, b, tx, c, d, ty] = similarityTransform(face);
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new ModelError("Rostro con puntos de referencia inválidos.");
  const ia = d / det; const ib = -b / det; const ic = -c / det; const id = a / det;
  const itx = -(ia * tx + ib * ty);
  const ity = -(ic * tx + id * ty);
  const { data, width, height } = frame;
  const plane = ALIGNED_SIZE * ALIGNED_SIZE;
  const output = new Float32Array(3 * plane);
  const sample = (x, y, channel) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(y * width + x) * 4 + channel];
  for (let y = 0; y < ALIGNED_SIZE; y += 1) {
    for (let x = 0; x < ALIGNED_SIZE; x += 1) {
      const u = ia * x + ib * y + itx;
      const v = ic * x + id * y + ity;
      const x0 = Math.floor(u); const y0 = Math.floor(v);
      const fx = u - x0; const fy = v - y0;
      for (let channel = 0; channel < 3; channel += 1) {
        const top = sample(x0, y0, channel) * (1 - fx) + sample(x0 + 1, y0, channel) * fx;
        const bottom = sample(x0, y0 + 1, channel) * (1 - fx) + sample(x0 + 1, y0 + 1, channel) * fx;
        output[channel * plane + y * ALIGNED_SIZE + x] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return output;
}

export class FaceEngine {
  /** `ort` es el módulo onnxruntime-web; los modelos llegan como bytes. */
  static async create(ort, detectorBytes, recognizerBytes) {
    const options = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    try {
      const detector = await ort.InferenceSession.create(detectorBytes, options);
      const recognizer = await ort.InferenceSession.create(recognizerBytes, options);
      return new FaceEngine(ort, detector, recognizer);
    } catch (error) {
      throw new ModelError(`No se pudieron cargar los modelos de reconocimiento: ${error.message ?? error}`);
    }
  }

  constructor(ort, detector, recognizer) {
    this._ort = ort;
    this._detector = detector;
    this._recognizer = recognizer;
    this._fixedInput = null;
  }

  async _runDetector(frame, padWidth, padHeight) {
    const tensor = new this._ort.Tensor("float32", buildDetectorInput(frame, padWidth, padHeight), [1, 3, padHeight, padWidth]);
    const results = await this._detector.run({ [this._detector.inputNames[0]]: tensor });
    const names = ["cls_8", "cls_16", "cls_32", "obj_8", "obj_16", "obj_32", "bbox_8", "bbox_16", "bbox_32", "kps_8", "kps_16", "kps_32"];
    return names.map((name) => results[name].data);
  }

  /** Rostros detectados: lista de Float32Array(15) = [x,y,w,h, 5 puntos×2, score]. */
  async detect(frame) {
    let padWidth = this._fixedInput?.width ?? paddedSize(frame.width);
    let padHeight = this._fixedInput?.height ?? paddedSize(frame.height);
    let outputs;
    try {
      outputs = await this._runDetector(frame, padWidth, padHeight);
    } catch (error) {
      if (this._fixedInput !== null) throw new ModelError(`Falló el detector de rostros: ${error.message ?? error}`);
      // El modelo tiene tamaño de entrada fijo: se usa 640x640 con relleno (coordenadas intactas).
      this._fixedInput = FALLBACK_INPUT;
      padWidth = FALLBACK_INPUT.width;
      padHeight = FALLBACK_INPUT.height;
      outputs = await this._runDetector(frame, padWidth, padHeight);
    }
    const faces = decodeDetections(outputs, padWidth, padHeight, DETECTOR_SCORE_THRESHOLD);
    return faces.length > 1
      ? nonMaxSuppression(faces, DETECTOR_SCORE_THRESHOLD, DETECTOR_NMS_THRESHOLD, DETECTOR_TOP_K)
      : faces;
  }

  /** Vector de 128 valores del rostro alineado. */
  async embed(frame, face) {
    const aligned = alignCrop(frame, face);
    const tensor = new this._ort.Tensor("float32", aligned, [1, 3, ALIGNED_SIZE, ALIGNED_SIZE]);
    const results = await this._recognizer.run({ [this._recognizer.inputNames[0]]: tensor });
    return Float32Array.from(results[this._recognizer.outputNames[0]].data);
  }
}

const normalized = (vector) => {
  const norm = Math.hypot(...vector);
  return Float32Array.from(vector, (value) => value / norm);
};
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

export class Gallery {
  constructor(students) {
    this._students = [...students];
    this._rows = [];
    this._owners = [];
    this._students.forEach((student, index) => {
      for (const embedding of student.embeddings) {
        this._rows.push(normalized(embedding));
        this._owners.push(index);
      }
    });
  }

  /**
   * Estudiante dueño del rostro, o null si no alcanza el umbral o es ambiguo.
   * Se compara por ESTUDIANTE (su mejor muestra); si el segundo queda a menos de `margin`, es ambiguo.
   */
  identify(feature, threshold, margin = 0.0) {
    if (this._rows.length === 0) return null;
    const vector = normalized(feature);
    const perStudent = new Array(this._students.length).fill(-1);
    this._rows.forEach((row, i) => {
      perStudent[this._owners[i]] = Math.max(perStudent[this._owners[i]], dot(row, vector));
    });
    const ranking = perStudent.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score);
    const [best, second] = ranking;
    if (best.score < threshold) return null;
    if (second !== undefined && best.score - second.score < margin) return null;
    return this._students[best.index];
  }

  /** Estudiante más parecido a cualquiera de las muestras, o null. */
  bestMatch(samples, threshold) {
    if (this._rows.length === 0 || samples.length === 0) return null;
    let bestScore = -Infinity;
    let bestRow = -1;
    for (const sample of samples) {
      const vector = normalized(sample);
      this._rows.forEach((row, i) => {
        const score = dot(row, vector);
        if (score > bestScore) { bestScore = score; bestRow = i; }
      });
    }
    return bestScore < threshold ? null : this._students[this._owners[bestRow]];
  }
}
