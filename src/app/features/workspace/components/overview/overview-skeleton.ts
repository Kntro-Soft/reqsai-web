import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmSkeleton } from '../../../../shared/ui';

/** Placeholder shaped like a dashboard (a KPI row and four charts) while the figures load. */
@Component({
  selector: 'app-overview-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmSkeleton],
  template: `
    <div class="flex flex-col gap-6" data-testid="overview-skeleton" aria-hidden="true">
      <hlm-skeleton class="h-24 rounded-2xl" />
      <div class="grid gap-4 lg:grid-cols-2">
        <hlm-skeleton class="h-64 rounded-2xl" />
        <hlm-skeleton class="h-64 rounded-2xl" />
        <hlm-skeleton class="h-56 rounded-2xl" />
        <hlm-skeleton class="h-56 rounded-2xl" />
      </div>
    </div>
  `,
})
export class OverviewSkeleton {}
