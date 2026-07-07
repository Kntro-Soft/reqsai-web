import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmSpinner } from '../../../../shared/ui';

/**
 * Transient landing while {@link launchGuard} decides where to send the user
 * (onboarding / workspace / org picker). The guard resolves to a redirect, so
 * this only flashes on a slow network.
 */
@Component({
  selector: 'app-launcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmSpinner],
  template: `
    <div class="grid min-h-dvh place-items-center bg-background text-foreground">
      <hlm-spinner class="h-6 w-6" />
    </div>
  `,
})
export class Launcher {}
