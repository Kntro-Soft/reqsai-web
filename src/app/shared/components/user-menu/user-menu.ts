import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';

/**
 * Avatar button that opens a user menu (account + sign out). Consolidating the
 * sign-out action under the user — instead of a stray button — matches the
 * consistency/standards heuristic. Closes on outside click or Escape.
 */
@Component({
  selector: 'app-user-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-expanded]="open()"
        aria-haspopup="menu"
        aria-label="Menú de usuario"
        class="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          class="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
        >
          {{ initials() }}
        </span>
        <span class="hidden max-w-[10rem] truncate text-sm text-muted-foreground sm:inline">
          {{ store.user()?.fullName }}
        </span>
        <svg
          class="hidden text-muted-foreground transition-transform sm:block"
          [class.rotate-180]="open()"
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      @if (open()) {
        <div class="fixed inset-0 z-40" aria-hidden="true" (click)="close()"></div>
        <div
          role="menu"
          class="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          <div class="flex items-center gap-3 px-3 py-2.5">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
            >
              {{ initials() }}
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ store.user()?.fullName }}</p>
              <p class="truncate text-xs text-muted-foreground">Cuenta personal</p>
            </div>
          </div>
          <div class="my-1 h-px bg-border"></div>
          <button
            role="menuitem"
            type="button"
            data-testid="logout"
            (click)="logout()"
            class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      }
    </div>
  `,
})
export class UserMenu {
  protected readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);

  protected readonly open = signal(false);
  protected readonly initials = computed(() => {
    const user = this.store.user();
    if (!user) return '';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  });

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected logout(): void {
    this.close();
    this.auth.logout();
  }
}
