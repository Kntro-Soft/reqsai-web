import { Injectable, computed, effect, signal } from '@angular/core';

/** The user's explicit choice. `system` follows the OS `prefers-color-scheme`. */
export type ThemeMode = 'system' | 'light' | 'dark';
/** The theme actually applied after resolving `system`. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * Owns the theme. Toggles the `dark` class on <html> (the CSS in styles.css keys off
 * `:root.dark .theme-reqsai`) and persists the choice.
 *
 * Three modes: `system` (default — follows the OS and reacts live to changes), `light` and `dark`.
 * Picking `system` clears the stored preference; an explicit `light`/`dark` is persisted.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  private readonly _mode = signal<ThemeMode>(this.resolveInitialMode());
  // Mirrors the OS preference so a `system` choice reacts to live changes.
  private readonly _systemDark = signal(this.media.matches);

  /** The user's chosen mode (`system` | `light` | `dark`). */
  readonly mode = this._mode.asReadonly();

  /** The theme actually applied, after resolving `system` against the OS. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this._mode();
    if (mode === 'system') return this._systemDark() ? 'dark' : 'light';
    return mode;
  });

  constructor() {
    this.media.addEventListener('change', (e) => this._systemDark.set(e.matches));

    effect(() => {
      document.documentElement.classList.toggle('dark', this.resolved() === 'dark');
    });
    effect(() => {
      const mode = this._mode();
      if (mode === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, mode);
    });
  }

  /** Sets an explicit choice (used by the user menu's system/light/dark control). */
  set(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  /** Cycles light → dark → system, for a simple icon button. */
  toggle(): void {
    this._mode.update((m) => (m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light'));
  }

  private resolveInitialMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  }
}
