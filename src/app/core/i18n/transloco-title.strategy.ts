import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Sets the document title from a translation key declared on the route's
 * `title`. Renders as `<page> · <app>` and re-translates on language change so
 * the browser tab follows the active language.
 */
@Injectable({ providedIn: 'root' })
export class TranslocoTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private currentKey: string | null = null;

  constructor() {
    super();
    this.transloco.langChanges$.subscribe(() => this.apply());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.currentKey = this.buildTitle(snapshot) ?? null;
    this.apply();
  }

  private apply(): void {
    const lang = this.transloco.getActiveLang();
    if (!lang) return;

    try {
      const translation = this.transloco.getTranslation(lang);
      if (!translation || Object.keys(translation).length === 0) {
        return;
      }
    } catch {
      return;
    }

    const app = this.transloco.translate<string>('app.title');
    if (app === 'app.title') {
      return;
    }

    const pageTitle = this.currentKey ? this.transloco.translate<string>(this.currentKey) : null;
    this.title.setTitle(pageTitle && pageTitle !== this.currentKey ? `${pageTitle} · ${app}` : app);
  }
}
