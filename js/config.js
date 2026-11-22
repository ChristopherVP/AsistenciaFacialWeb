export const APP_TITLE = "Asistencia Facial";
export const APP_SUBTITLE = "Control de asistencia con reconocimiento facial";

export const DETECTOR_FILE = "face_detection_yunet_2023mar.onnx";
export const RECOGNIZER_FILE = "face_recognition_sface_2021dec.onnx";
export const MODELS_PATH = "./modelos/";
export const MIN_MODEL_BYTES = 100_000;

export const DETECTOR_SCORE_THRESHOLD = 0.85;
export const DETECTOR_NMS_THRESHOLD = 0.3;
export const DETECTOR_TOP_K = 5000;

export const CONFIRM_FRAMES = 3;
export const PROCESS_EVERY_N_FRAMES = 2;
export const FRAME_DELAY_MS = 33;
export const MAX_READ_FAILURES = 90;
export const VIEW_WIDTH = 640;
export const VIEW_HEIGHT = 480;
export const MIN_THRESHOLD = 0.30;
export const MAX_THRESHOLD = 0.80;
export const NOTICE_MS = 4000;

export const MAX_PROVINCE_CODE = 24;
export const NAME_MAX_LENGTH = 60;

export const SAMPLE_INTERVAL = 0.6;
export const MAX_SAMPLES = 5;
export const MIN_FACE_SCORE = 0.9;
export const SCAN_TIMEOUT_SECONDS = 60.0;
export const REMIND_SECONDS = 8.0;
export const MAX_YAW_RATIO = 0.25;
export const MAX_ROLL_RATIO = 0.30;

/**
 * Cómo decide el sistema que un rostro es de un estudiante.
 * threshold: parecido mínimo (coseno). margin: ventaja mínima sobre el segundo
 * estudiante más parecido. confirmFrames: lecturas seguidas antes de marcar presente.
 */
export const PRECISION_LEVELS = Object.freeze([
  Object.freeze({
    name: "Flexible", threshold: 0.33, margin: 0.0, confirmFrames: 2,
    description: "Reconoce con más facilidad. Úselo si el sistema no reconoce a los estudiantes.",
  }),
  Object.freeze({
    name: "Equilibrado", threshold: 0.40, margin: 0.05, confirmFrames: CONFIRM_FRAMES,
    description: "Recomendado para la mayoría de los casos.",
  }),
  Object.freeze({
    name: "Estricto", threshold: 0.50, margin: 0.10, confirmFrames: 5,
    description: "Evita confundir a una persona con otra. Úselo si hay falsos registros.",
  }),
]);

/** Nivel guardado en los ajustes (solo se persiste el umbral). */
export function precisionFor(threshold) {
  return PRECISION_LEVELS.reduce((best, level) =>
    Math.abs(level.threshold - threshold) < Math.abs(best.threshold - threshold) ? level : best);
}

export const MIN_USERNAME_LENGTH = 4;
export const MAX_USERNAME_LENGTH = 20;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 64;
export const MIN_ANSWER_LENGTH = 3;
export const PBKDF2_ITERATIONS = 200_000;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 30.0;
export const SECURITY_QUESTIONS = Object.freeze([
  "¿Cómo se llamaba su primera mascota?",
  "¿En qué ciudad nació su madre?",
  "¿Cuál es el nombre de su mejor amigo de la infancia?",
  "¿Cómo se llamaba su escuela primaria?",
  "¿Cuál es su comida favorita?",
]);

export const DAY_LABELS = Object.freeze(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
export const MAX_SLOT_MINUTES = 60;
export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const COLORS = Object.freeze({
  primary: "#1F4E79", primaryDark: "#163A5A", success: "#2E8B57", danger: "#B03A2E",
  warning: "#B9770E", bg: "#EEF2F6", card: "#FFFFFF", text: "#1B2631", muted: "#5D6D7E",
  border: "#D5DCE4", zebra: "#F5F8FB", select: "#D6E9F8", accent: "#2E86C1", infoBg: "#EAF2FB",
});
export const DB_NAME = "AsistenciaFacial";
export const EXCEL_SUFFIX = "_ListaAsistencia.xlsx";
