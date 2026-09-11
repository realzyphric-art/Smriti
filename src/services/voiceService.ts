// ============================================================
// MemoryCare — Voice Service
// Thin wrapper over the Web Speech API (speechSynthesis).
// Never throws if unsupported; callers can check isSupported().
// ============================================================

import type { LanguageCode } from '@/types';

const BCP47: Record<LanguageCode, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  as: 'as-IN',
  bn: 'bn-IN',
};

export function isVoiceSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

let currentLang: LanguageCode = 'en';
let enabled = true;
let voices: SpeechSynthesisVoice[] = [];
let listeningForVoices = false;
let speechRequestId = 0;

function refreshVoices(): void {
  if (!isVoiceSupported()) return;
  try { voices = window.speechSynthesis.getVoices(); } catch { voices = []; }
}

const onVoicesChanged = () => refreshVoices();

/** Starts voice discovery once the browser is ready; safe to call repeatedly. */
export function initializeVoiceService(): void {
  if (!isVoiceSupported()) return;
  refreshVoices();
  if (!listeningForVoices) {
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    listeningForVoices = true;
  }
}

/** Removes the module listener when the app provider unmounts. */
export function disposeVoiceService(): void {
  if (isVoiceSupported() && listeningForVoices) {
    window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
  }
  listeningForVoices = false;
}

export function configureVoice(lang: LanguageCode, isEnabled: boolean): void {
  currentLang = lang;
  enabled = isEnabled;
  initializeVoiceService();
}

function pickVoice(langTag: string): SpeechSynthesisVoice | undefined {
  refreshVoices();
  if (!voices.length) return undefined;
  // Prefer exact locale, then base language, then any.
  const base = langTag.split('-')[0].toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === langTag.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase() === base || v.lang.toLowerCase().startsWith(`${base}-`))
  );
}

/**
 * Split long screen-reader text into short, complete phrases. Some mobile
 * browsers silently stop a single long utterance after a sentence or two.
 */
export function splitSpeechText(text: string, maxCharacters = 220): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?।！？]+[.!?।！？]+|[^.!?।！？]+$/g) ?? [normalized];
  const chunks: string[] = [];
  let current = '';

  const addPiece = (piece: string) => {
    const value = piece.trim();
    if (!value) return;
    if (value.length <= maxCharacters) {
      chunks.push(value);
      return;
    }
    const words = value.split(' ');
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && next.length > maxCharacters) {
        chunks.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) chunks.push(line);
  };

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence.trim()}` : sentence.trim();
    if (current && next.length > maxCharacters) {
      addPiece(current);
      current = sentence.trim();
    } else {
      current = next;
    }
  }
  addPiece(current);
  return chunks;
}

/** Speak the complete text. No-op (returns false) when disabled or unsupported. */
export function speak(text: string, langOverride?: LanguageCode, onError?: (message: string) => void): boolean {
  if (!enabled || !isVoiceSupported() || !text.trim()) return false;
  try {
    initializeVoiceService();
    const requestId = ++speechRequestId;
    window.speechSynthesis.cancel();
    const tag = BCP47[langOverride ?? currentLang] ?? 'en-IN';
    const chunks = splitSpeechText(text);
    let chunkIndex = 0;

    const speakNext = () => {
      if (requestId !== speechRequestId || chunkIndex >= chunks.length) return;
      const utter = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utter.lang = tag;
      utter.rate = 0.92; // gentle, unhurried pace for older listeners
      utter.pitch = 1;
      utter.volume = 1;
      const v = pickVoice(tag);
      if (v) utter.voice = v;
      utter.onend = () => {
        if (requestId !== speechRequestId) return;
        chunkIndex += 1;
        // A short pause keeps Android Chrome from dropping the next utterance.
        window.setTimeout(speakNext, 60);
      };
      utter.onerror = (event) => {
        // Cancelling a previous sentence to start a new one is intentional.
        if (requestId === speechRequestId && event.error !== 'interrupted' && event.error !== 'canceled') {
          onError?.(`Voice reading is not available in ${tag}. Please install that language voice on this device.`);
        }
      };
      window.speechSynthesis.speak(utter);
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    };

    speakNext();
    return true;
  } catch {
    onError?.('Voice reading could not start. Please try again.');
    return false;
  }
}

export function stopSpeaking(): void {
  if (isVoiceSupported()) {
    try {
      speechRequestId += 1;
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}
