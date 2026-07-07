# 0014. Icon library: @ng-icons + Lucide via a vendored HlmIcon

- Status: Accepted
- Date: 2026-06-29
- Deciders: Kntro-Soft team

## Context

Icons were hand-pasted as inline `<svg>` paths inside component templates (and a `NavIcon`
component that switched over hard-coded paths). This does not scale: adding an icon meant copying
`<path>` data by hand, there were no size/variant primitives, and the same glyph was duplicated
across files. We need a maintainable icon system that keeps the existing **Lucide** look (the
hand-rolled icons were already Lucide-style) and fits our Spartan UI + Tailwind v4 stack
(see [ADR-0004](0004-spartan-ui-tailwind-v4.md)).

Options considered:

- **`@ng-icons` + `@ng-icons/lucide`** — Angular-native, multi-set (Lucide, Heroicons, Tabler, …),
  tree-shakeable (only registered icons ship), and the **documented pairing for Spartan's
  `hlm-icon`** (`provideIcons` API). Standalone-friendly (`provideIcons` v18+).
- **`lucide-angular` / `@lucide/angular`** — official Lucide, standalone/signal-based, but Lucide-only
  and not the Spartan `hlm-icon` integration path.
- **Angular Material `mat-icon`** — Material aesthetic (not Lucide), pulls in `@angular/material`,
  clashes with Tailwind/Spartan styling.
- **Iconify / Hugeicons** — huge sets but extra runtime/registry, not Spartan-native.
- **Status quo (hand-rolled inline SVG)** — zero deps, but unmaintainable and no primitives.

## Decision

Adopt **`@ng-icons/core` + `@ng-icons/lucide`**, wrapped in a vendored **`HlmIcon`**
(`src/app/shared/ui/icon/`) — a small, `OnPush`, signals-based component that renders `NgIcon` with
`cn`-based classes and inherits `currentColor`, mirroring the in-repo helm pattern from
[ADR-0004](0004-spartan-ui-tailwind-v4.md). Usage: `<hlm-icon name="lucideFolder" size="18px" />`.

Icons are registered **per component** with `provideIcons({ lucideFolder, … })` (tree-shaken —
only referenced icons are bundled). `NavIcon` is kept as a thin **semantic** wrapper that maps app
names to Lucide icons (`projects → lucideFolder`, `sessions → lucideMic`, …) so call sites and the
shells are unchanged.

Deliberately **kept as bespoke inline SVG** (not library glyphs): the recorder's **filled**
record/stop/play media-control buttons and `hlm-spinner`, because Lucide's equivalents are
outline-only and would change those intentional filled visuals.

## Consequences

- Adding an icon is now `import { lucideX } from '@ng-icons/lucide'` + register it — no hand-pasted
  `<path>` data; the net change removed ~240 lines of inline SVG.
- Tree-shaking keeps the bundle lean despite the large catalog (only registered icons ship).
- Adds two dependencies (`@ng-icons/core`, `@ng-icons/lucide`); upstream Lucide updates arrive via
  the package instead of manual path copying.
- Establishes a convention: presentational icons go through `HlmIcon` + `provideIcons`; bespoke
  media/animation visuals stay as inline SVG.
- Future needs can pull from other `@ng-icons` sets (Heroicons, Tabler) without switching libraries.
- `HlmIcon` being in-repo (like helm components) adds light maintenance responsibility.
