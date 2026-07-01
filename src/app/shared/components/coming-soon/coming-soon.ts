import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideConstruction } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmIcon } from '../../ui';

/** Centered muted "coming soon" placeholder for stub sections (billing, integrations,
 * usage, notifications, tokens, danger). Each caller can override the heading via
 * `[titleKey]` and the illustration via `[icon]`; both fall back to generic defaults. */
@Component({
  selector: 'app-coming-soon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideConstruction })],
  template: `
    <div
      class="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center"
      data-testid="coming-soon"
    >
      <span
        class="grid h-12 w-12 place-items-center rounded-xl border border-border bg-secondary/40 text-muted-foreground"
      >
        <hlm-icon [name]="icon()" size="22px" />
      </span>
      <h1 class="text-lg font-semibold">{{ titleKey() | transloco }}</h1>
      <p class="text-sm text-muted-foreground">{{ 'comingSoon.subtitle' | transloco }}</p>
    </div>
  `,
})
export class ComingSoon {
  /** i18n key for the heading; defaults to a generic "Coming soon". */
  readonly titleKey = input('comingSoon.title');
  /** Lucide icon name for the illustration. */
  readonly icon = input('lucideConstruction');
}
