import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideMic, lucideMonitorSpeaker } from '@ng-icons/lucide';
import { AudioSource } from '../../../../core/audio/audio-source';
import { HlmIcon } from '../../../../shared/ui';

interface SourceOption {
  value: AudioSource;
  icon: string;
  label: string;
}

/**
 * Compact segmented control next to the record button: where the next
 * recording takes its audio from — the microphone (in person) or the
 * microphone plus the meeting's audio (virtual call). Two-way bound via
 * `[(value)]`. Where the browser cannot capture meeting audio the virtual
 * option stays visible but inert, with the reason as its tooltip; tapping it
 * emits `unavailablePicked` so touch users get the reason too.
 */
@Component({
  selector: 'app-audio-source-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideMic, lucideMonitorSpeaker })],
  template: `
    <div
      role="group"
      [attr.aria-label]="'discovery.source.label' | transloco"
      class="flex h-11 items-center gap-0.5 rounded-full border border-border p-1"
      data-testid="audio-source"
    >
      @for (opt of options; track opt.value) {
        @let unavailable = opt.value === 'meeting' && !meetingSupported();
        <button
          type="button"
          (click)="choose(opt.value)"
          [attr.aria-pressed]="value() === opt.value"
          [attr.aria-disabled]="disabled() || unavailable"
          [attr.aria-label]="opt.label | transloco"
          [title]="(unavailable ? 'discovery.source.unsupported' : opt.label) | transloco"
          class="grid h-full w-9 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          [class]="optionClass(opt.value, unavailable)"
          [attr.data-testid]="'audio-source-' + opt.value"
        >
          <hlm-icon [name]="opt.icon" size="17px" />
        </button>
      }
    </div>
  `,
})
export class AudioSourcePicker {
  readonly value = model<AudioSource>('mic');
  /** False where the browser cannot capture meeting audio (the virtual option goes inert). */
  readonly meetingSupported = input(true);
  /** Locks the choice (e.g. while a session is live). */
  readonly disabled = input(false);
  readonly unavailablePicked = output<void>();

  protected readonly options: SourceOption[] = [
    { value: 'mic', icon: 'lucideMic', label: 'discovery.source.mic' },
    { value: 'meeting', icon: 'lucideMonitorSpeaker', label: 'discovery.source.meeting' },
  ];

  protected choose(source: AudioSource): void {
    if (this.disabled()) return;
    if (source === 'meeting' && !this.meetingSupported()) {
      this.unavailablePicked.emit();
      return;
    }
    this.value.set(source);
  }

  protected optionClass(source: AudioSource, unavailable: boolean): string {
    if (this.disabled() || unavailable) {
      return this.value() === source
        ? 'cursor-not-allowed bg-secondary text-foreground opacity-60'
        : 'cursor-not-allowed text-muted-foreground opacity-50';
    }
    return this.value() === source
      ? 'cursor-pointer bg-secondary text-foreground'
      : 'cursor-pointer text-muted-foreground hover:text-foreground';
  }
}
