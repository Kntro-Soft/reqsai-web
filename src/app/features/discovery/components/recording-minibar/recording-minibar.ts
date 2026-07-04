import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideMic } from '@ng-icons/lucide';
import { SessionRecordingService } from '../../data/session-recording.service';
import { formatElapsed } from '../session-bar/session-bar';
import { HlmIcon } from '../../../../shared/ui';

/**
 * Floating mini recording indicator shown anywhere in the app while a session
 * is live, except on the discovery chat itself (which shows the full bar).
 * Clicking it jumps back to the recording project's discovery chat.
 */
@Component({
  selector: 'app-recording-minibar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideMic })],
  template: `
    @if (visible()) {
      <a
        [routerLink]="['/projects', recording.session()!.projectId, 'sessions']"
        class="fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-full border border-border bg-card/95 py-2 pl-3 pr-4 shadow-xl backdrop-blur transition-colors hover:border-primary/40"
        data-testid="recording-minibar"
      >
        <span class="relative flex h-2.5 w-2.5">
          @if (recording.status() === 'RECORDING') {
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60 motion-reduce:animate-none"
            ></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive"></span>
          } @else {
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
          }
        </span>
        <hlm-icon name="lucideMic" size="15px" class="text-muted-foreground" />
        <span class="text-sm font-medium">
          {{
            (recording.status() === 'RECORDING'
              ? 'discovery.bar.recording'
              : 'discovery.bar.paused'
            ) | transloco
          }}
        </span>
        <span class="font-mono text-sm tabular-nums text-muted-foreground">{{ elapsed() }}</span>
      </a>
    }
  `,
})
export class RecordingMinibar {
  protected readonly recording = inject(SessionRecordingService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Hidden on the recording project's own discovery chat (full bar lives there). */
  protected readonly visible = computed(() => {
    const session = this.recording.session();
    if (!session || !this.recording.isActive()) return false;
    const chatUrl = `/projects/${session.projectId}/sessions`;
    const url = this.url().split('?')[0];
    return url !== chatUrl;
  });

  protected readonly elapsed = computed(() => formatElapsed(this.recording.elapsedMs()));
}
