import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
} from '../../shared/ui';

/**
 * Minimal authenticated landing. It confirms the session is live and routes the
 * user onward — to onboarding when they have no organization yet, or to their
 * projects otherwise.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmButton,
    HlmCard,
    HlmCardHeader,
    HlmCardTitle,
    HlmCardDescription,
    HlmCardContent,
    TranslocoPipe,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          @if (store.user()?.firstName; as name) {
            {{ 'home.greetingNamed' | transloco: { name } }}
          } @else {
            {{ 'home.greetingAnon' | transloco }}
          }
        </h1>
        <p class="text-muted-foreground">{{ 'home.sessionActive' | transloco }}</p>
      </div>

      <div hlmCard class="max-w-xl">
        <div hlmCardHeader>
          <h2 hlmCardTitle>
            {{
              (store.needsOnboarding() ? 'home.onboardTitle' : 'home.workspaceTitle') | transloco
            }}
          </h2>
          <p hlmCardDescription>
            {{ (store.needsOnboarding() ? 'home.onboardDesc' : 'home.workspaceDesc') | transloco }}
          </p>
        </div>
        <div hlmCardContent class="flex flex-col gap-4">
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <dt class="text-muted-foreground">{{ 'home.userLabel' | transloco }}</dt>
            <dd>{{ store.user()?.fullName }}</dd>
            <dt class="text-muted-foreground">{{ 'home.orgLabel' | transloco }}</dt>
            <dd>{{ store.organizationId() ?? '—' }}</dd>
          </dl>

          @if (store.needsOnboarding()) {
            <a hlmBtn routerLink="/onboarding" class="w-fit">{{ 'home.createOrg' | transloco }}</a>
          } @else {
            <a hlmBtn routerLink="/projects" class="w-fit">{{ 'home.viewProjects' | transloco }}</a>
          }
        </div>
      </div>
    </div>
  `,
})
export class Home {
  protected readonly store = inject(AuthStore);
}
