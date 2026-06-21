import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { OrganizationResponse } from '../../data/workspace.models';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../../../shared/components/logo/logo';
import { UserMenu } from '../../../../shared/components/user-menu/user-menu';
import { HlmSpinner } from '../../../../shared/ui';

/**
 * Organization picker shown to users in more than one organization (see
 * launchGuard). Picking one activates it and enters its workspace; a final card
 * creates a new organization.
 */
@Component({
  selector: 'app-organizations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ThemeToggle, Logo, UserMenu, HlmSpinner],
  template: `
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <header
        class="sticky top-0 z-10 mx-3 mt-3 flex h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 shadow-sm backdrop-blur md:mx-4 md:mt-4"
      >
        <app-logo [size]="28" />
        <div class="flex items-center gap-1.5">
          <app-theme-toggle />
          <app-user-menu />
        </div>
      </header>

      <main class="flex flex-1 items-center justify-center px-4 py-10">
        <div class="flex w-full max-w-3xl flex-col gap-8">
          <div class="flex flex-col items-center gap-2 text-center">
            <h1 class="text-2xl font-bold tracking-tight md:text-3xl">Elige una organización</h1>
            <p class="text-sm text-muted-foreground">
              Tienes acceso a varias. Selecciona con cuál quieres continuar.
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            @for (org of workspace.organizations(); track org.id) {
              <button
                type="button"
                data-testid="org-card"
                [disabled]="switching() !== null"
                (click)="enter(org)"
                class="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-60"
              >
                <span
                  class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01" />
                  </svg>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate font-semibold">{{ org.name }}</span>
                    @if (org.id === store.organizationId()) {
                      <span
                        class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                      >
                        Actual
                      </span>
                    }
                  </span>
                  <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                    {{ org.slug }} · {{ org.meetingLanguage }}
                  </span>
                </span>
                @if (switching() === org.id) {
                  <hlm-spinner class="h-4 w-4" />
                } @else {
                  <svg
                    class="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                }
              </button>
            }

            <button
              type="button"
              data-testid="create-org"
              [disabled]="switching() !== null"
              (click)="create()"
              class="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-left text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
            >
              <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary/60">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block font-semibold text-foreground">Crear organización</span>
                <span class="mt-0.5 block text-xs">Empieza un nuevo espacio de trabajo</span>
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  `,
})
export class Organizations {
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly switching = signal<string | null>(null);

  constructor() {
    if (this.workspace.orgsState() === 'idle') this.workspace.loadOrganizations();
  }

  protected enter(org: OrganizationResponse): void {
    if (this.switching() !== null) return;
    if (this.store.organizationId() === org.id) {
      void this.router.navigate(['/projects']);
      return;
    }
    this.switching.set(org.id);
    this.auth.switchOrganization(org.id).subscribe({
      next: () => {
        this.workspace.loadProjects(org.id);
        void this.router.navigate(['/projects']);
      },
      error: () => this.switching.set(null),
    });
  }

  protected create(): void {
    void this.router.navigate(['/onboarding']);
  }
}
