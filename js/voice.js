const CULTURE_SCORES = Object.freeze({ "es-MX": 3, "es-US": 2, "es-ES": 1 });
// Voces femeninas conocidas (Windows, Edge, Chrome, macOS, Android).
const FEMALE_HINTS = Object.freeze([
  "sabina", "helena", "laura", "paulina", "monica", "mónica", "elena", "dalia", "elvira", "salome", "salomé",
  "paloma", "lucia", "lucía", "camila", "ximena", "marisol", "marina", "carmen", "esperanza", "isabela",
  "valentina", "female", "mujer", "google español", "google espanol",
]);
const MALE_PATTERN = /\b(male|hombre|raul|raúl|pablo|jorge|diego|juan|carlos|alvaro|álvaro|arnau|gonzalo|enrique|jaime|miguel|alonso|tomas|tomás|lorenzo)\b/i;
const FEMALE_PITCH = 1.0;
const FALLBACK_PITCH = 1.3; // si solo hay voces masculinas, se sube el tono

const isFemale = (voice) => {
  const name = voice.name.toLowerCase();
  return FEMALE_HINTS.some((hint) => name.includes(hint)) && !/\bmale\b/.test(name.replace("female", ""));
};

function scoreVoice(voice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.replace("_", "-");
  let score = CULTURE_SCORES[lang] ?? 0;
  if (isFemale(voice)) score += 10;
  else if (MALE_PATTERN.test(name)) score -= 100;
  if (name.includes("natural") || name.includes("online")) score += 2;
  return score;
}

/** Elige la mejor voz femenina en español disponible (o la menos masculina si no hay). */
export function pickFemaleSpanishVoice(voices) {
  const spanish = voices.filter((voice) => voice.lang.replace("_", "-").toLowerCase().startsWith("es"));
  if (!spanish.length) return null;
  return spanish.reduce((best, voice) => (scoreVoice(voice) > scoreVoice(best) ? voice : best));
}

/** Voz en español con speechSynthesis (equivalente a voice.py), preferentemente de mujer. */
export class Speaker {
  constructor(synth = globalThis.speechSynthesis) {
    this._synth = synth ?? null;
    this._speaking = false;
  }

  get available() { return this._synth !== null && typeof SpeechSynthesisUtterance !== "undefined"; }
  get isSpeaking() { return this._speaking; }

  speak(text) {
    if (!this.available) return false;
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickFemaleSpanishVoice(this._synth.getVoices());
    utterance.lang = voice ? voice.lang : "es-MX";
    if (voice) utterance.voice = voice;
    utterance.pitch = voice && !MALE_PATTERN.test(voice.name) ? FEMALE_PITCH : FALLBACK_PITCH;
    const finish = () => { if (this._current === utterance) this._speaking = false; };
    utterance.onend = finish;
    utterance.onerror = finish;
    this._current = utterance;
    this._speaking = true;
    try {
      this._synth.speak(utterance);
    } catch {
      this._speaking = false;
      return false;
    }
    return true;
  }

  stop() {
    this._current = null;
    this._speaking = false;
    if (this._synth) this._synth.cancel();
  }
}
