import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { OverlayModule } from '@angular/cdk/overlay';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideMic, lucideMonitorSpeaker } from '@ng-icons/lucide';
import { AudioSource } from '../../../../core/audio/audio-source';
import { MenuKeys } from '../../../../shared/components/popover/menu-keys';
import { ABOVE_END } from '../../../../shared/components/popover/popover-positions';
import { HlmIcon } from '../../../../shared/ui';

interface SourceOption {
  value: AudioSource;
  icon: string;
  /** Full description: the accessible name and tooltip. */
  label: string;
  /** Short visible name. */
  short: string;
  /** One line saying what is captured. */
  hint: string;
}

/**
 * Where the next recording takes its audio from, as one round icon button next to the record
 * button: a microphone for "In person", a monitor for "Virtual meeting" (microphone plus the
 * meeting's audio). It opens a small menu upward to choose, so the composer pays for one circle
 * instead of a two-option switch. `[(value)]` carries the choice and `[(open)]` lets the page
 * open the menu itself, e.g. to ask before the first recording. Where the browser cannot capture
 * meeting audio the virtual option stays listed but inert, with the reason beneath it; choosing
 * it emits `unavailablePicked` so touch users get the reason too.
 */
@Component({
  selector: 'app-audio-source-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule, HlmIcon, TranslocoPipe, MenuKeys],
  viewProviders: [provideIcons({ lucideCheck, lucideMic, lucideMonitorSpeaker })],
  host: { class: 'block shrink-0' },
  template: `
    <button
      #trigger
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (click)="toggle()"
      [disabled]="disabled()"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="
        ('discovery.source.label' | transloco) + ': ' + (current().short | transloco)
      "
      [title]="('discovery.source.label' | transloco) + ': ' + (current().short | transloco)"
      class="grid h-11 w-11 place-items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      [class]="
        current().value === 'meeting'
          ? 'bg-accent text-accent-foreground ring-1 ring-inset ring-primary/25'
          : 'bg-card text-foreground hover:bg-secondary/70'
      "
      data-testid="audio-source-trigger"
    >
      <hlm-icon [name]="current().icon" size="18px" aria-hidden="true" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      (overlayOutsideClick)="close(false)"
      (detach)="close(false)"
    >
      <div
        role="menu"
        appMenuKeys
        (dismiss)="close(true)"
        [attr.aria-label]="'discovery.source.label' | transloco"
        class="source-menu w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        data-testid="audio-source"
      >
        @if (asking()) {
          <p class="px-2.5 pt-2 pb-1 text-sm font-medium" data-testid="audio-source-ask">
            {{ 'discovery.source.ask' | transloco }}
          </p>
        }
        @for (opt of options; track opt.value) {
          @let unavailable = opt.value === 'meeting' && !meetingSupported();
          <button
            type="button"
            role="menuitemradio"
            (click)="choose(opt.value)"
            [attr.aria-checked]="value() === opt.value"
            [attr.aria-disabled]="unavailable"
            [attr.aria-label]="opt.label | transloco"
            class="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none"
            [class]="
              unavailable
                ? 'cursor-not-allowed opacity-60 focus-visible:bg-accent'
                : 'hover:bg-accent focus-visible:bg-accent'
            "
            [attr.data-testid]="'audio-source-' + opt.value"
          >
            <hlm-icon [name]="opt.icon" size="18px" class="mt-0.5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium">{{ opt.short | transloco }}</span>
              <span class="block text-xs leading-snug text-muted-foreground">{{
                (unavailable ? 'discovery.source.unsupported' : opt.hint) | transloco
              }}</span>
            </span>
            @if (value() === opt.value) {
              <hlm-icon name="lucideCheck" size="16px" class="mt-0.5 shrink-0 text-primary" />
            }
          </button>
        }
      </div>
    </ng-template>
  `,
  styles: `
    @media (prefers-reduced-motion: no-preference) {
      .source-menu {
        transform-origin: bottom right;
        animation: source-menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
      }
    }
    @keyframes source-menu-in {
      from {
        opacity: 0;
        transform: translateY(4px) scale(0.97);
      }
    }
  `,
})
export class AudioSourcePicker {
  readonly value = model<AudioSource>('mic');
  /** Whether the menu is open; two-way so the page can open it (e.g. before a first recording). */
  readonly open = model(false);
  /** False where the browser cannot capture meeting audio (the virtual option goes inert). */
  readonly meetingSupported = input(true);
  /** Locks the choice (e.g. while a session is live). */
  readonly disabled = input(false);
  /** The menu was opened to answer "where does the audio come from?" before recording. */
  readonly asking = input(false);
  /** Emits every source the user picks from the menu (also when it equals the current one). */
  readonly picked = output<AudioSource>();
  readonly unavailablePicked = output<void>();

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly positions = ABOVE_END;
  protected readonly options: SourceOption[] = [
    {
      value: 'mic',
      icon: 'lucideMic',
      label: 'discovery.source.mic',
      short: 'discovery.source.micShort',
      hint: 'discovery.source.micHint',
    },
    {
      value: 'meeting',
      icon: 'lucideMonitorSpeaker',
      label: 'discovery.source.meeting',
      short: 'discovery.source.meetingShort',
      hint: 'discovery.source.meetingHint',
    },
  ];
  protected readonly current = computed(
    () => this.options.find((o) => o.value === this.value()) ?? this.options[0],
  );

  protected toggle(): void {
    if (this.disabled()) return;
    this.open.update((v) => !v);
  }

  /** Closes the menu; keyboard and selection hand focus back to the trigger. */
  protected close(restoreFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.trigger()?.nativeElement.focus();
  }

  protected choose(source: AudioSource): void {
    if (this.disabled()) return;
    if (source === 'meeting' && !this.meetingSupported()) {
      this.unavailablePicked.emit();
      this.close(true);
      return;
    }
    this.value.set(source);
    this.picked.emit(source);
    this.close(true);
  }
}
