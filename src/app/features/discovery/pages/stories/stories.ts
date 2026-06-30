import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { UserStoryResponse } from '../../data/discovery.models';

/** The project's user-story backlog: AI-generated across sessions plus manual ones. */
@Component({
  selector: 'app-project-stories',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'stories.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'stories.subtitle' | transloco }}</p>
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="text-sm text-muted-foreground">{{ 'stories.loading' | transloco }}</p>
        }
        @case ('error') {
          <p class="text-sm text-destructive">{{ 'stories.loadError' | transloco }}</p>
        }
        @default {
          @if (stories().length === 0) {
            <div
              class="rounded-2xl border border-dashed border-border p-12 text-center"
              data-testid="stories-empty"
            >
              <p class="text-sm font-medium">{{ 'stories.emptyTitle' | transloco }}</p>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ 'stories.emptyBody' | transloco }}
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
                      {{ 'stories.priority.' + story.priority | transloco }}
                    </span>
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      [class]="statusClass(story.status)"
                    >
                      {{ 'stories.status.' + story.status | transloco }}
                    </span>
                    @if (story.storyPoints !== null) {
                      <span class="ml-auto text-[11px] text-muted-foreground"
                        >{{ story.storyPoints }} {{ 'stories.points' | transloco }}</span
                      >
                    }
                  </div>
                  <p class="text-sm font-medium">{{ story.title }}</p>
                  <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {{ 'stories.as' | transloco }}
                    <span class="text-foreground">{{ story.role }}</span
                    >{{ 'stories.want' | transloco }}
                    <span class="text-foreground">{{ story.action }}</span
                    >{{ 'stories.benefit' | transloco }}
                    <span class="text-foreground">{{ story.benefit }}</span
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

  protected priorityClass(priority: string): string {
    const classes: Record<string, string> = {
      HIGH: 'bg-destructive/15 text-destructive',
      MEDIUM: 'bg-amber-500/15 text-amber-600',
      LOW: 'bg-secondary text-muted-foreground',
    };
    return classes[priority] ?? 'bg-secondary text-muted-foreground';
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
