# 0004. Spartan UI + Tailwind CSS v4 for UI components

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The project needs a UI component library that: (1) is Angular-native (not a wrapper around a React
library), (2) is accessible (ARIA-compliant), (3) is headless / style-agnostic so we can apply our
own brand theme, and (4) works with Tailwind CSS. Options considered: Angular Material, PrimeNG,
ng-zorro, Spartan UI.

Tailwind CSS v4 (PostCSS plugin–based, no `tailwind.config.js`) aligns with the project's
CSS-custom-property token system and offers utility-first styling with zero runtime overhead.

## Decision

Use **Spartan UI** (`@spartan-ng/brain` headless primitives + helm component layer copied into
`src/app/shared/ui/`). Use **Tailwind CSS v4** via `@tailwindcss/postcss`.

The brand color theme is defined as CSS custom properties (OKLCh color space) in `src/styles.css`
under `:root` (light) and `.dark` (dark mode), following the `shadcn/ui` token convention adapted
for Angular.

Helm components (Spartan's styled layer) are **copied** into the repo rather than imported from a
package so the team can customize them without forking the library.

## Consequences

- Accessible UI out of the box (Spartan UI is built on Angular CDK).
- Full design control: all colors and radii are CSS variables; switching themes is a class swap.
- Helm components being in-repo adds maintenance responsibility; Spartan upstream updates must be
  manually merged for individual components.
- Tailwind v4's PostCSS approach removes the need for a `tailwind.config.js`; the theme lives in CSS.
- OKLCh colors provide perceptually uniform light/dark palettes with a single set of lightness steps.
