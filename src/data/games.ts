import type { LanguageCode } from '@/types';

export interface GameObject {
  emoji: string;
  label: Partial<Record<LanguageCode, string>>; // content labels (en/hi), fall back to en
}

/** Familiar, culturally-neutral objects for Picture Pairs. */
export const OBJECT_POOL: GameObject[] = [
  { emoji: '🍎', label: { en: 'Red Apple', hi: 'सेब' } },
  { emoji: '🌸', label: { en: 'Blossom', hi: 'फूल' } },
  { emoji: '🐘', label: { en: 'Elephant', hi: 'हाथी' } },
  { emoji: '🏠', label: { en: 'Home', hi: 'घर' } },
  { emoji: '☀️', label: { en: 'Sun', hi: 'सूरज' } },
  { emoji: '🍌', label: { en: 'Banana', hi: 'केला' } },
  { emoji: '🐶', label: { en: 'Dog', hi: 'कुत्ता' } },
  { emoji: '🌳', label: { en: 'Tree', hi: 'पेड़' } },
  { emoji: '🌷', label: { en: 'Tulip', hi: 'ट्यूलिप' } },
  { emoji: '🐟', label: { en: 'Fish', hi: 'मछली' } },
  { emoji: '🫖', label: { en: 'Teapot', hi: 'चायदानी' } },
  { emoji: '🌻', label: { en: 'Sunflower', hi: 'सूरजमुखी' } },
];

export function objectLabel(obj: GameObject, lang: LanguageCode): string {
  return obj.label[lang] ?? obj.label.en ?? '';
}

export interface RoutineStep {
  key: string; // matches i18n routine.steps.<key>
  emoji: string;
}

/** Canonical morning-to-night order. Games take the first N of these. */
export const ROUTINE_STEPS: RoutineStep[] = [
  { key: 'wake', emoji: '☀️' },
  { key: 'brush', emoji: '🪥' },
  { key: 'breakfast', emoji: '🥣' },
  { key: 'medicine', emoji: '💊' },
  { key: 'lunch', emoji: '🍎' },
  { key: 'sleep', emoji: '🌙' },
];
