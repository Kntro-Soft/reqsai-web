# 0015. Internationalization (i18n) with Transloco

- Status: Accepted
- Date: 2026-06-29
- Deciders: Kntro-Soft team

## Context

The UI shipped with hard-coded Spanish strings. We want the app available in multiple languages
with **runtime** switching (a user changes language without a rebuild or reload), defaulting to the
user's browser/OS language and falling back to a sane default. Options considered:

- **`@angular/localize`** (official) — AOT, no runtime overhead, but produces **one build per
  locale** and does **not** support runtime language switching. Disqualified for our requirement.
- **ngx-translate** — mature, most-downloaded runtime library; simpler but lazy-loading and modern
  (signals) ergonomics are weaker.
- **Transloco (`@jsverse/transloco`)** — successor to ngx-translate, actively maintained, runtime
  switching, lazy-loaded scopes, **signals support** (`translateSignal`, `langChanges$`), and a
  companion **`@jsverse/transloco-locale`** plugin for locale-aware date/number formatting that
  auto-syncs with the active language (see [ADR-0016](0016-datetime-number-localization.md)).

## Decision

Use **Transloco** (`@jsverse/transloco`) for UI text i18n.

- **Languages:** `en` (default — international standard) and `es`. `LANG_TO_LOCALE` maps
  `en → en-US`, `es → es-PE`.
- **Initial language** (`core/i18n/language.ts`): saved choice (`localStorage`) → browser language
  (`navigator.language`) → `en`. The explicit user choice wins and survives reloads. Persisted
  client-side only (like the theme) — not stored server-side.
- **Loader:** `TranslocoHttpLoader` fetches `public/i18n/{lang}.json` via `HttpClient`.
- **Config:** `provideTransloco({ availableLangs, defaultLang: <resolved>, fallbackLang: 'en',
  reRenderOnLangChange: true })`. `LOCALE_ID` is set to the initial language's locale.
- **Usage:** templates use the `transloco` pipe (`{{ 'key' | transloco }}`); TypeScript uses
  `TranslocoService.translate('key')`. Keys are namespaced root files (`common.`, `nav.`, `auth.`,
  `sessions.`, …); feature scopes / lazy-loading can be added later.
- **Switcher:** a language selector lives in the user menu; switching calls
  `TranslocoService.setActiveLang(lang)` + persists the choice.

## Consequences

- Users can switch language live; the choice persists and the browser language is honored on first
  visit. `en` is always the fallback so unsupported browser languages degrade gracefully.
- Translating the whole UI is incremental: strings move from templates/TS to `en.json`/`es.json`
  over successive PRs (phased migration).
- **E2E / test impact:** specs and capture scripts that assert Spanish text break under the new
  English default; they must assert by `data-testid` or pin the language deterministically.
- Two runtime dependencies added (`@jsverse/transloco` ~8 kB gz, `@jsverse/transloco-locale` ~5 kB).
- A missing key falls back to the fallback-language translation, so partial translation never blanks
  the UI.
