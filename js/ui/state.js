import { AttendanceBook } from "../attendance.js";
import { openConfiguredCamera } from "../camera.js";
import { AuthError } from "../errors.js";
import { createCourse } from "../models.js";

/** Estado compartido de la aplicación (equivale a ui/state.py). */
export class AppState {
  constructor({ engine, repository, bookRepository, settingsRepository, settings, users }) {
    this.engine = engine;
    this.repository = repository;
    this.bookRepository = bookRepository;
    this.settings = settings;
    this.users = users;
    this.currentUser = null;
    this.sessionActive = false;
    this._settingsRepository = settingsRepository;
    this._listeners = [];
    this._channel = globalThis.BroadcastChannel ? new BroadcastChannel("af-courses") : null;
    if (this._channel) this._channel.onmessage = async () => { await this.repository.reload(); this.notifyCoursesChanged(false); };
  }

  signIn(user) { this.currentUser = user; }
  signOut() { this.currentUser = null; }

  async setRememberCurrentUser(remembered) {
    if (this.currentUser === null) throw new AuthError("No hay una sesión iniciada.");
    this.currentUser = await this.users.setRemembered(this.currentUser.cedula, remembered);
    return this.currentUser;
  }

  subscribe(callback) { this._listeners.push(callback); }
  clearSubscribers() { this._listeners = []; }
  notifyCoursesChanged(broadcast = true) {
    for (const callback of [...this._listeners]) callback();
    if (broadcast) this._channel?.postMessage("changed"); // avisa a las otras ventanas/pestañas
  }

  async saveCourse(course, notify = true) {
    await this.repository.save(createCourse(course));
    if (notify) this.notifyCoursesChanged();
  }

  async updateSettings(settings) {
    await this._settingsRepository.save(settings);
    this.settings = Object.freeze({ ...settings });
  }

  bookFor(course) { return new AttendanceBook(this.bookRepository, course.course_id, course.name); }
  openCamera() { return openConfiguredCamera(this.settings); }
}
