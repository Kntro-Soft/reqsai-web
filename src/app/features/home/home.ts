import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Hola, {{ store.user()?.firstName || 'bienvenido' }}
        </h1>
        <p class="text-muted-foreground">Tu sesión está activa.</p>
      </div>

      <div hlmCard class="max-w-xl">
        <div hlmCardHeader>
          <h2 hlmCardTitle>
            {{ store.needsOnboarding() ? 'Crea tu organización' : 'Espacio de trabajo' }}
          </h2>
          <p hlmCardDescription>
            {{
              store.needsOnboarding()
                ? 'Aún no perteneces a ninguna organización. Crea una para empezar.'
                : 'Ya tienes una organización activa. Gestiona tus proyectos.'
            }}
          </p>
        </div>
        <div hlmCardContent class="flex flex-col gap-4">
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <dt class="text-muted-foreground">Usuario</dt>
            <dd>{{ store.user()?.fullName }}</dd>
            <dt class="text-muted-foreground">Organización</dt>
            <dd>{{ store.organizationId() ?? '—' }}</dd>
          </dl>

          @if (store.needsOnboarding()) {
            <a hlmBtn routerLink="/onboarding" class="w-fit">Crear organización</a>
          } @else {
            <a hlmBtn routerLink="/projects" class="w-fit">Ver proyectos</a>
          }
        </div>
      </div>
    </div>
  `,
})
export class Home {
  protected readonly store = inject(AuthStore);
}
