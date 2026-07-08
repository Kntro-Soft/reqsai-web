import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideCircle, lucidePause, lucidePlay, lucideSquare } from '@ng-icons/lucide';
import { AudioRecorderService } from '../../../../core/audio/audio-recorder.service';
import { SessionRecordingService } from '../../data/session-recording.service';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import { ActiveParticipants } from '../active-participants/active-participants';
import { HlmButton, HlmIcon } from '../../../../shared/ui';

/** Formats elapsed milliseconds as m:ss / h:mm:ss. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = minutes.toString().padStart(hours > 0 ? 2 : 1, '0');
  const ss = seconds.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * The persistent session bar shown while a recording is live: status pulse,
 * elapsed timer, a real input-level meter (AnalyserNode-driven) and
 * pause/resume/stop controls. State lives in {@link SessionRecordingService},
 * so the bar renders the truth from anywhere in the app.
 */
@Component({
  selector: 'app-session-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon, TranslocoPipe, ActiveParticipants],
  viewProviders: [provideIcons({ lucideCircle, lucidePause, lucidePlay, lucideSquare })],
  template: `
    @if (recording.session(); as session) {
      <div
        class="flex items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:gap-3 sm:px-4 sm:py-2.5"
        data-testid="session-bar"
      >
        <span
          class="relative flex h-2.5 w-2.5 shrink-0"
          [attr.title]="
            (recording.status() === 'RECORDING' ? 'discovery.bar.recording' : 'discovery.bar.paused')
              | transloco
          "
        >
          @if (recording.status() === 'RECORDING') {
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60 motion-reduce:animate-none"
            ></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive"></span>
          } @else {
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
          }
        </span>

        <!-- Status label: hidden on mobile to keep the bar compact — the pulse
             color above already conveys recording (red) vs. paused (amber). -->
        <span class="hidden text-sm font-medium sm:inline" data-testid="session-bar-status">
          {{
            (recording.status() === 'RECORDING'
              ? 'discovery.bar.recording'
              : 'discovery.bar.paused'
            ) | transloco
          }}
        </span>

        <span
          class="font-mono text-sm tabular-nums text-muted-foreground"
          data-testid="session-bar-timer"
        >
          {{ elapsed() }}
        </span>

        <!-- Real input level meter; hidden when the mic is not streaming here. -->
        @if (recorder.levels().length > 0) {
          <div class="flex h-6 flex-1 items-center justify-center gap-[3px]" aria-hidden="true">
            @for (level of recorder.levels(); track $index) {
              <span
                class="w-[3px] rounded-full bg-primary transition-[height] duration-100"
                [style.height.px]="4 + level * 18"
              ></span>
            }
          </div>
        } @else {
          <div class="flex-1"></div>
        }

        <!-- Who else is viewing this live session. -->
        @if (store.activeParticipants(); as participants) {
          @if (participants.length > 0) {
            <app-active-participants [participants]="participants" [size]="24" class="mr-1" />
          }
        }

        @if (recording.status() === 'RECORDING') {
          <button
            hlmBtn
            size="sm"
            variant="secondary"
            type="button"
            class="gap-0 px-2 sm:gap-2 sm:px-3"
            [disabled]="recording.busy()"
            (click)="pauseSession.emit()"
            [attr.aria-label]="'discovery.bar.pause' | transloco"
            [title]="'discovery.bar.pause' | transloco"
            data-testid="session-bar-pause"
          >
            <hlm-icon name="lucidePause" size="14px" />
            <span class="hidden sm:inline">{{ 'discovery.bar.pause' | transloco }}</span>
          </button>
        } @else {
          <button
            hlmBtn
            size="sm"
            type="button"
            class="gap-0 px-2 sm:gap-2 sm:px-3"
            [disabled]="recording.busy()"
            (click)="resumeSession.emit()"
            [attr.aria-label]="'discovery.bar.resume' | transloco"
            [title]="'discovery.bar.resume' | transloco"
            data-testid="session-bar-resume"
          >
            <hlm-icon name="lucidePlay" size="14px" />
            <span class="hidden sm:inline">{{ 'discovery.bar.resume' | transloco }}</span>
          </button>
        }
        <button
          hlmBtn
          size="sm"
          variant="destructive"
          type="button"
          class="gap-0 px-2 sm:gap-2 sm:px-3"
          [disabled]="recording.busy()"
          (click)="stopSession.emit()"
          [attr.aria-label]="'discovery.bar.stop' | transloco"
          [title]="'discovery.bar.stop' | transloco"
          data-testid="session-bar-stop"
        >
          <hlm-icon name="lucideSquare" size="14px" />
          <span class="hidden sm:inline">{{ 'discovery.bar.stop' | transloco }}</span>
        </button>
      </div>
    }
  `,
})
export class SessionBar {
  protected readonly recording = inject(SessionRecordingService);
  protected readonly recorder = inject(AudioRecorderService);
  protected readonly store = inject(DiscoveryChatStore);

  readonly pauseSession = output<void>();
  readonly resumeSession = output<void>();
  readonly stopSession = output<void>();

  protected readonly elapsed = computed(() => formatElapsed(this.recording.elapsedMs()));
}
