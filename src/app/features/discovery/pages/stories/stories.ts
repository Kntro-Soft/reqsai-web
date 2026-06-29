import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { UserStoryResponse } from '../../data/discovery.models';

/** The project's user-story backlog: AI-generated across sessions plus manual ones. */
@Component({
  selector: 'app-project-stories',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Historias</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          El backlog de historias de usuario del proyecto.
        </p>
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="text-sm text-muted-foreground">Cargando…</p>
        }
        @case ('error') {
          <p class="text-sm text-destructive">No se pudieron cargar las historias.</p>
        }
        @default {
          @if (stories().length === 0) {
            <div
              class="rounded-2xl border border-dashed border-border p-12 text-center"
              data-testid="stories-empty"
            >
              <p class="text-sm font-medium">Aún no hay historias</p>
              <p class="mt-1 text-sm text-muted-foreground">
                Graba una sesión y genera historias con la IA, o créalas manualmente.
              </p>
            </div>
          } @else {
            <div class="grid gap-3 md:grid-cols-2">
              @for (story of stories(); track story.id) {
                <div class="rounded-2xl border border-border bg-card p-4" data-testid="story-card">
                  <div class="mb-1.5 flex items-center gap-2">
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      [class]="priorityClass(story.priority)"
                    >
                      {{ priorityLabel(story.priority) }}
                    </span>
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      [class]="statusClass(story.status)"
                    >
                      {{ statusLabel(story.status) }}
                    </span>
                    @if (story.storyPoints !== null) {
                      <span class="ml-auto text-[11px] text-muted-foreground"
                        >{{ story.storyPoints }} pts</span
                      >
                    }
                  </div>
                  <p class="text-sm font-medium">{{ story.title }}</p>
                  <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Como <span class="text-foreground">{{ story.role }}</span
                    >, quiero <span class="text-foreground">{{ story.action }}</span
                    >, para <span class="text-foreground">{{ story.benefit }}</span
                    >.
                  </p>
                </div>
              }
            </div>
          }
        }
      }
    </div>
  `,
})
export class ProjectStories implements OnInit {
  private readonly api = inject(DiscoveryApiService);

  readonly projectId = input.required<string>();

  protected readonly stories = signal<UserStoryResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  ngOnInit(): void {
    this.api.listProjectStories(this.projectId()).subscribe({
      next: (page) => {
        this.stories.set(page.content);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected priorityLabel(priority: string): string {
    const labels: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };
    return labels[priority] ?? priority;
  }

  protected priorityClass(priority: string): string {
    const classes: Record<string, string> = {
      HIGH: 'bg-destructive/15 text-destructive',
      MEDIUM: 'bg-amber-500/15 text-amber-600',
      LOW: 'bg-secondary text-muted-foreground',
    };
    return classes[priority] ?? 'bg-secondary text-muted-foreground';
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      DRAFT: 'Borrador',
      APPROVED: 'Aprobada',
      REJECTED: 'Rechazada',
    };
    return labels[status] ?? status;
  }

  protected statusClass(status: string): string {
    const classes: Record<string, string> = {
      APPROVED: 'bg-emerald-500/15 text-emerald-500',
      REJECTED: 'bg-destructive/15 text-destructive',
      DRAFT: 'bg-secondary text-muted-foreground',
    };
    return classes[status] ?? 'bg-secondary text-muted-foreground';
  }
}
