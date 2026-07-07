/** Supported UI languages. English is the international-standard default. */
export const SUPPORTED_LANGS = ['en', 'es'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: Lang = 'en';

/** Lang → BCP-47 locale for date/number formatting (transloco-locale). */
export const LANG_TO_LOCALE: Record<Lang, string> = {
  en: 'en-US',
  es: 'es-PE',
};

const STORAGE_KEY = 'lang';

/**
 * Initial UI language: a previously saved choice → the browser/OS language
 * (`navigator.language`) → {@link DEFAULT_LANG}. Persisted choices win so the user's
 * explicit switch survives reloads.
 */
export function resolveInitialLang(): Lang {
  const saved = readSavedLang();
  if (saved) return saved;

  const nav = (navigator.language || '').toLowerCase();
  return SUPPORTED_LANGS.find((l) => nav.startsWith(l)) ?? DEFAULT_LANG;
}

function readSavedLang(): Lang | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGS.includes(saved as Lang) ? (saved as Lang) : null;
  } catch {
    return null;
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode / storage disabled — fall back to in-memory only */
  }
}
