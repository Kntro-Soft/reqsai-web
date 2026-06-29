import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../features/workspace/data/workspace.store';
import { OrganizationResponse } from '../../../features/workspace/data/workspace.models';

/**
 * Header organization switcher: a dropdown listing the user's organizations
 * (active one checked) plus a "create organization" action. Replaces a native
 * select so the create affordance and check state read clearly. Closes on
 * outside click or Escape.
 */
@Component({
  selector: 'app-org-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-expanded]="open()"
        aria-haspopup="menu"
        aria-label="Cambiar organización"
        data-testid="org-switcher"
        class="flex items-center gap-2 rounded-lg border border-border bg-secondary/60 py-1.5 pl-2.5 pr-2 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          class="shrink-0 text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01" />
        </svg>
        <span class="max-w-[9rem] truncate">{{ activeName() }}</span>
        <svg
          class="shrink-0 text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
        </svg>
      </button>

      @if (open()) {
        <div class="fixed inset-0 z-40" aria-hidden="true" (click)="close()"></div>
        <div
          role="menu"
          class="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          <p class="px-3 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Organizaciones</p>
          @for (org of workspace.organizations(); track org.id) {
            <button
              role="menuitemradio"
              type="button"
              data-testid="org-option"
              [attr.aria-checked]="org.id === store.organizationId()"
              (click)="select(org)"
              class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span class="truncate">{{ org.name }}</span>
              @if (org.id === store.organizationId()) {
                <svg
                  class="shrink-0 text-primary"
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              }
            </button>
          }
          <div class="my-1 h-px bg-border"></div>
          <button
            type="button"
            data-testid="create-org"
            (click)="create()"
            class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            Crear organización
          </button>
        </div>
      }
    </div>
  `,
})
export class OrgSwitcher {
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly open = signal(false);
  protected readonly activeName = computed(() => {
    const id = this.store.organizationId();
    return this.workspace.organizations().find((o) => o.id === id)?.name ?? 'Organización';
  });

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected select(org: OrganizationResponse): void {
    this.close();
    if (org.id === this.store.organizationId()) return;
    this.auth.switchOrganization(org.id).subscribe(() => {
      this.workspace.loadProjects(org.id);
      void this.router.navigate(['/projects']);
    });
  }

  protected create(): void {
    this.close();
    void this.router.navigate(['/onboarding']);
  }
}
