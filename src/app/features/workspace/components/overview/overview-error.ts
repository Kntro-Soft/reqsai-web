import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmButton, HlmIcon } from '../../../../shared/ui';

/** The overview could not be loaded: says so and offers to try again. */
@Component({
  selector: 'app-overview-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideCircleAlert })],
  template: `
    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm"
      role="alert"
      data-testid="overview-error"
    >
      <div class="flex items-start gap-3">
        <hlm-icon name="lucideCircleAlert" size="18px" class="mt-0.5 shrink-0 text-destructive" />
        <p class="text-muted-foreground"><ng-content /></p>
      </div>
      <button hlmBtn size="sm" variant="outline" type="button" (click)="retry.emit()">
        {{ 'overview.retry' | transloco }}
      </button>
    </div>
  `,
})
export class OverviewError {
  readonly retry = output<void>();
}
