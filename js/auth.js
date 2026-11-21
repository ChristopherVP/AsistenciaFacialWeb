import {
  LOCKOUT_SECONDS, MAX_LOGIN_ATTEMPTS, PBKDF2_ITERATIONS, SECURITY_QUESTIONS,
} from "./config.js";
import { AuthError, ValidationError } from "./errors.js";
import { getAllRecords, putRecord } from "./storage.js";
import {
  nameSortKey, normalizeAnswer, normalizeFullName, normalizeUsername, validateCedula, validatePassword,
} from "./validators.js";

export const BAD_CREDENTIALS = "Usuario o contraseña incorrecta.";
const encoder = new TextEncoder();

const toHex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (text) => {
  if (!/^([0-9a-f]{2})+$/i.test(text)) throw new TypeError("Sal inválida");
  return Uint8Array.from(text.match(/../g), (pair) => parseInt(pair, 16));
};

async function hashSecret(secret, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

async function protect(secret, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await hashSecret(secret, salt, iterations) };
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function matches(secret, saltHex, expectedHash, iterations) {
  return sameText(await hashSecret(secret, fromHex(saltHex), iterations), expectedHash);
}

/** Bloquea unos segundos tras varios intentos fallidos (solo en memoria). */
export class LoginThrottle {
  constructor(clock = () => performance.now() / 1000, maxAttempts = MAX_LOGIN_ATTEMPTS, lockoutSeconds = LOCKOUT_SECONDS) {
    this._clock = clock;
    this._maxAttempts = maxAttempts;
    this._lockoutSeconds = lockoutSeconds;
    this._failures = new Map();
    this._lockedUntil = new Map();
  }

  check(key) {
    const remaining = (this._lockedUntil.get(key) ?? 0) - this._clock();
    if (remaining > 0) {
      throw new AuthError(`Demasiados intentos fallidos. Espere ${Math.floor(remaining) + 1} s e intente de nuevo.`);
    }
  }

  registerFailure(key) {
    const count = (this._failures.get(key) ?? 0) + 1;
    if (count >= this._maxAttempts) {
      this._failures.delete(key);
      this._lockedUntil.set(key, this._clock() + this._lockoutSeconds);
    } else {
      this._failures.set(key, count);
    }
  }

  reset(key) {
    this._failures.delete(key);
    this._lockedUntil.delete(key);
  }
}

function userFromRecord(raw) {
  const user = {
    cedula: String(raw.cedula), full_name: String(raw.full_name),
    password_salt: String(raw.password_salt), password_hash: String(raw.password_hash),
    question: String(raw.question), answer_salt: String(raw.answer_salt), answer_hash: String(raw.answer_hash),
    iterations: Number(raw.iterations ?? PBKDF2_ITERATIONS), remembered: Boolean(raw.remembered),
    username: String(raw.username || raw.cedula),
  };
  fromHex(user.password_salt);
  fromHex(user.answer_salt);
  return Object.freeze(user);
}

export class UserRepository {
  constructor(clock) {
    this._throttle = new LoginThrottle(clock);
    this.loadWarning = null;
    this._users = new Map();
  }

  static async load(clock) {
    const repository = new UserRepository(clock);
    try {
      const records = await getAllRecords("users");
      repository._users = new Map(records.map(userFromRecord).map((user) => [user.cedula, user]));
    } catch (error) {
      repository.loadWarning = `No se pudo leer el archivo de usuarios (${error.message}).`;
    }
    return repository;
  }

  get hasUsers() { return this._users.size > 0; }
  get(cedula) { return this._users.get(cedula) ?? null; }

  findByUsername(username) {
    const wanted = username.trim().toLowerCase();
    return [...this._users.values()].find((user) => user.username === wanted) ?? null;
  }

  usernameTaken(username) { return this.findByUsername(username) !== null; }

  rememberedUsers() {
    return [...this._users.values()].filter((user) => user.remembered)
      .sort((a, b) => nameSortKey(a.full_name).localeCompare(nameSortKey(b.full_name)));
  }

  async _persist(user) {
    try {
      await putRecord("users", { ...user });
    } catch (error) {
      throw new AuthError(`No se pudo guardar el archivo de usuarios: ${error.message}`);
    }
    this._users = new Map([...this._users, [user.cedula, user]]);
  }

  async register(cedula, fullName, username, password, confirmation, question, answer) {
    const validCedula = validateCedula(cedula);
    const name = normalizeFullName(fullName);
    const validUsername = normalizeUsername(username);
    validatePassword(password, confirmation);
    if (!SECURITY_QUESTIONS.includes(question)) {
      throw new ValidationError("Elija una pregunta de seguridad de la lista.");
    }
    const normalizedAnswer = normalizeAnswer(answer);
    if (this._users.has(validCedula)) throw new ValidationError("Ya existe un usuario con esa cédula.");
    if (this.usernameTaken(validUsername)) {
      throw new ValidationError("Ese nombre de usuario ya está en uso. Elija otro.");
    }
    const secret = await protect(password);
    const answerSecret = await protect(normalizedAnswer);
    const user = Object.freeze({
      cedula: validCedula, full_name: name, username: validUsername,
      password_salt: secret.salt, password_hash: secret.hash, question,
      answer_salt: answerSecret.salt, answer_hash: answerSecret.hash,
      iterations: PBKDF2_ITERATIONS, remembered: false,
    });
    await this._persist(user);
    return user;
  }

  async authenticate(username, password) {
    const key = `login:${username.trim().toLowerCase()}`;
    this._throttle.check(key);
    const user = this.findByUsername(username);
    if (user === null || !(await matches(password, user.password_salt, user.password_hash, user.iterations))) {
      this._throttle.registerFailure(key);
      throw new AuthError(BAD_CREDENTIALS);
    }
    this._throttle.reset(key);
    return user;
  }

  authenticateRemembered(cedula) {
    const user = this._users.get(cedula);
    if (!user || !user.remembered) {
      throw new AuthError("Este usuario ya no está guardado. Escriba su contraseña.");
    }
    return user;
  }

  securityQuestion(username) {
    const user = this.findByUsername(username);
    if (user === null) throw new AuthError("No existe ese usuario.");
    return user.question;
  }

  async recoverPassword(username, answer, newPassword, confirmation) {
    const key = `recover:${username.trim().toLowerCase()}`;
    this._throttle.check(key);
    const user = this.findByUsername(username);
    if (user === null) throw new AuthError("No existe ese usuario.");
    const normalized = normalizeAnswer(answer);
    if (!(await matches(normalized, user.answer_salt, user.answer_hash, user.iterations))) {
      this._throttle.registerFailure(key);
      throw new AuthError("La respuesta de seguridad es incorrecta.");
    }
    validatePassword(newPassword, confirmation);
    const secret = await protect(newPassword, user.iterations);
    const updated = Object.freeze({ ...user, password_salt: secret.salt, password_hash: secret.hash });
    await this._persist(updated);
    this._throttle.reset(key);
    this._throttle.reset(`login:${user.username}`);
    return updated;
  }

  async setRemembered(cedula, remembered) {
    const user = this._users.get(cedula);
    if (!user) throw new AuthError("El usuario ya no existe.");
    const updated = Object.freeze({ ...user, remembered });
    await this._persist(updated);
    return updated;
  }
}
