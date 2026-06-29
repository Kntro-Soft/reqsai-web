import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown, lucideLogOut, lucidePlus } from '@ng-icons/lucide';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../features/workspace/data/workspace.store';
import { HlmIcon } from '../../ui';

/**
 * Avatar button that opens a user menu (account, organization switch on phones,
 * sign out). Consolidating these under the user — instead of stray buttons —
 * matches the consistency/standards heuristic. The org list only shows below
 * `sm`, where the header switcher is hidden. Closes on outside click or Escape.
 */
@Component({
  selector: 'app-user-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  imports: [HlmIcon],
  viewProviders: [provideIcons({ lucideChevronDown, lucideCheck, lucidePlus, lucideLogOut })],
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
        <hlm-icon
          name="lucideChevronDown"
          size="14px"
          class="hidden text-muted-foreground transition-transform sm:block"
          [class.rotate-180]="open()"
        />
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

          @if (workspace.organizations().length) {
            <div class="sm:hidden">
              <p class="px-3 pb-1 pt-1 text-xs font-medium text-muted-foreground">Organización</p>
              @for (org of workspace.organizations(); track org.id) {
                <button
                  role="menuitemradio"
                  type="button"
                  [attr.aria-checked]="org.id === store.organizationId()"
                  (click)="switchOrg(org.id)"
                  class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span class="truncate">{{ org.name }}</span>
                  @if (org.id === store.organizationId()) {
                    <hlm-icon name="lucideCheck" size="16px" class="shrink-0 text-primary" />
                  }
                </button>
              }
              <button
                type="button"
                data-testid="create-org-mobile"
                (click)="createOrg()"
                class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <hlm-icon name="lucidePlus" size="16px" />
                Crear organización
              </button>
              <div class="my-1 h-px bg-border"></div>
            </div>
          }

          <button
            role="menuitem"
            type="button"
            data-testid="logout"
            (click)="logout()"
            class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <hlm-icon name="lucideLogOut" size="16px" />
            Cerrar sesión
          </button>
        </div>
      }
    </div>
  `,
})
export class UserMenu {
  protected readonly store = inject(AuthStore);
  protected readonly workspace = inject(WorkspaceStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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

  protected switchOrg(orgId: string): void {
    this.close();
    if (orgId === this.store.organizationId()) return;
    this.auth.switchOrganization(orgId).subscribe(() => {
      this.workspace.loadProjects(orgId);
      void this.router.navigate(['/projects']);
    });
  }

  protected createOrg(): void {
    this.close();
    void this.router.navigate(['/onboarding']);
  }

  protected logout(): void {
    this.close();
    this.auth.logout();
  }
}
