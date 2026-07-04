import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * Exposes the active page's title key (the deepest activated route's `title`)
 * as a signal, so the shell top bar can render the current page name and
 * re-translate it on language change. The browser tab title is handled
 * separately by {@link TranslocoTitleStrategy}.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleService {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Translation key of the current page (e.g. `titles.sessions`), or null. */
  readonly titleKey = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.deepestTitle()),
    ),
    { initialValue: this.deepestTitle() },
  );

  private deepestTitle(): string | null {
    let snapshot = this.route.snapshot;
    while (snapshot.firstChild) snapshot = snapshot.firstChild;
    return snapshot.title ?? null;
  }
}
