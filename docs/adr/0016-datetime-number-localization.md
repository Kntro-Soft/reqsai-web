# 0016. Date / time / number localization

- Status: Accepted
- Date: 2026-06-29
- Deciders: Kntro-Soft team

## Context

The backend stores and serves all timestamps in **UTC** (PostgreSQL `TIMESTAMPTZ`,
`hibernate.jdbc.time_zone=UTC`, ISO-8601 with `Z`). Displaying them is a **frontend** concern: we
must (1) convert to the viewer's local time, (2) format dates/numbers per the active language, and
(3) keep both in sync with the runtime language switch introduced in
[ADR-0015](0015-i18n-transloco.md).

Key insight: UTC→local conversion is **automatic** — `new Date("…Z")` is parsed as UTC and rendered
in the browser's local timezone when formatted. So the decision is only *which formatter* to use and
*which locale* it follows. Relative time ("5 minutes ago") is a **duration**, so it is correct in any
country regardless of timezone.

## Decision

- **Absolute dates/numbers:** use **`@jsverse/transloco-locale`** pipes (`translocoDate`,
  `translocoDecimal`, `translocoCurrency`). They format using native `Intl` and **auto-sync with the
  active Transloco language** (`en → en-US`, `es → es-PE`), so dates re-format on a language switch.
- **Relative time:** a small in-house **`FromNowPipe`** (`shared/pipes/from-now.pipe.ts`) over native
  `Intl.RelativeTimeFormat`, reading the **active Transloco language** for its locale. It is an
  **impure** pipe so it reflects both language changes and the passage of time.
- **Timezone:** always the **browser's local timezone** (automatic). A fixed/configured timezone
  (e.g. per-organization) is out of scope; if ever needed, store a `timeZone` and pass it to the
  formatter.
- **No extra date library** (date-fns / Luxon / Day.js): Angular + native `Intl` + transloco-locale
  cover the need, keeping dependencies minimal.

## Consequences

- A user in any country sees timestamps in their own local clock time, formatted in the active
  language; switching language re-formats dates and flips relative time ("hace 5 minutos" ↔
  "5 minutes ago") live.
- Relies on the API always sending ISO-8601 with `Z`/offset (true today via `TIMESTAMPTZ`); a naive
  timestamp without offset would be misparsed as local — a contract to keep.
- The relative-time pipe being impure runs on each change-detection pass; acceptable for lists/detail
  views. A constantly-ticking clock should be driven by a timer signal instead.
- Correct relative time depends on the device clock being roughly accurate (universal caveat).
