import {
  MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH, MAX_PROVINCE_CODE, MIN_ANSWER_LENGTH,
  MIN_PASSWORD_LENGTH, MIN_USERNAME_LENGTH, NAME_MAX_LENGTH,
} from "./config.js";
import { ValidationError } from "./errors.js";

const LETTERS = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ";
const NAME_PATTERN = new RegExp(`^[${LETTERS}]+( [${LETTERS}]+)*$`);
const CEDULA_INPUT_PATTERN = /^[0-9]{0,10}$/;
const NAME_INPUT_PATTERN = new RegExp(`^[${LETTERS} ]{0,${NAME_MAX_LENGTH}}$`);
const DIGITS_ONLY = /^[0-9]+$/;
const USERNAME_INPUT_PATTERN = new RegExp(`^[A-Za-z0-9._]{0,${MAX_USERNAME_LENGTH}}$`);
const USERNAME_PATTERN = new RegExp(
  `^[a-z][a-z0-9._]{${MIN_USERNAME_LENGTH - 1},${MAX_USERNAME_LENGTH - 1}}$`);
const TIME_PART_PATTERN = /^[0-9]{0,2}$/;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;

const squeeze = (text) => text.split(/\s+/).filter(Boolean).join(" ");
const stripAccents = (text) => text.normalize("NFD").replace(/\p{M}/gu, "");

function allowsTimePart(text, maximum) {
  if (!TIME_PART_PATTERN.test(text)) return false;
  return text === "" || Number(text) <= maximum;
}

export const allowsHourInput = (text) => allowsTimePart(text, MAX_HOUR);
export const allowsMinuteInput = (text) => allowsTimePart(text, MAX_MINUTE);
export const allowsCedulaInput = (text) => CEDULA_INPUT_PATTERN.test(text);
export const allowsNameInput = (text) => NAME_INPUT_PATTERN.test(text);
export const allowsUsernameInput = (text) => USERNAME_INPUT_PATTERN.test(text);

export function normalizeUsername(text) {
  const value = text.trim().toLowerCase();
  if (!value) throw new ValidationError("Escribe el nombre de usuario.");
  if (!USERNAME_PATTERN.test(value)) {
    throw new ValidationError(
      `Usuario de ${MIN_USERNAME_LENGTH} a ${MAX_USERNAME_LENGTH} caracteres: ` +
      "empieza con letra; solo letras, números, punto o guion bajo.");
  }
  return value;
}

export function validateCedula(text) {
  const value = text.trim();
  if (!value) throw new ValidationError("Escribe la cédula.");
  if (!DIGITS_ONLY.test(value)) throw new ValidationError("La cédula solo puede tener números.");
  if (value.length !== 10) throw new ValidationError("La cédula debe tener exactamente 10 dígitos.");
  const province = Number(value.slice(0, 2));
  if (province < 1 || province > MAX_PROVINCE_CODE) {
    throw new ValidationError(
      `Los dos primeros dígitos deben estar entre 01 y ${MAX_PROVINCE_CODE}.`);
  }
  if (Number(value[2]) > 5) {
    throw new ValidationError("El tercer dígito de la cédula debe ser de 0 a 5.");
  }
  let total = 0;
  for (let position = 0; position < 9; position += 1) {
    const product = Number(value[position]) * (position % 2 === 0 ? 2 : 1);
    total += product > 9 ? product - 9 : product;
  }
  const checkDigit = (10 - (total % 10)) % 10;
  if (checkDigit !== Number(value[9])) {
    throw new ValidationError("Cédula no válida: el dígito verificador no coincide.");
  }
  return value;
}

export function normalizeFullName(text) {
  const clean = squeeze(text);
  if (!clean) throw new ValidationError("Escribe los apellidos y nombres.");
  if (!NAME_PATTERN.test(clean)) {
    throw new ValidationError("Los apellidos y nombres solo pueden tener letras y espacios.");
  }
  if (clean.split(" ").length < 2) {
    throw new ValidationError("Escribe apellidos y nombres (al menos dos palabras).");
  }
  if (clean.length > NAME_MAX_LENGTH) {
    throw new ValidationError(`Máximo ${NAME_MAX_LENGTH} caracteres.`);
  }
  return clean.toUpperCase();
}

export const nameSortKey = (name) => stripAccents(name).toLowerCase();

export function validatePassword(password, confirmation) {
  if (!password) throw new ValidationError("Escribe la contraseña.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(
      `La contraseña no puede pasar de ${MAX_PASSWORD_LENGTH} caracteres.`);
  }
  if (password !== confirmation) throw new ValidationError("Las contraseñas no coinciden.");
  return password;
}

export function normalizeAnswer(text) {
  const answer = stripAccents(squeeze(text)).toLowerCase();
  if (answer.length < MIN_ANSWER_LENGTH) {
    throw new ValidationError(
      `La respuesta de seguridad debe tener al menos ${MIN_ANSWER_LENGTH} caracteres.`);
  }
  return answer;
}
