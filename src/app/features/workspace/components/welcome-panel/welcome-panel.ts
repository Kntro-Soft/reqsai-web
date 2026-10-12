import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCompass,
  lucideFlaskConical,
  lucidePlug,
  lucidePlus,
  lucideX,
} from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { HlmButton, HlmIcon } from '../../../../shared/ui';

/**
 * What to do first, shown above the projects until dismissed: try the sample project, create your own,
 * connect Jira or GitHub (only those who administer the organization can) and take the tour.
 */
@Component({
  selector: 'app-welcome-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HlmButton, HlmIcon, TranslocoPipe],
  viewProviders: [
    provideIcons({ lucideCompass, lucideFlaskConical, lucidePlug, lucidePlus, lucideX }),
  ],
  template: `
    <section
      class="relative flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-5"
      data-testid="welcome-panel"
      [attr.aria-label]="'onboarding.welcome.title' | transloco"
    >
      <button
        type="button"
        class="absolute top-3 right-3 grid h-8 w-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        [attr.aria-label]="'onboarding.welcome.dismiss' | transloco"
        (click)="dismissed.emit()"
        data-testid="welcome-dismiss"
      >
        <hlm-icon name="lucideX" size="16px" />
      </button>
      <div class="pr-8">
        <h2 class="text-lg font-semibold tracking-tight">
          {{ 'onboarding.welcome.title' | transloco }}
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'onboarding.welcome.subtitle' | transloco }}
        </p>
      </div>
      <ul class="grid gap-3 sm:grid-cols-3">
        @if (demoProjectId(); as demoId) {
          <li class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <hlm-icon name="lucideFlaskConical" size="20px" class="self-start text-primary" />
            <p class="text-sm font-medium">{{ 'onboarding.welcome.demoTitle' | transloco }}</p>
            <p class="text-sm text-muted-foreground">
              {{ 'onboarding.welcome.demoBody' | transloco }}
            </p>
            <a
              hlmBtn
              size="sm"
              class="mt-auto"
              [routerLink]="['/projects', demoId]"
              data-testid="welcome-demo"
            >
              {{ 'onboarding.welcome.demoCta' | transloco }}
            </a>
          </li>
        }
        <li class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <hlm-icon name="lucidePlus" size="20px" class="self-start text-primary" />
          <p class="text-sm font-medium">{{ 'onboarding.welcome.createTitle' | transloco }}</p>
          <p class="text-sm text-muted-foreground">
            {{ 'onboarding.welcome.createBody' | transloco }}
          </p>
          <a
            hlmBtn
            size="sm"
            variant="outline"
            class="mt-auto"
            routerLink="/projects/new"
            data-testid="welcome-create"
          >
            {{ 'onboarding.welcome.createCta' | transloco }}
          </a>
        </li>
        <li class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <hlm-icon name="lucidePlug" size="20px" class="self-start text-primary" />
          <p class="text-sm font-medium">{{ 'onboarding.welcome.connectTitle' | transloco }}</p>
          <p class="text-sm text-muted-foreground">
            {{
              (canConnect()
                ? 'onboarding.welcome.connectBody'
                : 'onboarding.welcome.connectBodyMember'
              ) | transloco
            }}
          </p>
          @if (canConnect()) {
            <a
              hlmBtn
              size="sm"
              variant="outline"
              class="mt-auto"
              [routerLink]="['/settings', 'integrations']"
              data-testid="welcome-connect"
            >
              {{ 'onboarding.welcome.connectCta' | transloco }}
            </a>
          }
        </li>
      </ul>
      <div>
        <button
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="tourRequested.emit()"
          data-testid="welcome-tour"
        >
          <hlm-icon name="lucideCompass" size="15px" />
          {{ 'onboarding.welcome.tourCta' | transloco }}
        </button>
      </div>
    </section>
  `,
})
export class WelcomePanel {
  private readonly permissions = inject(PermissionsStore);

  readonly demoProjectId = input<string | null>(null);
  readonly dismissed = output<void>();
  readonly tourRequested = output<void>();

  protected readonly canConnect = computed(() => this.permissions.isOrgOwnerOrAdmin());
}
