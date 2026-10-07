import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCircle,
  lucideMonitorSpeaker,
  lucidePause,
  lucidePlay,
  lucideScreenShare,
  lucideSquare,
} from '@ng-icons/lucide';
import { AudioRecorderService } from '../../../../core/audio/audio-recorder.service';
import { SessionRecordingService } from '../../data/session-recording.service';
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
 * so the bar renders the truth from anywhere in the app. Virtual-meeting
 * recordings show a meeting-audio badge, or a "share again" action once the
 * user stops sharing (the recording carries on with the mic meanwhile).
 */
@Component({
  selector: 'app-session-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon, TranslocoPipe],
  viewProviders: [
    provideIcons({
      lucideCircle,
      lucideMonitorSpeaker,
      lucidePause,
      lucidePlay,
      lucideScreenShare,
      lucideSquare,
    }),
  ],
  template: `
    @if (recording.session(); as session) {
      <div
        class="flex items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:gap-3 sm:px-4 sm:py-2.5"
        data-testid="session-bar"
      >
        <span
          class="relative flex h-2.5 w-2.5 shrink-0"
          [attr.title]="
            (recording.status() === 'RECORDING'
              ? 'discovery.bar.recording'
              : 'discovery.bar.paused'
            ) | transloco
          "
        >
          @if (recording.status() === 'RECORDING') {
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60 motion-reduce:animate-none"
            ></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive"></span>
          } @else {
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-pending"></span>
          }
        </span>

        <!-- Status label: visually hidden on mobile to keep the bar compact (the pulse
             colour shows recording vs. paused) but always announced to screen readers. -->
        <span
          class="sr-only text-sm font-medium sm:not-sr-only"
          aria-live="polite"
          data-testid="session-bar-status"
        >
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

        @if (recorder.source() === 'meeting' && recorder.meetingAudio()) {
          <span
            class="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
            [title]="'discovery.bar.meetingAudio' | transloco"
            data-testid="session-bar-meeting-audio"
          >
            <hlm-icon name="lucideMonitorSpeaker" size="14px" aria-hidden="true" />
            <span class="hidden lg:inline">{{
              'discovery.bar.meetingAudioShort' | transloco
            }}</span>
            <span class="sr-only lg:hidden">{{ 'discovery.bar.meetingAudio' | transloco }}</span>
          </span>
        }

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

        <!-- Sharing stopped mid-session: one click re-opens the picker (needs the
             click's activation, so the recorder is called right from the handler). -->
        @if (recorder.source() === 'meeting' && !recorder.meetingAudio()) {
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            class="gap-0 border-pending-border bg-pending-soft px-2 text-pending hover:bg-pending-soft hover:text-pending sm:gap-2 sm:px-3"
            (click)="reshareMeetingAudio()"
            [attr.aria-label]="'discovery.bar.reshare' | transloco"
            [title]="'discovery.bar.meetingAudioLost' | transloco"
            data-testid="session-bar-reshare"
          >
            <hlm-icon name="lucideScreenShare" size="14px" />
            <span class="hidden sm:inline">{{ 'discovery.bar.reshare' | transloco }}</span>
          </button>
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

  readonly pauseSession = output<void>();
  readonly resumeSession = output<void>();
  readonly stopSession = output<void>();

  protected readonly elapsed = computed(() => formatElapsed(this.recording.elapsedMs()));

  protected reshareMeetingAudio(): void {
    void this.recorder.shareMeetingAudio();
  }
}
