import {
  MAX_ROLL_RATIO, MAX_SAMPLES, MAX_YAW_RATIO, MIN_FACE_SCORE, REMIND_SECONDS,
  SAMPLE_INTERVAL, SCAN_TIMEOUT_SECONDS,
} from "./config.js";

export const SAY_APPROACH = "Acerque su cara a la cámara, por favor.";
export const SAY_REMIND = "Por favor, mire fijamente a la cámara.";
export const SAY_DONE = "Rostro registrado.";
export const SAY_DUPLICATE = "Este rostro ya está registrado. No se creó un registro nuevo.";
export const SAY_FAIL = "No se pudo registrar el rostro. Intente de nuevo.";
export const TEXT_APPROACH = "Acerque su cara a la cámara";
export const TEXT_LOOK = "Mire fijamente a la cámara";
export const TEXT_FIND_FACE = "Ubique su rostro frente a la cámara";
export const TEXT_FRONTAL = "Mire de frente a la cámara";
export const TEXT_DONE = "Rostro registrado";
export const TEXT_TIMEOUT =
  "No se pudo registrar el rostro. Mejore la luz, quítese gorra o lentes oscuros e intente de nuevo.";

export const Phase = Object.freeze({ SCAN: "scan", DONE: "done", FAILED: "failed" });

const status = (phase, prompt, progress, speak = null, box = null) =>
  Object.freeze({ phase, prompt, progress, speak, box });

/** Rostro de frente: poca rotación lateral (yaw) y poca inclinación (roll). */
export function isFrontal(face) {
  const [rightX, rightY, leftX, leftY, noseX] = [face[4], face[5], face[6], face[7], face[8]];
  const eyeDistance = Math.abs(leftX - rightX);
  if (eyeDistance < 1.0) return false;
  const yaw = Math.abs(noseX - (leftX + rightX) / 2) / eyeDistance;
  const roll = Math.abs(leftY - rightY) / eyeDistance;
  return yaw <= MAX_YAW_RATIO && roll <= MAX_ROLL_RATIO;
}

const nowSeconds = () => performance.now() / 1000;

export class FaceEnrollment {
  constructor(engine, clock = nowSeconds) {
    this._engine = engine;
    this._clock = clock;
    this._phase = Phase.SCAN;
    this._samples = [];
    this._started = clock();
    this._lastSample = this._started - SAMPLE_INTERVAL;
    this._lastActivity = this._started;
  }

  get samples() { return this._samples; }
  get progress() { return Math.min(1.0, this._samples.length / MAX_SAMPLES); }

  begin() { return status(Phase.SCAN, TEXT_LOOK, 0.0); }

  async update(frame, faces) {
    if (this._phase === Phase.DONE) return status(Phase.DONE, TEXT_DONE, 1.0);
    if (this._phase === Phase.FAILED) return status(Phase.FAILED, TEXT_TIMEOUT, this.progress);
    const now = this._clock();
    if (now - this._started >= SCAN_TIMEOUT_SECONDS) {
      this._phase = Phase.FAILED;
      return status(Phase.FAILED, TEXT_TIMEOUT, this.progress, SAY_FAIL);
    }
    let speak = null;
    if (now - this._lastActivity >= REMIND_SECONDS) {
      speak = SAY_REMIND;
      this._lastActivity = now;
    }
    if (faces.length !== 1 || faces[0][14] < MIN_FACE_SCORE) {
      return status(Phase.SCAN, TEXT_FIND_FACE, this.progress, speak);
    }
    const face = faces[0];
    const box = [0, 1, 2, 3].map((i) => Math.trunc(face[i]));
    if (!isFrontal(face)) return status(Phase.SCAN, TEXT_FRONTAL, this.progress, speak, box);
    if (now - this._lastSample >= SAMPLE_INTERVAL) {
      const feature = await this._engine.embed(frame, face);
      this._samples = [...this._samples, Array.from(feature)];
      this._lastSample = now;
      this._lastActivity = now;
    }
    if (this._samples.length >= MAX_SAMPLES) {
      this._phase = Phase.DONE;
      return status(Phase.DONE, TEXT_DONE, 1.0, null, box);
    }
    return status(Phase.SCAN, TEXT_LOOK, this.progress, speak, box);
  }
}
