import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCircleAlert, lucideInfo, lucideX } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmIcon } from '../ui';
import { Toast, ToastService } from './toast.service';

/**
 * Bottom-right stack of live toasts (see {@link ToastService}). Each is a rounded,
 * bordered popover card built from theme tokens, with a kind-coloured left accent, a
 * leading status icon and a close button. Mounted once in the shell, outside the scroll
 * container, so it floats above everything (`z-[60]`). Announced via `aria-live="polite"`.
 * The enter/leave slide-fade is disabled under `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideCheck, lucideCircleAlert, lucideInfo, lucideX })],
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-end gap-2 p-4 sm:right-0 sm:left-auto sm:max-w-sm"
      aria-live="polite"
      aria-atomic="false"
    >
      @for (toast of toasts(); track toast.id) {
        <div
          role="status"
          class="toast-item card-elev pointer-events-auto flex w-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-popover py-3 pr-2.5 pl-4 text-sm text-popover-foreground shadow-xl"
          data-testid="toast"
        >
          <span
            aria-hidden="true"
            class="absolute inset-y-0 left-0 w-1"
            [class]="accent(toast)"
          ></span>
          <hlm-icon [name]="icon(toast)" size="18px" class="mt-px shrink-0" [class]="tone(toast)" />
          <p class="min-w-0 flex-1 break-words">{{ toast.message }}</p>
          <button
            type="button"
            (click)="toastService.dismiss(toast.id)"
            [attr.aria-label]="'toast.dismiss' | transloco"
            class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <hlm-icon name="lucideX" size="14px" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-item {
        position: relative;
        animation: toast-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateY(0.5rem);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .toast-item {
          animation: none;
        }
      }
    `,
  ],
})
export class ToastHost {
  protected readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  protected icon(toast: Toast): string {
    switch (toast.kind) {
      case 'success':
        return 'lucideCheck';
      case 'error':
        return 'lucideCircleAlert';
      default:
        return 'lucideInfo';
    }
  }

  /** The left accent bar colour. */
  protected accent(toast: Toast): string {
    switch (toast.kind) {
      case 'success':
        return 'bg-emerald-500';
      case 'error':
        return 'bg-destructive';
      default:
        return 'bg-primary';
    }
  }

  /** The icon tint. */
  protected tone(toast: Toast): string {
    switch (toast.kind) {
      case 'success':
        return 'text-emerald-500';
      case 'error':
        return 'text-destructive';
      default:
        return 'text-primary';
    }
  }
}
