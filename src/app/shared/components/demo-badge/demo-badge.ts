import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmBadge } from '../../ui';

/**
 * Small "Demo" pill marking the organization's demo project (sample content every new organization
 * receives) wherever a project is named: the projects list, the project switcher and the overview.
 */
@Component({
  selector: 'app-demo-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadge, TranslocoPipe],
  template: `
    <span
      hlmBadge
      variant="warning"
      class="shrink-0 px-2 py-0 text-[11px] leading-5"
      [attr.title]="'demo.badgeTitle' | transloco"
      data-testid="demo-badge"
      >{{ 'demo.badge' | transloco }}</span
    >
  `,
})
export class DemoBadge {}
