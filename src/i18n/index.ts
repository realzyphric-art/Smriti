// ============================================================
// Smriti — i18n
// Nested translation dictionaries with English fallback.
// Usage:  const { t } = useI18n();  t('home.startGame')
// ============================================================

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { LanguageCode } from '@/types';
import en from './locales/en';
import hi from './locales/hi';
import bn from './locales/bn';
import as from './locales/as';

export type LocaleDict = { [key: string]: string | LocaleDict };

const LOCALES: Record<LanguageCode, LocaleDict> = {
  en: en as unknown as LocaleDict,
  hi,
  bn,
  as,
};

export interface LanguageMeta {
  code: LanguageCode;
  english: string; // English name
  native: string; // name in its own script
  sample: string; // a friendly greeting in-script
  complete: boolean; // fully translated UI?
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'en', english: 'English', native: 'English', sample: 'Hello', complete: true },
  { code: 'hi', english: 'Hindi', native: 'हिन्दी', sample: 'नमस्ते', complete: true },
  { code: 'as', english: 'Assamese', native: 'অসমীয়া', sample: 'নমস্কাৰ', complete: false },
  { code: 'bn', english: 'Bengali', native: 'বাংলা', sample: 'নমস্কার', complete: false },
];

function lookup(dict: LocaleDict, path: string[]): string | undefined {
  let node: string | LocaleDict | undefined = dict;
  for (const seg of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[seg];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(
  lang: LanguageCode,
  key: string,
  params?: Record<string, string | number>,
): string {
  const path = key.split('.');
  const active = LOCALES[lang];
  let value = active ? lookup(active, path) : undefined;
  if (value === undefined) value = lookup(LOCALES.en, path); // fallback
  if (value === undefined) value = key; // last resort: the key itself

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}

// ---------- React context ----------

export type TFunction = (
  key: string,
  params?: Record<string, string | number>,
) => string;

interface I18nContextValue {
  lang: LanguageCode;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  lang,
  children,
}: {
  lang: LanguageCode;
  children: ReactNode;
}) {
  const t = useCallback<TFunction>((key, params) => translate(lang, key, params), [lang]);
  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
