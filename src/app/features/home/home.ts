import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthStore } from '../../core/auth/auth.store';
import {
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
} from '../../shared/ui';

/**
 * Minimal authenticated landing. It confirms the session is live and shows the
 * onboarding hint; the real dashboard and the workspace/discovery features
 * replace it in later increments.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmCard, HlmCardHeader, HlmCardTitle, HlmCardDescription, HlmCardContent],
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
                ? 'Aún no perteneces a ninguna organización. El siguiente paso del onboarding llega pronto.'
                : 'Ya tienes una organización activa. La gestión de proyectos llega en el próximo incremento.'
            }}
          </p>
        </div>
        <div hlmCardContent>
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <dt class="text-muted-foreground">Usuario</dt>
            <dd>{{ store.user()?.fullName }}</dd>
            <dt class="text-muted-foreground">Organización</dt>
            <dd>{{ store.organizationId() ?? '—' }}</dd>
          </dl>
        </div>
      </div>
    </div>
  `,
})
export class Home {
  protected readonly store = inject(AuthStore);
}
