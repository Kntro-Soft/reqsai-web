import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown } from '@ng-icons/lucide';
import { HlmIcon } from '../../ui';

export interface SelectOption {
  value: string;
  label: string;
}

const BELOW_START: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
];

/** Styled single-select (CDK overlay) — a trigger pill that opens a themed option list, instead of
 * the native `<select>`. Two-way bound via `[(value)]`. */
@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule, HlmIcon],
  viewProviders: [provideIcons({ lucideCheck, lucideChevronDown })],
  template: `
    <button
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (click)="open.set(!open())"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel()"
      aria-haspopup="listbox"
      class="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      [class]="size() === 'sm' ? 'h-8 min-w-[7rem]' : 'h-10 min-w-[9rem]'"
    >
      <span class="truncate">{{ selectedLabel() }}</span>
      <hlm-icon name="lucideChevronDown" size="14px" class="shrink-0 text-muted-foreground" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      (overlayOutsideClick)="open.set(false)"
      (overlayKeydown)="onKeydown($event)"
      (detach)="open.set(false)"
    >
      <div
        role="listbox"
        class="min-w-[8rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
      >
        @for (opt of options(); track opt.value) {
          <button
            role="option"
            type="button"
            [attr.aria-selected]="opt.value === value()"
            (click)="choose(opt.value)"
            class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent"
          >
            {{ opt.label }}
            @if (opt.value === value()) {
              <hlm-icon name="lucideCheck" size="15px" class="text-primary" />
            }
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class Select {
  readonly options = input<SelectOption[]>([]);
  readonly value = model<string>('');
  readonly ariaLabel = input<string>('');
  readonly size = input<'sm' | 'md'>('md');

  protected readonly open = signal(false);
  protected readonly positions = BELOW_START;
  protected readonly selectedLabel = computed(
    () => this.options().find((o) => o.value === this.value())?.label ?? '',
  );

  protected choose(value: string): void {
    this.value.set(value);
    this.open.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.open.set(false);
  }
}
