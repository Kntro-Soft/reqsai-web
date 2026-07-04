import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
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
      #triggerBtn
      (click)="toggle()"
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
      [cdkConnectedOverlayWidth]="triggerWidth()"
      (attach)="onAttach()"
      (overlayOutsideClick)="open.set(false)"
      (overlayKeydown)="onKeydown($event)"
      (detach)="open.set(false)"
    >
      <div
        role="listbox"
        class="w-full overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
      >
        @if (searchable()) {
          <div class="mb-1 px-0.5">
            <input
              #filterInput
              type="text"
              [value]="filter()"
              (input)="filter.set($any($event.target).value)"
              [placeholder]="searchPlaceholder()"
              class="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground"
              autocomplete="off"
              spellcheck="false"
              data-testid="select-filter"
            />
          </div>
        }
        <div class="max-h-60 overflow-y-auto">
          @for (opt of visibleOptions(); track opt.value) {
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
          @if (visibleOptions().length === 0) {
            <p class="px-2.5 py-2 text-center text-xs text-muted-foreground">{{ emptyText() }}</p>
          }
        </div>
      </div>
    </ng-template>
  `,
})
export class Select {
  readonly options = input<SelectOption[]>([]);
  readonly value = model<string>('');
  readonly ariaLabel = input<string>('');
  readonly size = input<'sm' | 'md'>('md');
  /** Show a filter box inside the dropdown that narrows the options by label or code. */
  readonly searchable = input(false);
  readonly searchPlaceholder = input('Search…');
  readonly emptyText = input('No results');

  private readonly triggerBtn = viewChild<ElementRef<HTMLButtonElement>>('triggerBtn');
  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  protected readonly open = signal(false);
  protected readonly positions = BELOW_START;
  /** Overlay panel width, synced to the trigger so the option list matches the select's width. */
  protected readonly triggerWidth = signal(0);
  protected readonly filter = signal('');
  protected readonly selectedLabel = computed(
    () => this.options().find((o) => o.value === this.value())?.label ?? '',
  );
  /** Options after the optional filter, matched on label or code. */
  protected readonly visibleOptions = computed(() => {
    const q = this.filter().trim().toLowerCase();
    if (!this.searchable() || !q) return this.options();
    return this.options().filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  });

  /** Measure the trigger before opening so the overlay panel adopts its exact width. */
  protected toggle(): void {
    const el = this.triggerBtn()?.nativeElement;
    if (el) this.triggerWidth.set(el.offsetWidth);
    const opening = !this.open();
    if (opening) this.filter.set('');
    this.open.set(opening);
  }

  /** Focus the filter box when a searchable dropdown opens. */
  protected onAttach(): void {
    if (!this.searchable()) return;
    setTimeout(() => this.filterInput()?.nativeElement.focus(), 0);
  }

  protected choose(value: string): void {
    this.value.set(value);
    this.open.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.open.set(false);
  }
}
