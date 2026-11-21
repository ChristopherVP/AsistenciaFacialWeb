import {
  APP_TITLE, COLORS, FRAME_DELAY_MS, MAX_READ_FAILURES, NOTICE_MS, PROCESS_EVERY_N_FRAMES, precisionFor,
} from "../config.js";
import { AttendanceSession } from "../attendance.js";
import { downloadBlob } from "../backup.js";
import { AttendanceError, CameraError, StorageError } from "../errors.js";
import { Gallery } from "../face-engine.js";
import { createCourse, parseTime } from "../models.js";
import { describeNext, dueCourses } from "../scheduler.js";
import { Speaker } from "../voice.js";
import { h, wait } from "./dom.js";
import { askRetryCancel, showError, showWarning } from "./messagebox.js";
import { CameraView, DataTable, StatCard, card, makeChip, setChip } from "./widgets.js";

const NOTICE_COLORS = Object.freeze({
  success: COLORS.success, warning: COLORS.warning, info: COLORS.primary, error: COLORS.danger,
});
const GRAY = "#7F8C8D";
const ALL_PRESENT_DELAY_MS = 1500;
const END_WARNING_SECONDS = 60;
const SAY_ALL_PRESENT = "Lista guardada. Todos los estudiantes han asistido.";
const pad2 = (value) => String(value).padStart(2, "0");

const hhmmss = (moment) => `${pad2(moment.getHours())}:${pad2(moment.getMinutes())}:${pad2(moment.getSeconds())}`;
const isoDay = (moment) => `${moment.getFullYear()}-${pad2(moment.getMonth() + 1)}-${pad2(moment.getDate())}`;

/** Resultado de UNA lista: solo los estudiantes que estaban en ese momento. */
function makeSnapshot(courseId, moment, rosterIds, present) {
  const presentCount = [...rosterIds].filter((id) => present.has(id)).length;
  return Object.freeze({ courseId, moment, rosterIds, present, presentCount, absentCount: rosterIds.size - presentCount });
}

export class AttendanceTab {
  constructor(state) {
    this._state = state;
    this._session = null;
    this._course = null;
    this._camera = null;
    this._column = null;
    this._liveFailed = false;
    this._sessionStart = new Date();
    this._sessionEnd = null;
    this._results = [];
    this._frameCount = 0;
    this._readFailures = 0;
    this._loopToken = 0;
    this._noticeTimer = null;
    this._final = null;
    this._autoAttempts = new Set();
    this._speaker = new Speaker();
    this._savedOk = false;
    this._allPresentTimer = null;
    this._endWarned = false;
    this._starting = false;
    this._courseIds = new Map();
    this._build();
    state.subscribe(() => this.refreshCourses());
    this.refreshCourses();
  }

  get isRunning() { return this._session !== null; }

  _build() {
    this._chip = makeChip("LISTO", COLORS.accent);
    this._notice = h("div", { class: "notice", role: "status", "aria-live": "polite" });
    this._view = new CameraView("Cámara apagada");
    const cameraCard = card([
      h("div", { class: "row-between", style: "margin-bottom:8px" }, h("h2", { class: "card-title", style: "margin:0" }, "Cámara en vivo"), this._chip),
      this._notice, this._view.el,
    ], { padding: 14 });

    this._courseSelect = h("select", { class: "input", id: "curso-lista", "aria-label": "Curso", onChange: () => this._renderRoster() });
    this._status = h("p", { class: "status", "aria-live": "polite" });
    this._timerCaption = h("p", { class: "hint", style: "margin:0" });
    this._timer = h("p", { class: "timer" });
    this._next = h("p", { class: "hint", style: "margin:2px 0 0" });
    const info = card([
      h("h2", { class: "card-title", style: "margin-bottom:2px" }, "Curso"),
      h("div", { style: "margin:2px 0 8px" }, this._courseSelect),
      this._status, this._timerCaption, this._timer, this._next,
    ]);

    this._presentStat = new StatCard("Presentes", COLORS.success);
    this._absentStat = new StatCard("Sin registrar", COLORS.danger);
    this._totalStat = new StatCard("Total", COLORS.primary);
    this._table = new DataTable([
      { key: "n", title: "#", align: "center", width: 40 },
      { key: "nombre", title: "Apellidos y nombres" },
      { key: "estado", title: "Estado", align: "center", width: 110 },
      { key: "hora", title: "Hora", align: "center", width: 90 },
    ], { height: 300, label: "Lista del curso" });
    this._startButton = h("button", { type: "button", class: "btn btn-success btn-block", onClick: () => this._startManual() }, "▶  Iniciar lista");
    this._stopButton = h("button", { type: "button", class: "btn btn-danger btn-block", style: "margin-top:6px", disabled: true, onClick: () => this.finishSession() }, "■  Finalizar y guardar");
    const roster = card([
      h("h2", { class: "card-title", style: "margin-bottom:6px" }, "Lista del curso (A-Z por apellidos)"),
      this._table.el,
      h("div", { style: "margin-top:12px" }, this._startButton, this._stopButton),
    ]);
    const right = h("div", {}, info,
      h("div", { class: "stats" }, this._presentStat.el, this._absentStat.el, this._totalStat.el), roster);
    this.el = h("div", { class: "attendance-grid" }, cameraCard, right);
  }

  /* ---------- Avisos ---------- */

  _showNotice(text, kind, milliseconds = NOTICE_MS) {
    clearTimeout(this._noticeTimer);
    this._notice.textContent = text;
    this._notice.style.background = NOTICE_COLORS[kind];
    this._noticeTimer = setTimeout(() => this._clearNotice(), milliseconds);
  }

  _clearNotice() {
    this._noticeTimer = null;
    this._notice.textContent = "";
    this._notice.style.background = "transparent";
  }

  /* ---------- Curso y lista ---------- */

  refreshCourses() {
    const courses = this._state.repository.courses;
    const names = courses.map((course) => course.name);
    this._courseIds = new Map(courses.map((course) => [course.name, course.course_id]));
    const previous = this._courseSelect.value;
    this._courseSelect.replaceChildren(...names.map((name) => h("option", { value: name }, name)));
    this._courseSelect.value = names.includes(previous) ? previous : (names[0] ?? "");
    if (this._session === null) {
      this._status.textContent = names.length ? "Listo para tomar lista" : "Cree un curso en la pestaña Cursos para empezar";
    }
    this._renderRoster();
  }

  _selectedCourse() { return this._state.repository.get(this._courseIds.get(this._courseSelect.value)); }

  _rosterContext() {
    if (this._session !== null && this._course !== null) return { course: this._course, present: this._session.present, mode: "live" };
    const course = this._selectedCourse();
    if (course !== null && this._final !== null && this._final.courseId === course.course_id) {
      return { course, present: this._final.present, mode: "final" };
    }
    return { course, present: new Map(), mode: "idle" };
  }

  _renderRoster() {
    const { course, present, mode } = this._rosterContext();
    this._table.clear();
    if (course === null) {
      for (const stat of [this._presentStat, this._absentStat, this._totalStat]) stat.set("–");
      return;
    }
    const final = mode === "final" ? this._final : null;
    course.students.forEach((student, index) => {
      const moment = present.get(student.student_id);
      let values; let tag;
      if (final !== null && !final.rosterIds.has(student.student_id)) [values, tag] = [["Nuevo", "–"], "waiting"];
      else if (moment !== undefined) [values, tag] = [["Presente", hhmmss(moment)], "present"];
      else if (mode === "final") [values, tag] = [["Falta", "–"], "absent"];
      else if (mode === "live") [values, tag] = [["Sin registrar", "–"], "waiting"];
      else [values, tag] = [["–", "–"], "waiting"];
      this._table.add([index + 1, student.name, ...values], student.student_id, tag);
    });
    let total = course.students.length;
    if (mode === "idle") {
      this._presentStat.set("–", "Presentes");
      this._absentStat.set("–", "Sin registrar");
    } else if (final !== null) {
      this._presentStat.set(String(final.presentCount), "Presentes");
      this._absentStat.set(String(final.absentCount), "Faltas");
      total = final.rosterIds.size;
    } else {
      this._presentStat.set(String(present.size), "Presentes");
      this._absentStat.set(String(total - present.size), "Sin registrar");
    }
    this._totalStat.set(String(total));
  }

  /* ---------- Inicio ---------- */

  async _startManual() {
    const course = this._selectedCourse();
    if (course === null) { this._showNotice("Primero cree un curso en la pestaña Cursos.", "info"); return; }
    if (!course.students.length) { this._showNotice(`«${course.name}» no tiene estudiantes registrados.`, "warning"); return; }
    await this._begin(course, null, false);
  }

  _tryAutoStart(now) {
    for (const { course, slot } of dueCourses(this._state.repository.courses, now)) {
      const key = `${course.course_id}|${isoDay(now)}`;
      if (this._autoAttempts.has(key)) continue;
      this._autoAttempts.add(key);
      this._startAutomatic(course, slot, now).catch((error) => this._skipAutomatic(`No se pudo iniciar la lista automática: ${error.message}`));
      return;
    }
  }

  _skipAutomatic(message) {
    this._status.textContent = message;
    this._showNotice(message, "warning", NOTICE_MS * 2);
  }

  async _startAutomatic(course, slot, now) {
    try {
      await this._state.saveCourse(createCourse({ ...course, last_auto_date: isoDay(now) }), false);
    } catch (error) {
      if (!(error instanceof StorageError)) throw error;
      this._skipAutomatic(`No se pudo registrar la lista automática: ${error.message}`);
      return;
    }
    if (!course.students.length) { this._skipAutomatic(`Lista automática omitida: «${course.name}» no tiene estudiantes`); return; }
    try { window.focus(); } catch { /* el navegador puede ignorarlo */ }
    const endMinutes = parseTime(slot.end);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(endMinutes / 60), endMinutes % 60);
    await this._begin(course, end, true);
    if (this._session !== null) {
      this._speaker.speak(`La lista de ${course.name} va a empezar. Acérquese a la cámara para registrarse.`);
    }
  }

  async _begin(course, end, automatic) {
    if (this._starting || this._session !== null) return;
    this._starting = true;
    try {
      let camera;
      try {
        camera = await this._state.openCamera();
      } catch (error) {
        if (!(error instanceof CameraError)) throw error;
        await this._reportStartError(error.message, automatic);
        return;
      }
      let column;
      try {
        column = await this._state.bookFor(course).startList(new Date(), course.students);
      } catch (error) {
        camera.release();
        if (!(error instanceof AttendanceError)) throw error;
        await this._reportStartError(error.message, automatic);
        return;
      }
      this._activate(course, end, camera, column);
    } finally {
      this._starting = false;
    }
  }

  _activate(course, end, camera, column) {
    this._camera = camera;
    this._course = course;
    this._column = column;
    this._liveFailed = false;
    this._final = null;
    const level = precisionFor(this._state.settings.threshold);
    this._session = new AttendanceSession(this._state.engine, new Gallery(course.students), level.threshold, level.margin, level.confirmFrames);
    this._sessionStart = new Date();
    this._sessionEnd = end;
    this._endWarned = false;
    this._savedOk = false;
    this._timerCaption.textContent = end === null
      ? "Tiempo transcurrido (termina al pulsar «Finalizar y guardar»)"
      : "Tiempo restante de la clase (termina sola)";
    this._updateTimer(this._sessionStart);
    this._results = [];
    this._frameCount = 0;
    this._readFailures = 0;
    this._state.sessionActive = true;
    this._courseSelect.disabled = true;
    this._status.textContent = `Tomando lista · ${course.name}`;
    setChip(this._chip, "EN CURSO", COLORS.success);
    this._startButton.disabled = true;
    this._stopButton.disabled = false;
    this._showNotice("Cámara activa: acérquese para registrarse", "info");
    this._renderRoster();
    this._loopToken += 1;
    this._frameLoop(this._loopToken);
  }

  async _reportStartError(message, automatic) {
    if (automatic) this._skipAutomatic(`Lista automática omitida: ${message}`);
    else await showError(message, APP_TITLE);
  }

  /* ---------- Reconocimiento en vivo ---------- */

  async _markLive(studentId) {
    if (this._liveFailed || this._column === null || this._course === null) return;
    try {
      await this._state.bookFor(this._course).markPresent(this._column, studentId);
    } catch (error) {
      if (!(error instanceof AttendanceError)) throw error;
      this._liveFailed = true;
      this._showNotice("No se pudo guardar al instante: la asistencia se guardará al finalizar la lista", "warning", NOTICE_MS * 2);
    }
  }

  async _handleEvents(events) {
    if (!events.length || this._course === null) return;
    const names = new Map(this._course.students.map((student) => [student.student_id, student.name]));
    let registered = false;
    for (const [kind, studentId] of events) {
      const name = names.get(studentId) ?? studentId;
      if (kind === "registered") {
        this._showNotice(`✔  ${name}  registrado`, "success");
        await this._markLive(studentId);
        registered = true;
      } else {
        this._showNotice(`ℹ  ${name}  ya está registrado`, "warning");
      }
    }
    if (registered) {
      this._renderRoster();
      this._checkAllPresent();
    }
  }

  _allPresent() {
    if (this._session === null || this._course === null || !this._course.students.length) return false;
    const present = this._session.present;
    return this._course.students.every((student) => present.has(student.student_id));
  }

  _checkAllPresent() {
    if (!this._allPresent() || this._allPresentTimer !== null) return;
    this._showNotice("✔  Todos asistieron · guardando la lista…", "success", ALL_PRESENT_DELAY_MS * 2);
    this._allPresentTimer = setTimeout(() => this._finishAllPresent(), ALL_PRESENT_DELAY_MS);
  }

  async _finishAllPresent() {
    this._allPresentTimer = null;
    if (!this._allPresent()) return;
    await this.finishSession();
    if (this._savedOk) this._speaker.speak(SAY_ALL_PRESENT);
  }

  async _frameLoop(token) {
    while (token === this._loopToken && this._session !== null && this._camera !== null) {
      const frame = this._camera.read();
      if (frame === null) {
        this._readFailures += 1;
        if (this._readFailures >= MAX_READ_FAILURES) {
          await showError("Se perdió la señal de la cámara. Se guardará lo registrado.", APP_TITLE);
          await this.finishSession();
          return;
        }
      } else {
        this._readFailures = 0;
        this._frameCount += 1;
        try {
          if (this._frameCount % PROCESS_EVERY_N_FRAMES === 0) {
            const session = this._session;
            const results = await session.process(frame);
            if (token !== this._loopToken) return;
            this._results = results;
            await this._handleEvents(session.popEvents());
            if (token !== this._loopToken) return;
          }
        } catch (error) {
          await showError(`Error del reconocimiento: ${error.message}\nSe guardará lo registrado.`, APP_TITLE);
          await this.finishSession();
          return;
        }
        this._view.show(frame, this._results);
      }
      await wait(FRAME_DELAY_MS);
    }
  }

  /* ---------- Fin y guardado ---------- */

  async finishSession() {
    const { _session: session, _course: course, _column: column } = this;
    if (session === null || course === null || column === null) return;
    this._session = null;
    this._course = null;
    this._column = null;
    this._loopToken += 1;
    clearTimeout(this._allPresentTimer);
    this._allPresentTimer = null;
    if (this._camera !== null) { this._camera.release(); this._camera = null; }
    this._state.sessionActive = false;
    this._view.clear();
    this._timer.textContent = "";
    this._timerCaption.textContent = "";
    this._courseSelect.disabled = false;
    this._startButton.disabled = false;
    this._stopButton.disabled = true;
    this._status.textContent = "Guardando lista…";
    setChip(this._chip, "GUARDANDO", COLORS.warning);
    const present = session.present;
    const rosterIds = new Set(course.students.map((student) => student.student_id));
    this._final = makeSnapshot(course.course_id, new Date(), rosterIds, present);
    const result = await this._finalize(course, column, new Set(present.keys()));
    if (result === null) {
      this._status.textContent = "Lista no guardada en Excel";
      setChip(this._chip, "ERROR", COLORS.danger);
      this._showNotice("La lista no se guardó en el Excel", "error", NOTICE_MS * 2);
    } else {
      this._savedOk = true;
      const when = this._final.moment;
      this._status.textContent = `Lista guardada · ${course.name} · ${pad2(when.getDate())}/${pad2(when.getMonth() + 1)}/${when.getFullYear()} ${pad2(when.getHours())}:${pad2(when.getMinutes())}`;
      setChip(this._chip, "FINALIZADA", GRAY);
      this._showNotice(
        `Lista guardada · Presentes ${result.present} · Faltas ${result.total - result.present} · columna ${result.column_letter}`,
        "success", NOTICE_MS * 2);
    }
    this._renderRoster();
  }

  async _finalize(course, column, presentIds) {
    for (;;) {
      try {
        return await this._state.bookFor(course).finalize(column, presentIds, course.students);
      } catch (error) {
        if (!(error instanceof AttendanceError)) throw error;
        if (await askRetryCancel("No se pudo guardar", `${error.message}\n\n¿Reintentar?`)) continue;
        await this._writeBackup(course, presentIds);
        return null;
      }
    }
  }

  /** Último recurso: descarga un CSV con la lista para no perder la asistencia. */
  async _writeBackup(course, presentIds) {
    const moment = new Date();
    const quote = (text) => `"${String(text).replaceAll('"', '""')}"`;
    const lines = [["Cédula", "Apellidos y nombres", isoDay(moment)].map(quote).join(",")];
    for (const student of course.students) {
      lines.push([quote(student.student_id), quote(student.name), presentIds.has(student.student_id) ? 1 : 0].join(","));
    }
    const stamp = `${isoDay(moment)}_${pad2(moment.getHours())}${pad2(moment.getMinutes())}${pad2(moment.getSeconds())}`;
    const fileName = `lista_${course.course_id}_${stamp}.csv`;
    downloadBlob(new Blob([`\uFEFF${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }), fileName);
    await showWarning(`La lista no entró al Excel. Se descargó un respaldo:\n${fileName}`, APP_TITLE);
  }

  /* ---------- Reloj ---------- */

  onTick(now) {
    this._next.textContent = describeNext(this._state.repository.courses, now);
    if (this._session === null) {
      if (!this._starting) this._tryAutoStart(now);
      return;
    }
    if (this._sessionEnd !== null && now >= this._sessionEnd) {
      this.finishSession();
      return;
    }
    this._updateTimer(now);
    if (this._sessionEnd !== null && !this._endWarned && (this._sessionEnd - now) / 1000 <= END_WARNING_SECONDS) {
      this._endWarned = true;
      this._speaker.speak("Queda un minuto para finalizar la lista.");
    }
  }

  _updateTimer(now) {
    const seconds = this._sessionEnd === null
      ? Math.max(0, Math.trunc((now - this._sessionStart) / 1000))
      : Math.max(0, Math.trunc((this._sessionEnd - now) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    this._timer.textContent = hours ? `${hours}:${pad2(minutes)}:${pad2(seconds % 60)}` : `${pad2(minutes)}:${pad2(seconds % 60)}`;
  }
}

