import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';
import { DiscoverySessionResponse } from '../../data/discovery.models';
import { HlmIcon } from '../../../../shared/ui';

/**
 * Tells that a session's recording was deleted by the organization's audio retention policy (US69),
 * where a player or download would otherwise be offered. Renders nothing for any other audio state; the
 * session's transcript and stories are unaffected by the deletion.
 */
@Component({
  selector: 'app-audio-purged-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, HlmIcon],
  viewProviders: [provideIcons({ lucideTrash2 })],
  template: `
    @if (session().audioState === 'PURGED') {
      <span
        class="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
        [attr.title]="'discovery.audio.purgedHint' | transloco"
        data-testid="audio-purged-notice"
      >
        <hlm-icon name="lucideTrash2" size="12px" aria-hidden="true" />
        {{ 'discovery.audio.purged' | transloco }}
        <span class="sr-only">{{ 'discovery.audio.purgedHint' | transloco }}</span>
      </span>
    }
  `,
})
export class AudioPurgedNotice {
  readonly session = input.required<Pick<DiscoverySessionResponse, 'audioState'>>();
}
