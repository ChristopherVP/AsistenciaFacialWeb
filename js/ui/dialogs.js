import { APP_TITLE, COLORS, DAY_LABELS, FRAME_DELAY_MS, MAX_READ_FAILURES } from "../config.js";
import { BLUE, GREEN, RED } from "../camera.js";
import {
  FaceEnrollment, Phase, SAY_APPROACH, SAY_DONE, SAY_DUPLICATE, TEXT_APPROACH,
} from "../enrollment.js";
import { CameraError, ValidationError } from "../errors.js";
import { createSlot, createStudent, parseTime } from "../models.js";
import { Speaker } from "../voice.js";
import {
  allowsCedulaInput, allowsHourInput, allowsMinuteInput, allowsNameInput, normalizeFullName, validateCedula,
} from "../validators.js";
import { h, restrictInput, wait } from "./dom.js";
import { openDialog, showError } from "./messagebox.js";
import { CameraView, ProgressBar, Stepper, card, makeChip, setChip } from "./widgets.js";

const SPEECH_MIN_SECONDS = 1.5;
const SPEECH_TIMEOUT_SECONDS = 9.0;
const SPEECH_POLL_MS = 100;
const pad2 = (value) => String(value).padStart(2, "0");

function dialogHeader(title, subtitle, id) {
  return h("div", { class: "dialog-header" }, h("h2", { id }, title), h("p", {}, subtitle));
}

function newDialog(extraClass = "") {
  const id = `dlg-${crypto.randomUUID().slice(0, 8)}`;
  return { id, dialog: h("dialog", { class: extraClass, "aria-labelledby": id }) };
}

/* ------------------------------------------------------------------ */
/* Registrar estudiante                                                */
/* ------------------------------------------------------------------ */

export class RegistrationDialog {
  constructor({ engine, openCamera, courseName, isTaken, findDuplicate, onSaved, prefill = null }) {
    this._engine = engine;
    this._openCamera = openCamera;
    this._camera = null;
    this._courseName = courseName;
    this._isTaken = isTaken;
    this._findDuplicate = findDuplicate;
    this._onSaved = onSaved;
    this._speaker = new Speaker();
    this._voiceWarned = false;
    this._closed = false;
    this._enrollment = null;
    this._identity = null;
    this._banner = null;
    this._build();
    if (prefill) { // estudiante importado: solo falta el rostro
      this._cedula.value = prefill.cedula; this._name.value = prefill.name;
      this._cedula.readOnly = true; this._name.readOnly = true;
      this._updateCedulaHint();
    }
    this._close = openDialog(this._dialog, () => this._release());
  }

  _build() {
    const { id, dialog } = newDialog();
    this._dialog = dialog;
    this._stepper = new Stepper(["Datos del estudiante", "Escaneo facial", "Registro confirmado"]);
    this._chip = makeChip("EN ESPERA", COLORS.muted);
    this._chip.style.background = "#7F8C8D";
    this._view = new CameraView("La cámara se encenderá al iniciar el escaneo");
    this._progress = new ProgressBar();
    this._percent = h("div", { class: "hint", "aria-live": "polite" }, "Escaneo: 0 %");
    const left = card([
      h("div", { class: "row-between", style: "margin-bottom:8px" }, h("h3", { class: "card-title", style: "margin:0" }, "Cámara"), this._chip),
      this._view.el, this._progress.el, this._percent,
    ], { padding: 14 });
    this._form = this._buildForm();
    this._summary = this._buildSummary();
    const right = card([this._form, this._summary], { padding: 14 });
    dialog.append(
      dialogHeader("Registrar estudiante", `Curso: ${this._courseName}`, id),
      h("div", { class: "dialog-body" },
        card(this._stepper.el, { padding: 8 }),
        h("div", { class: "register-grid", style: "margin-top:14px" }, left, right)));
  }

  _buildForm() {
    this._cedula = h("input", { class: "input", id: "reg-cedula", inputMode: "numeric", autocomplete: "off", maxlength: "10" });
    restrictInput(this._cedula, allowsCedulaInput);
    this._cedula.addEventListener("input", () => this._updateCedulaHint());
    this._cedulaHint = h("div", { class: "hint", "aria-live": "polite", style: "min-height:1.4em" });
    this._name = h("input", { class: "input", id: "reg-nombre", autocomplete: "off", maxlength: "60" });
    restrictInput(this._name, allowsNameInput);
    this._consent = h("input", { type: "checkbox", id: "reg-consent" });
    this._startButton = h("button", { type: "button", class: "btn btn-primary btn-block", onClick: () => this._start() }, "🔒  Iniciar escaneo facial");
    this._hint = h("div", { class: "hint", role: "status", "aria-live": "polite", style: "margin-top:12px" },
      "Complete los datos y pulse «Iniciar escaneo facial». La voz le guiará.");
    return h("div", {},
      h("h3", { class: "card-title" }, "Datos personales"),
      h("label", { class: "field", style: "margin-top:0" }, h("span", {}, "Cédula (10 dígitos)"), this._cedula),
      this._cedulaHint,
      h("label", { class: "field", style: "margin-top:0" }, h("span", {}, "Apellidos y nombres"), this._name),
      h("div", { class: "hint", style: "margin:2px 0 12px" }, "Ejemplo: PÉREZ GÓMEZ JUAN CARLOS"),
      h("div", { class: "info-box", style: "margin-bottom:14px" },
        h("label", { class: "check", for: "reg-consent" }, this._consent,
          h("span", {}, "El estudiante autoriza el uso de su rostro para registrar su asistencia."))),
      this._startButton,
      h("button", { type: "button", class: "btn btn-block", style: "margin-top:6px", onClick: () => this._close() }, "Cancelar"),
      this._hint);
  }

  _buildSummary() {
    this._summaryName = h("p", { class: "status", style: "margin-top:14px" });
    this._summaryCedula = h("p", { class: "hint", style: "margin:2px 0" });
    this._summaryCourse = h("p", { class: "hint", style: "margin:2px 0" });
    return h("div", { class: "summary-view", hidden: true },
      h("div", { class: "tick", "aria-hidden": "true" }, "✔"),
      h("h3", { class: "title" }, "Registro confirmado"),
      this._summaryName, this._summaryCedula, this._summaryCourse);
  }

  _setHint(message, isError = false) {
    this._hint.textContent = message;
    this._hint.className = isError ? "error" : "hint";
  }

  _updateCedulaHint() {
    const text = this._cedula.value;
    if (text.length < 10) { this._cedulaHint.textContent = ""; this._cedulaHint.className = "hint"; return; }
    try {
      validateCedula(text);
      this._cedulaHint.textContent = "✔ Cédula válida";
      this._cedulaHint.className = "success";
    } catch (error) {
      this._cedulaHint.textContent = error.message;
      this._cedulaHint.className = "error";
    }
  }

  _setFieldsEnabled(enabled) {
    for (const control of [this._cedula, this._name, this._consent, this._startButton]) control.disabled = !enabled;
  }

  _say(text) {
    if (this._speaker.speak(text) || this._voiceWarned) return;
    this._voiceWarned = true;
    this._setHint("Sin voz en este equipo: siga las indicaciones en pantalla.");
  }

  async _ensureCamera() {
    if (this._camera !== null) return;
    const camera = await this._openCamera();
    if (this._closed) { camera.release(); return; }
    this._camera = camera;
    this._loop();
  }

  async _start() {
    let cedula; let name;
    try {
      cedula = validateCedula(this._cedula.value);
      name = normalizeFullName(this._name.value);
    } catch (error) {
      this._setHint(error.message, true);
      return;
    }
    if (this._isTaken(cedula)) { this._setHint("Esa cédula ya está registrada en este curso.", true); return; }
    if (!this._consent.checked) { this._setHint("Marque la autorización del estudiante para continuar.", true); return; }
    this._identity = { cedula, name };
    this._setFieldsEnabled(false);
    this._setHint("Encendiendo la cámara…");
    try {
      await this._ensureCamera();
    } catch (error) {
      if (!(error instanceof CameraError)) throw error;
      this._setHint(error.message, true);
      this._setFieldsEnabled(true);
      return;
    }
    if (this._closed) return;
    this._stepper.setActive(1);
    setChip(this._chip, "ESCANEANDO", COLORS.accent);
    this._setHint("Escuche la indicación y acerque su rostro a la cámara.");
    this._banner = { text: TEXT_APPROACH.toUpperCase(), color: BLUE };
    this._say(SAY_APPROACH);
    this._afterSpeech(() => this._beginScan());
  }

  /** Ejecuta `then` cuando la voz termina (o tras un tiempo máximo). */
  _afterSpeech(then, minimum = SPEECH_MIN_SECONDS, started = performance.now() / 1000) {
    if (this._closed) return;
    const elapsed = performance.now() / 1000 - started;
    if ((!this._speaker.isSpeaking && elapsed >= minimum) || elapsed >= SPEECH_TIMEOUT_SECONDS) { then(); return; }
    setTimeout(() => this._afterSpeech(then, minimum, started), SPEECH_POLL_MS);
  }

  _beginScan() {
    if (this._closed) return;
    this._setHint("Escaneo en curso. Mire fijamente a la cámara.");
    this._enrollment = new FaceEnrollment(this._engine);
    this._applyStatus(this._enrollment.begin());
  }

  async _loop() {
    while (!this._closed) {
      const frame = this._camera.read();
      if (frame !== null) {
        try {
          const faces = await this._engine.detect(frame);
          if (this._closed) return;
          let scan = null;
          if (this._enrollment !== null) {
            const status = await this._enrollment.update(frame, faces);
            if (this._closed) return;
            this._applyStatus(status);
            if (status.phase === Phase.SCAN) scan = { box: status.box, progress: status.progress, tick: performance.now() / 1000 };
          }
          const results = scan !== null ? [] : faces.map((face) => ({ box: [0, 1, 2, 3].map((i) => Math.trunc(face[i])), label: "", recognized: true }));
          this._view.show(frame, results, this._banner, scan);
        } catch (error) {
          this._enrollment = null;
          this._setHint(`Error del reconocimiento: ${error.message}`, true);
          setChip(this._chip, "ERROR", COLORS.danger);
          this._setFieldsEnabled(true);
        }
      }
      await wait(FRAME_DELAY_MS);
    }
  }

  _applyStatus(status) {
    if (status.speak) this._say(status.speak);
    this._progress.set(status.progress * 100);
    this._percent.textContent = `Escaneo: ${Math.trunc(status.progress * 100)} %`;
    if (status.phase === Phase.SCAN) this._banner = { text: status.prompt.toUpperCase(), color: BLUE };
    else if (status.phase === Phase.DONE) this._finishSuccess();
    else this._finishFailure(status);
  }

  async _finishSuccess() {
    const enrollment = this._enrollment;
    this._enrollment = null;
    if (enrollment === null || this._identity === null) return;
    const { cedula, name } = this._identity;
    const duplicate = this._findDuplicate(cedula, enrollment.samples);
    if (duplicate !== null) { this._rejectDuplicate(duplicate); return; }
    try {
      await this._onSaved(createStudent(cedula, name, enrollment.samples));
    } catch (error) {
      this._banner = { text: error.message.toUpperCase(), color: RED };
      this._setHint(error.message, true);
      setChip(this._chip, "ERROR", COLORS.danger);
      this._stepper.setActive(0);
      this._setFieldsEnabled(true);
      return;
    }
    this._banner = { text: "✔  ROSTRO REGISTRADO", color: GREEN };
    setChip(this._chip, "COMPLETADO", COLORS.success);
    this._stepper.setActive(3);
    this._summaryName.textContent = name;
    this._summaryCedula.textContent = `Cédula: ${cedula}`;
    this._summaryCourse.textContent = `Curso: ${this._courseName}`;
    this._form.hidden = true;
    this._summary.hidden = false;
    this._say(SAY_DONE);
    this._afterSpeech(() => this._close(), 2.0);
  }

  _rejectDuplicate(other) {
    this._banner = { text: "ROSTRO YA REGISTRADO", color: RED };
    setChip(this._chip, "DUPLICADO", COLORS.danger);
    this._stepper.setActive(0);
    this._setHint(`Este rostro ya parece estar registrado como ${other.name} (cédula ${other.student_id}). No se creó un registro nuevo.`, true);
    this._say(SAY_DUPLICATE);
    this._startButton.textContent = "🔁  Reintentar escaneo";
    this._setFieldsEnabled(true);
  }

  _finishFailure(status) {
    this._enrollment = null;
    this._banner = { text: "NO SE PUDO REGISTRAR EL ROSTRO", color: RED };
    setChip(this._chip, "ERROR", COLORS.danger);
    this._stepper.setActive(0);
    this._setHint(status.prompt, true);
    this._startButton.textContent = "🔁  Reintentar escaneo";
    this._setFieldsEnabled(true);
  }

  _release() {
    if (this._closed) return;
    this._closed = true;
    this._speaker.stop();
    this._camera?.release();
  }
}

/* ------------------------------------------------------------------ */
/* Agregar horario                                                     */
/* ------------------------------------------------------------------ */

export class SlotDialog {
  constructor(onSaved) {
    this._onSaved = onSaved;
    this._dayInputs = DAY_LABELS.map((_, index) => h("input", { type: "checkbox", checked: index < 5, onChange: () => this._refresh() }));
    this._time = {
      startHour: this._pad2Input("07", allowsHourInput, 23, "Hora de inicio: horas"),
      startMinute: this._pad2Input("00", allowsMinuteInput, 59, "Hora de inicio: minutos"),
      endHour: this._pad2Input("07", allowsHourInput, 23, "Hora de fin: horas"),
      endMinute: this._pad2Input("20", allowsMinuteInput, 59, "Hora de fin: minutos"),
    };
    this._summary = h("div", { class: "summary-box", role: "status", "aria-live": "polite" });
    const { id, dialog } = newDialog();
    dialog.append(
      dialogHeader("Agregar horario", "La lista solo se toma dentro del intervalo", id),
      h("div", { class: "dialog-body" }, card(this._buildBody(), { padding: 18 })));
    this._close = openDialog(dialog);
    this._refresh();
  }

  _pad2Input(value, allows, maximum, label) {
    const input = h("input", { type: "text", inputMode: "numeric", value, maxlength: "2", "aria-label": label, autocomplete: "off" });
    restrictInput(input, allows);
    input.addEventListener("input", () => this._refresh());
    input.addEventListener("blur", () => { input.value = pad2(Number(input.value || 0)); this._refresh(); });
    input.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      input.value = pad2((Number(input.value || 0) + step + maximum + 1) % (maximum + 1));
      this._refresh();
    });
    return input;
  }

  _picker(title, hour, minute) {
    return h("fieldset", {}, h("div", { class: "time-picker" },
      h("legend", {}, title), h("div", { class: "inputs" }, hour, ":", minute)));
  }

  _buildBody() {
    return [
      h("h3", { class: "card-title" }, "Días de la semana"),
      h("div", { class: "days", role: "group", "aria-label": "Días de la semana" },
        this._dayInputs.map((input, index) => h("label", { class: "day-toggle" }, input, h("span", {}, DAY_LABELS[index])))),
      h("h3", { class: "card-title", style: "margin-top:18px" }, "Intervalo en que se toma la lista"),
      h("div", { class: "pickers" },
        this._picker("HORA DE INICIO", this._time.startHour, this._time.startMinute),
        this._picker("HORA DE FIN", this._time.endHour, this._time.endMinute)),
      h("div", { class: "row", style: "margin-top:10px;flex-wrap:wrap" },
        h("span", { class: "hint" }, "Duración rápida:"),
        [10, 20, 30, 45].map((minutes) => h("button", { type: "button", class: "btn", onClick: () => this._applyDuration(minutes) }, `${minutes} min`))),
      h("div", { style: "margin:16px 0 14px" }, this._summary),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn btn-primary", onClick: () => this._save() }, "💾  Guardar horario"),
        h("button", { type: "button", class: "btn", onClick: () => this._close() }, "Cancelar")),
    ];
  }

  _times() {
    const part = (input) => Number(input.value || 0);
    return {
      start: `${pad2(part(this._time.startHour))}:${pad2(part(this._time.startMinute))}`,
      end: `${pad2(part(this._time.endHour))}:${pad2(part(this._time.endMinute))}`,
    };
  }

  _days() { return this._dayInputs.flatMap((input, index) => (input.checked ? [index] : [])); }

  _applyDuration(minutes) {
    const start = parseTime(this._times().start);
    const end = Math.min(start + minutes, 23 * 60 + 59);
    this._time.endHour.value = pad2(Math.floor(end / 60));
    this._time.endMinute.value = pad2(end % 60);
    this._refresh();
  }

  _refresh() {
    try {
      const { start, end } = this._times();
      const slot = createSlot(this._days(), start, end);
      const days = slot.days.map((day) => DAY_LABELS[day]).join(", ");
      this._summary.textContent = `Se tomará lista los ${days}, de ${slot.start} a ${slot.end} (${parseTime(slot.end) - parseTime(slot.start)} minutos).`;
      this._summary.classList.remove("is-error");
    } catch (error) {
      this._summary.textContent = `⚠  ${error.message}`;
      this._summary.classList.add("is-error");
    }
  }

  async _save() {
    for (const input of Object.values(this._time)) input.value = pad2(Number(input.value || 0));
    try {
      const { start, end } = this._times();
      await this._onSaved(createSlot(this._days(), start, end));
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      this._summary.textContent = `⚠  ${error.message}`;
      this._summary.classList.add("is-error");
      return;
    }
    this._close();
  }
}

/* ------------------------------------------------------------------ */
/* Nombre de curso                                                     */
/* ------------------------------------------------------------------ */

export class NameDialog {
  constructor({ title, subtitle, initial, confirmText, onAccept }) {
    this._onAccept = onAccept;
    this._input = h("input", { class: "input", value: initial, autocomplete: "off", id: "nombre-curso", maxlength: "200" });
    this._hint = h("div", { class: "hint", role: "status", "aria-live": "polite", style: "margin:4px 0 14px" }, "Ejemplo: Infraestructura 2 · Paralelo A");
    const { id, dialog } = newDialog();
    dialog.append(
      dialogHeader(title, subtitle, id),
      h("div", { class: "dialog-body" }, card([
        h("label", { class: "field", style: "margin-top:0" }, h("span", {}, "Nombre del curso"), this._input),
        this._hint,
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn btn-primary", onClick: () => this._accept() }, confirmText),
          h("button", { type: "button", class: "btn", onClick: () => this._close() }, "Cancelar")),
      ], { padding: 18 })));
    this._input.addEventListener("keydown", (event) => { if (event.key === "Enter") this._accept(); });
    this._close = openDialog(dialog);
    this._input.focus();
    this._input.setSelectionRange(initial.length, initial.length);
  }

  async _accept() {
    try {
      await this._onAccept(this._input.value);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      this._hint.textContent = error.message;
      this._hint.className = "error";
      return;
    }
    this._close();
  }
}

/* ------------------------------------------------------------------ */
/* Probar cámara                                                       */
/* ------------------------------------------------------------------ */

export class CameraPreviewDialog {
  constructor({ info, camera, onUse }) {
    this._info = info;
    this._camera = camera;
    this._onUse = onUse;
    this._closed = false;
    this._view = new CameraView("Iniciando cámara…");
    const { id, dialog } = newDialog();
    dialog.append(
      dialogHeader("Probar cámara", info.name, id),
      h("div", { class: "dialog-body" }, card([
        this._view.el,
        h("p", { class: "hint", style: "margin:10px 0 8px" }, `Si ve su imagen aquí, esta es la cámara que está grabando: ${info.name}`),
        h("div", { class: "row" },
          h("button", { type: "button", class: "btn btn-primary", onClick: () => { this._onUse(info); this._close(); } }, "✔  Usar esta cámara"),
          h("button", { type: "button", class: "btn", onClick: () => this._close() }, "Cerrar")),
      ], { padding: 14 })));
    this._close = openDialog(dialog, () => this._release());
    this._loop();
  }

  async _loop() {
    let failures = 0;
    while (!this._closed) {
      const frame = this._camera.read();
      if (frame === null) {
        failures += 1;
        if (failures >= MAX_READ_FAILURES) {
          this._close();
          await showError(`La cámara «${this._info.name}» dejó de enviar imagen.`, APP_TITLE);
          return;
        }
      } else {
        failures = 0;
        this._view.show(frame, [], { text: this._info.name, color: BLUE });
      }
      await wait(FRAME_DELAY_MS);
    }
  }

  _release() {
    if (this._closed) return;
    this._closed = true;
    this._camera.release();
  }
}
