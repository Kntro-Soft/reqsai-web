/**
 * Config for the transloco keys-manager (`bun run i18n:extract`). Translations
 * live under `public/i18n` (served as static assets), not the default
 * `assets/i18n`, so the tool needs this to locate the source and translation
 * files. CI's hard i18n gate is `bun run i18n:check` (deterministic key parity).
 *
 * Typed loosely on purpose: importing `TranslocoGlobalConfig` from
 * `@jsverse/transloco-utils` would pull in an otherwise-unused dependency.
 */
const config = {
  rootTranslationsPath: 'public/i18n/',
  langs: ['en', 'es'],
  keysManager: {
    input: ['src'],
    defaultValue: '',
  },
};

export default config;
