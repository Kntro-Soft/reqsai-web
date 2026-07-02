import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * A centered dialog with a dimmed backdrop, shown via a two-way `[(open)]` model. Mirrors the
 * command-palette overlay pattern (fixed inset-0 z-50 container + a `<button>` backdrop + a centered
 * card with `role="dialog"`), which renders correctly without z-index/stacking pitfalls.
 *
 * Three projection slots: `[modalTitle]` (header), the default slot (body) and `[modalFooter]`
 * (a right-aligned footer row where the caller places Cancel / action buttons). Closes on backdrop
 * click and Escape; focuses the dialog on open. The enter animation is guarded by
 * `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50" data-testid="modal-backdrop">
        <button
          type="button"
          (click)="close()"
          [attr.aria-label]="'common.cancel' | transloco"
          class="absolute inset-0 h-full w-full cursor-default bg-black/50 motion-safe:animate-[modal-fade_120ms_ease-out]"
        ></button>
        <div
          #dialog
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          (keydown)="onKeydown($event)"
          class="fixed left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none motion-safe:animate-[modal-in_140ms_ease-out]"
          data-testid="modal"
        >
          <div class="flex flex-col gap-4 overflow-y-auto p-5">
            <h2 class="text-base font-semibold">
              <ng-content select="[modalTitle]" />
              {{ title() }}
            </h2>
            <div class="text-sm text-muted-foreground">
              <ng-content />
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <ng-content select="[modalFooter]" />
          </div>
        </div>
      </div>
    }

    <style>
      @keyframes modal-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes modal-in {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
    </style>
  `,
})
export class Modal {
  /** Two-way bound visibility. */
  readonly open = model(false);
  /** Optional plain-text title; prefer the `[modalTitle]` projection slot for richer layout. */
  readonly title = input('');

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    // Focus the dialog when it opens so keyboard users land inside it and Esc works immediately.
    effect(() => {
      if (this.open()) {
        queueMicrotask(() => this.dialog()?.nativeElement.focus());
      }
    });
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
}
