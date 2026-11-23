import { APP_TITLE, COLORS } from "../config.js";
import { AttendanceError, StorageError, ValidationError } from "../errors.js";
import { Gallery } from "../face-engine.js";
import { downloadBlob } from "../backup.js";
import { buildWorkbookBytes, loadXlsx } from "../excel.js";
import {
  activeSlotCount, completedSlotCount, courseAddSlot, courseAddStudent, courseRemoveSlot, courseRemoveStudent, courseReplaceSlot,
  courseSetAllSlots, courseToggleSlot, createCourse, isoDate, isSlotActive, isSlotCompleted, slotDaysText, slotLabel, slotMinutes,
} from "../models.js";
import { formatRemaining, slotNextStart } from "../scheduler.js";
import { excelFileName } from "../storage.js";
import { CameraPreviewDialog, NameDialog, RegistrationDialog, SlotDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { askYesNo, showError, showInfo, showWarning } from "./messagebox.js";
import { DataTable, card, makeChip } from "./widgets.js";

const GRAY = "#7F8C8D";

export class CoursesTab {
  constructor(state) {
    this._state = state;
    this._selectedId = sessionStorage.getItem("af_course") || null;
    this.onViewExcel = null;
    this._refreshing = false;
    this._build();
    state.subscribe(() => this._refreshList());
    this._refreshList();
  }

  _build() {
    this._coursesTable = new DataTable(
      [{ key: "curso", title: "Curso" }, { key: "est", title: "Estud.", align: "center", width: 70 }],
      { height: 330, label: "Mis cursos" });
    this._coursesTable.onSelect = () => this._onSelect();
    const left = card([
      h("h2", { class: "card-title" }, "Mis cursos"),
      this._coursesTable.el,
      h("button", { type: "button", class: "btn btn-primary btn-block", style: "margin-top:12px", onClick: () => this._newCourse() }, "➕  Nuevo curso"),
      h("button", { type: "button", class: "btn btn-block", style: "margin-top:8px", onClick: () => this._renameCourse() }, "✏  Renombrar"),
      h("button", { type: "button", class: "btn btn-danger btn-block", style: "margin-top:8px", onClick: () => this._deleteCourse() }, "🗑  Eliminar curso"),
    ], { padding: 14 });
    this._empty = card(h("p", { class: "hint", style: "text-align:center;margin:0;white-space:pre-line" },
      "Cree o seleccione un curso\npara administrar sus estudiantes, horarios y Excel."), { padding: 30 });
    this._detail = this._buildDetail();
    this._detail.hidden = true;
    this.el = h("div", { class: "courses-grid" }, left, h("div", {}, this._empty, this._detail));
  }

  _buildDetail() {
    this._title = h("h2", { class: "title" });
    this._studentsChip = makeChip("0 ESTUDIANTES", COLORS.primary);
    this._scheduleChip = makeChip("SIN HORARIO", GRAY);
    this._excelName = h("input", { class: "input grow", readOnly: true, "aria-label": "Archivo de asistencia" });
    this._studentsTable = new DataTable(
      [{ key: "n", title: "#", align: "center", width: 50 }, { key: "cedula", title: "Cédula", align: "center", width: 150 }, { key: "nombre", title: "Apellidos y nombres" }],
      { height: 220, label: "Estudiantes" });
    this._slotsTable = new DataTable(
      [{ key: "dias", title: "Días" }, { key: "inicio", title: "Inicio", align: "center", width: 90 }, { key: "fin", title: "Fin", align: "center", width: 90 }, { key: "duracion", title: "Duración", align: "center", width: 100 }, { key: "estado", title: "Automática", align: "center", width: 130 }, { key: "falta", title: "Falta para empezar", align: "center", width: 200 }],
      { height: 150, label: "Horarios" });
    this._enabledText = h("span", { class: "hint", role: "status", "aria-live": "polite" }, "Sin horarios.");
    const section = (title, ...content) => h("div", { style: "margin-top:10px" }, card([h("h3", { class: "card-title" }, title), ...content]));
    return h("div", {},
      card(h("div", { class: "row-between" }, this._title, h("div", { class: "row" }, this._scheduleChip, this._studentsChip))),
      section("📊  Archivo de asistencia (Excel)",
        h("div", { class: "row" }, this._excelName,
          h("button", { type: "button", class: "btn btn-primary", onClick: () => this._viewExcel() }, "👁  Ver Excel"),
          h("button", { type: "button", class: "btn", onClick: () => this._downloadExcel() }, "⬇  Descargar"))),
      section("👥  Estudiantes (A-Z por apellidos)", this._studentsTable.el,
        h("div", { class: "row", style: "margin-top:8px;flex-wrap:wrap" },
          h("button", { type: "button", class: "btn btn-primary", onClick: () => this._addStudent() }, "➕  Agregar estudiante"),
          h("button", { type: "button", class: "btn", onClick: () => this._removeStudent() }, "Quitar seleccionado"),
          h("button", { type: "button", class: "btn btn-success", onClick: () => this._finishStudent() }, "✔  Terminar registro"))),
      section("⏰  Horario de lista automática",
        h("div", { class: "row-between", style: "margin-bottom:6px;flex-wrap:wrap;gap:8px" }, this._enabledText,
          h("div", { class: "row", style: "flex-wrap:wrap" },
            h("button", { type: "button", class: "btn btn-success", onClick: () => this._setAllSlots(true) }, "✔  Activar todos"),
            h("button", { type: "button", class: "btn", onClick: () => this._setAllSlots(false) }, "○  Desactivar todos"))),
        this._slotsTable.el,
        h("div", { class: "row", style: "margin-top:8px;flex-wrap:wrap" },
          h("button", { type: "button", class: "btn btn-primary", onClick: () => this._addSlot() }, "➕  Agregar horario"),
          h("button", { type: "button", class: "btn", onClick: () => this._editSlot() }, "✏  Modificar horario"),
          h("button", { type: "button", class: "btn", onClick: () => this._removeSlot() }, "Quitar horario")),
        h("p", { class: "hint", style: "margin:8px 0 0" },
          "La lista se toma sola dentro de cada horario activo, solo a los estudiantes de este curso. Use el botón de cada fila para activar o apagar un horario, o «Activar todos». Un horario que ya tomó lista queda como «Cumplido»: no se puede modificar, solo quitar. La aplicación debe estar abierta.")));
  }

  get selectedId() { return this._selectedId; }

  _current() { return this._state.repository.get(this._selectedId); }

  async _locked() {
    if (!this._state.sessionActive) return false;
    await showInfo("Finalice la lista en curso antes de hacer cambios.", APP_TITLE);
    return true;
  }

  _refreshList() {
    this._refreshing = true;
    this._coursesTable.clear();
    const courses = this._state.repository.courses;
    for (const course of courses) this._coursesTable.add([course.name, course.students.length], course.course_id);
    if (this._selectedId && courses.some((course) => course.course_id === this._selectedId)) this._coursesTable.select(this._selectedId);
    else this._selectedId = null;
    this._refreshing = false;
    this._showSelected();
  }

  _onSelect() {
    if (this._refreshing) return;
    this._selectedId = this._coursesTable.selected;
    sessionStorage.setItem("af_course", this._selectedId ?? "");
    this._showSelected();
  }

  _showSelected() {
    const course = this._current();
    this._empty.hidden = course !== null;
    this._detail.hidden = course === null;
    if (course === null) return;
    this._title.textContent = course.name;
    this._excelName.value = excelFileName(course.name);
    const count = course.students.length;
    this._studentsChip.textContent = `${count} ESTUDIANTE${count === 1 ? "" : "S"}`;
    const active = activeSlotCount(course);
    const done = completedSlotCount(course);
    const pending = course.slots.length - done;
    this._enabledText.textContent = !course.slots.length ? "Sin horarios."
      : !pending ? `Todos los horarios ya se cumplieron (${done}). Quítelos o agregue uno nuevo.`
        : `${active} de ${pending} horario(s) pendiente(s) con lista automática activa.${done ? ` ${done} cumplido(s).` : ""}`;
    const [text, color] = !course.slots.length ? ["SIN HORARIO", GRAY]
      : !pending ? ["HORARIO CUMPLIDO", COLORS.primary]
        : active > 0 ? ["AUTOMÁTICA ACTIVA", COLORS.success] : ["AUTOMÁTICA APAGADA", COLORS.accent];
    this._scheduleChip.textContent = text;
    this._scheduleChip.style.background = color;
    this._studentsTable.clear();
    course.students.forEach((student, index) => this._studentsTable.add([index + 1, student.student_id, student.embeddings.length ? student.name : `${student.name}   ⏳ Falta rostro`], student.student_id));
    this._studentsTable.setEmptyText("Aún no hay estudiantes. Pulse «Agregar estudiante».");
    const keptSlot = this._slotsTable.selected;
    this._slotsTable.clear();
    this._countdowns = [];
    course.slots.forEach((slot, index) => this._slotsTable.add(
      [slotDaysText(slot), slot.start, slot.end, `${slotMinutes(slot)} min`, this._slotButton(course, slot, index), this._countdownCell(course, slot)], String(index)));
    this._slotsTable.setEmptyText("Sin horarios.");
    if (keptSlot !== null) this._slotsTable.select(keptSlot);
  }

  _countdownCell(course, slot) {
    const entry = { span: h("span", { style: "font-variant-numeric:tabular-nums" }), course, slot };
    this._countdowns.push(entry);
    this._paintCountdown(entry, new Date());
    return entry.span;
  }

  _paintCountdown({ span, course, slot }, now) {
    let text = "—";
    if (isSlotActive(course, slot)) {
      const next = slotNextStart(slot, now);
      if (next !== null) text = next.running ? "▶ En curso ahora" : formatRemaining(next.start - now);
    } else if (!isSlotCompleted(slot)) text = "Apagado";
    if (span.textContent !== text) span.textContent = text;
  }

  onTick(now) {
    for (const entry of this._countdowns ?? []) this._paintCountdown(entry, now);
  }

  _slotButton(course, slot, index) {
    if (isSlotCompleted(slot)) {
      const date = slot.completed_on.split("-").reverse().join("/");
      return h("span", { style: "font-weight:700;color:var(--success, #27AE60)", title: `Lista tomada el ${date}. Ya no se puede modificar; solo quitar.` }, `✔ Cumplido ${date}`);
    }
    const on = isSlotActive(course, slot);
    return h("button", {
      type: "button", class: on ? "btn btn-success" : "btn", style: "padding:3px 10px;min-width:104px", "aria-pressed": String(on),
      "aria-label": `${on ? "Apagar" : "Activar"} la lista automática del horario ${slotLabel(slot)}`,
      onClick: (event) => { event.stopPropagation(); this._toggleSlot(index); },
    }, on ? "● Activa" : "○ Apagada");
  }

  async _saveUpdate(update) {
    const course = this._current();
    if (course === null) throw new ValidationError("Seleccione un curso.");
    const updated = update(course);
    try {
      await this._state.saveCourse(updated);
    } catch (error) {
      if (error instanceof StorageError) throw new ValidationError(`No se pudo guardar el curso: ${error.message}`);
      throw error;
    }
    return updated;
  }

  async _run(update) {
    try {
      await this._saveUpdate(update);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      await showError(error.message, APP_TITLE);
      this._showSelected();
      return false;
    }
    return true;
  }

  async _newCourse() {
    if (await this._locked()) return;
    new NameDialog({
      title: "Nuevo curso", subtitle: "Se creará con su propio Excel", initial: "", confirmText: "Crear curso",
      onAccept: async (name) => {
        const course = await this._guard(() => this._state.repository.create(name), "No se pudo crear el curso");
        this._selectedId = course.course_id;
        this._state.notifyCoursesChanged();
      },
    });
  }

  async _guard(action, message) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof StorageError) throw new ValidationError(`${message}: ${error.message}`);
      throw error;
    }
  }

  async _renameCourse() {
    const course = this._current();
    if (course === null) { await showInfo("Seleccione un curso de la lista.", APP_TITLE); return; }
    if (await this._locked()) return;
    new NameDialog({
      title: "Renombrar curso", subtitle: course.name, initial: course.name, confirmText: "Guardar nombre",
      onAccept: async (name) => {
        await this._guard(() => this._state.repository.rename(course.course_id, name), "No se pudo renombrar el curso");
        this._state.notifyCoursesChanged();
      },
    });
  }

  async _deleteCourse() {
    const course = this._current();
    if (course === null) { await showInfo("Seleccione un curso de la lista.", APP_TITLE); return; }
    if (await this._locked()) return;
    const confirmed = await askYesNo(
      `¿Eliminar el curso «${course.name}» y sus ${course.students.length} estudiantes registrados?\n` +
      "También se borra su asistencia guardada. Descargue el Excel antes si lo necesita.", APP_TITLE);
    if (!confirmed) return;
    try {
      await this._state.repository.delete(course.course_id);
    } catch (error) {
      await showError(`No se pudo eliminar el curso: ${error.message}`, APP_TITLE);
      return;
    }
    this._selectedId = null;
    this._state.notifyCoursesChanged();
  }

  /** Abre la hoja de asistencia (excel.html) en otra pestaña, como un Excel normal. */
  _viewExcel() {
    const course = this._current();
    if (course === null) return;
    this.onViewExcel?.(course.course_id);
  }

  async _downloadExcel() {
    const course = this._current();
    if (course === null) return;
    try {
      const stored = await this._state.bookRepository.get(course.course_id);
      if (!stored) { await showInfo("El Excel aún no existe. Se crea al tomar la primera lista.", APP_TITLE); return; }
      const XLSX = await loadXlsx();
      const bytes = buildWorkbookBytes(XLSX, { ...stored, sheet_title: stored.sheet_title || course.name });
      downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), excelFileName(course.name));
    } catch (error) {
      await showError(`No se pudo crear el Excel: ${error.message}`, APP_TITLE);
    }
  }

  async _addStudent() {
    const course = this._current();
    if (course === null) { await showInfo("Seleccione un curso de la lista.", APP_TITLE); return; }
    if (await this._locked()) return;
    const taken = new Set(course.students.map((student) => student.student_id));
    new RegistrationDialog({
      engine: this._state.engine, openCamera: () => this._state.openCamera(), courseName: course.name,
      isTaken: (cedula) => taken.has(cedula),
      findDuplicate: (cedula, samples) => this._findDuplicateFace(cedula, samples),
      onSaved: (student) => this._studentSaved(student),
    });
  }

  /** Busca el rostro en TODOS los cursos; la misma cédula no cuenta como duplicado. */
  _findDuplicateFace(cedula, samples) {
    const others = this._state.repository.courses.flatMap((course) =>
      course.students.filter((student) => student.student_id !== cedula));
    return new Gallery(others).bestMatch(samples, this._state.settings.threshold);
  }

  async _studentSaved(student) {
    const updated = await this._saveUpdate((course) => courseAddStudent(course, student));
    try {
      await this._state.bookFor(updated).syncStudents(updated.students);
    } catch (error) {
      if (!(error instanceof AttendanceError)) throw error;
      await showWarning(
        `El estudiante se guardó, pero aún no se agregó al Excel:\n${error.message}\n\n` +
        "Se agregará automáticamente en la próxima lista.", APP_TITLE);
    }
  }

  /** Completa el registro facial de un estudiante importado desde Excel (ya tiene cédula y nombre). */
  async _finishStudent() {
    const course = this._current();
    const student = course?.students.find((item) => item.student_id === this._studentsTable.selected);
    if (!student) { await showInfo("Seleccione un estudiante de la lista.", APP_TITLE); return; }
    if (student.embeddings.length) { await showInfo("Este estudiante ya terminó su registro facial.", APP_TITLE); return; }
    if (await this._locked()) return;
    new RegistrationDialog({
      engine: this._state.engine, openCamera: () => this._state.openCamera(), courseName: course.name,
      prefill: { cedula: student.student_id, name: student.name },
      isTaken: () => false,
      findDuplicate: (cedula, samples) => this._findDuplicateFace(cedula, samples),
      onSaved: (done) => this._saveUpdate((current) => createCourse({
        ...current, students: current.students.map((item) => (item.student_id === done.student_id ? done : item)),
      })),
    });
  }

  async _removeStudent() {
    const studentId = this._studentsTable.selected;
    if (studentId === null) { await showInfo("Seleccione un estudiante de la lista.", APP_TITLE); return; }
    if (await this._locked()) return;
    if (await askYesNo(`¿Quitar la cédula ${studentId} de este curso?\nSu fila en el Excel se conserva.`, APP_TITLE)) {
      await this._run((course) => courseRemoveStudent(course, studentId));
    }
  }

  async _addSlot() {
    if (this._current() === null) { await showInfo("Seleccione un curso de la lista.", APP_TITLE); return; }
    if (await this._locked()) return;
    new SlotDialog((slot) => this._saveUpdate((course) => courseAddSlot(course, slot)));
  }

  async _removeSlot() {
    const selected = this._slotsTable.selected;
    if (selected === null) { await showInfo("Seleccione un horario de la lista.", APP_TITLE); return; }
    if (await this._locked()) return;
    await this._run((course) => courseRemoveSlot(course, Number(selected)));
  }

  async _editSlot() {
    const course = this._current();
    if (course === null) { await showInfo("Seleccione un curso de la lista.", APP_TITLE); return; }
    const selected = this._slotsTable.selected;
    if (selected === null) { await showInfo("Seleccione el horario que desea modificar.", APP_TITLE); return; }
    if (await this._locked()) return;
    const index = Number(selected);
    const slot = course.slots[index];
    if (!slot) { await showInfo("Ese horario ya no existe.", APP_TITLE); this._showSelected(); return; }
    if (isSlotCompleted(slot)) { await showInfo("Ese horario ya se cumplió y no se puede modificar. Solo puede quitarlo con «Quitar horario».", APP_TITLE); return; }
    new SlotDialog((updated) => this._saveUpdate((current) => courseReplaceSlot(current, index, updated)), slot);
  }

  async _toggleSlot(index) {
    if (await this._locked()) return;
    await this._run((course) => courseToggleSlot(course, index));
  }

  async _setAllSlots(enabled) {
    const course = this._current();
    if (course === null) { await showInfo("Seleccione un curso de la lista.", APP_TITLE); return; }
    if (!course.slots.length) { await showInfo("Agregue al menos un horario para que la lista automática funcione.", APP_TITLE); return; }
    if (completedSlotCount(course) === course.slots.length) { await showInfo("Todos los horarios ya se cumplieron. Quítelos o agregue uno nuevo.", APP_TITLE); return; }
    if (await this._locked()) return;
    await this._run((current) => courseSetAllSlots(current, enabled));
  }
}
