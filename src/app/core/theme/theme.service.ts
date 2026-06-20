import { Injectable, signal, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * Owns the light/dark theme. Toggles the `dark` class on <html> (the CSS in
 * styles.css keys off `:root.dark .theme-reqsai`) and persists the choice.
 *
 * Dark is the default per product decision (see ADR-0013): if the user has no
 * stored preference, we fall back to their OS setting, defaulting to dark.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(this.resolveInitialMode());

  readonly mode = this._mode.asReadonly();

  constructor() {
    effect(() => {
      const mode = this._mode();
      document.documentElement.classList.toggle('dark', mode === 'dark');
      localStorage.setItem(STORAGE_KEY, mode);
    });
  }

  toggle(): void {
    this._mode.update((m) => (m === 'dark' ? 'light' : 'dark'));
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  private resolveInitialMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') return stored;
    // Dark-first by product decision (see DESIGN.md): ignore the OS preference
    // so the brand's navy/red surface is what new visitors see.
    return 'dark';
  }
}
