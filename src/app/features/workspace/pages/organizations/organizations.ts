import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { OrganizationResponse } from '../../data/workspace.models';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../../../shared/components/logo/logo';
import { UserMenu } from '../../../../shared/components/user-menu/user-menu';
import { provideIcons } from '@ng-icons/core';
import { lucideBuilding2, lucideChevronRight, lucidePlus } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmIcon, HlmSpinner } from '../../../../shared/ui';

/**
 * Organization picker shown to users in more than one organization (see
 * launchGuard). Picking one activates it and enters its workspace; a final card
 * creates a new organization.
 */
@Component({
  selector: 'app-organizations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ThemeToggle, Logo, UserMenu, HlmSpinner, HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideBuilding2, lucideChevronRight, lucidePlus })],
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
            <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
              {{ 'orgPicker.title' | transloco }}
            </h1>
            <p class="text-sm text-muted-foreground">{{ 'orgPicker.subtitle' | transloco }}</p>
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
                  <hlm-icon name="lucideBuilding2" size="22px" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate font-semibold">{{ org.name }}</span>
                    @if (org.id === store.organizationId()) {
                      <span
                        class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                      >
                        {{ 'orgPicker.current' | transloco }}
                      </span>
                    }
                  </span>
                  <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                    {{ 'orgPicker.meetingsIn' | transloco: { lang: org.meetingLanguage } }}
                  </span>
                </span>
                @if (switching() === org.id) {
                  <hlm-spinner class="h-4 w-4" />
                } @else {
                  <hlm-icon
                    name="lucideChevronRight"
                    size="18px"
                    class="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
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
                <hlm-icon name="lucidePlus" size="22px" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block font-semibold text-foreground">
                  {{ 'orgPicker.createTitle' | transloco }}
                </span>
                <span class="mt-0.5 block text-xs">{{
                  'orgPicker.createSubtitle' | transloco
                }}</span>
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
