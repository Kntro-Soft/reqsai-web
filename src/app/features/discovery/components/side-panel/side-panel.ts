import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideSearch, lucideX } from '@ng-icons/lucide';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import {
  GlossaryTermResponse,
  ProjectConstraintResponse,
  ProjectContextApiService,
} from '../../data/project-context-api.service';
import { HlmIcon, HlmSpinner } from '../../../../shared/ui';

export type PanelTab = 'stories' | 'info' | 'glossary' | 'constraints';

/**
 * Collapsible right side panel of the discovery chat: Stories (project
 * backlog), Info (project fact sheet), Glossary and Constraints, each with a
 * small filter. Rendered as a column on wide screens; the page overlays it on
 * small ones. `focusStoryId` scrolls/highlights a story (suggestion targets).
 */
@Component({
  selector: 'app-side-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideSearch, lucideX })],
  host: { class: 'block h-full min-h-0' },
  template: `
    <div
      class="flex h-full min-h-0 flex-col rounded-none border-0 bg-card md:rounded-2xl md:border md:border-border"
    >
      <!-- Tabs -->
      <div class="flex items-center gap-1 border-b border-border p-2">
        @for (t of tabs; track t) {
          <button
            type="button"
            (click)="tab.set(t)"
            class="rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
            [class]="
              tab() === t
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            "
            [attr.data-testid]="'panel-tab-' + t"
          >
            {{ 'discovery.panel.' + t | transloco }}
          </button>
        }
        <button
          type="button"
          (click)="open.set(false)"
          class="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          [attr.aria-label]="'discovery.panel.close' | transloco"
          data-testid="panel-close"
        >
          <hlm-icon name="lucideX" size="15px" />
        </button>
      </div>

      <!-- Filter (not for Info) -->
      @if (tab() !== 'info') {
        <div class="border-b border-border p-2">
          <div class="flex items-center gap-2 rounded-md border border-input bg-background px-2.5">
            <hlm-icon name="lucideSearch" size="13px" class="shrink-0 text-muted-foreground" />
            <input
              type="text"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
              [placeholder]="'discovery.panel.filter' | transloco"
              class="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autocomplete="off"
              data-testid="panel-filter"
            />
          </div>
        </div>
      }

      <div class="min-h-0 flex-1 overflow-y-auto p-2.5" #scroller>
        @switch (tab()) {
          @case ('stories') {
            @if (filteredStories().length === 0) {
              <p class="p-3 text-center text-xs text-muted-foreground">
                {{ 'discovery.panel.storiesEmpty' | transloco }}
              </p>
            }
            <div class="flex flex-col gap-2">
              @for (story of filteredStories(); track story.id) {
                <div
                  [id]="'panel-story-' + story.id"
                  class="rounded-xl border p-3 transition-colors"
                  [class]="
                    story.id === focusStoryId()
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border bg-background/40'
                  "
                  data-testid="panel-story"
                >
                  <p class="text-sm font-medium">{{ story.title }}</p>
                  <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {{ 'discovery.story.as' | transloco }}
                    <span class="text-foreground">{{ story.role }}</span
                    >{{ 'discovery.story.want' | transloco }}
                    <span class="text-foreground">{{ story.action }}</span
                    >{{ 'discovery.story.soThat' | transloco }}
                    <span class="text-foreground">{{ story.benefit }}</span
                    >.
                  </p>
                </div>
              }
            </div>
          }
          @case ('info') {
            @if (project(); as p) {
              <dl class="flex flex-col gap-3 p-1 text-sm">
                <div>
                  <dt class="text-xs font-medium text-muted-foreground">
                    {{ 'discovery.panel.infoName' | transloco }}
                  </dt>
                  <dd class="mt-0.5 font-medium">{{ p.name }}</dd>
                </div>
                @if (p.description) {
                  <div>
                    <dt class="text-xs font-medium text-muted-foreground">
                      {{ 'discovery.panel.infoDescription' | transloco }}
                    </dt>
                    <dd class="mt-0.5 leading-relaxed text-muted-foreground">
                      {{ p.description }}
                    </dd>
                  </div>
                }
                @if (p.domain) {
                  <div>
                    <dt class="text-xs font-medium text-muted-foreground">
                      {{ 'discovery.panel.infoDomain' | transloco }}
                    </dt>
                    <dd class="mt-0.5">{{ p.domain }}</dd>
                  </div>
                }
                @if (p.architecture) {
                  <div>
                    <dt class="text-xs font-medium text-muted-foreground">
                      {{ 'discovery.panel.infoArchitecture' | transloco }}
                    </dt>
                    <dd class="mt-0.5">{{ p.architecture }}</dd>
                  </div>
                }
                @if (p.programmingLanguages.length || p.frameworks.length) {
                  <div>
                    <dt class="text-xs font-medium text-muted-foreground">
                      {{ 'discovery.panel.infoStack' | transloco }}
                    </dt>
                    <dd class="mt-1 flex flex-wrap gap-1">
                      @for (item of stack(); track item) {
                        <span
                          class="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                          >{{ item }}</span
                        >
                      }
                    </dd>
                  </div>
                }
              </dl>
            } @else {
              <p class="p-3 text-center text-xs text-muted-foreground">
                {{ 'discovery.panel.infoEmpty' | transloco }}
              </p>
            }
          }
          @case ('glossary') {
            @if (glossaryState() === 'loading') {
              <div class="flex justify-center py-6"><hlm-spinner class="h-4 w-4" /></div>
            } @else if (glossaryState() === 'error') {
              <p class="p-3 text-center text-xs text-destructive">
                {{ 'discovery.panel.loadError' | transloco }}
              </p>
            } @else if (filteredGlossary().length === 0) {
              <p class="p-3 text-center text-xs text-muted-foreground">
                {{ 'discovery.panel.glossaryEmpty' | transloco }}
              </p>
            } @else {
              <dl class="flex flex-col gap-2.5 p-1">
                @for (term of filteredGlossary(); track term.id) {
                  <div data-testid="panel-term">
                    <dt class="text-sm font-medium">{{ term.term }}</dt>
                    <dd class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {{ term.definition }}
                    </dd>
                  </div>
                }
              </dl>
            }
          }
          @case ('constraints') {
            @if (constraintsState() === 'loading') {
              <div class="flex justify-center py-6"><hlm-spinner class="h-4 w-4" /></div>
            } @else if (constraintsState() === 'error') {
              <p class="p-3 text-center text-xs text-destructive">
                {{ 'discovery.panel.loadError' | transloco }}
              </p>
            } @else if (filteredConstraints().length === 0) {
              <p class="p-3 text-center text-xs text-muted-foreground">
                {{ 'discovery.panel.constraintsEmpty' | transloco }}
              </p>
            } @else {
              <ul class="flex flex-col gap-2 p-1">
                @for (constraint of filteredConstraints(); track constraint.id) {
                  <li
                    class="rounded-xl border border-border bg-background/40 p-3 text-sm leading-relaxed"
                    data-testid="panel-constraint"
                  >
                    {{ constraint.description }}
                  </li>
                }
              </ul>
            }
          }
        }
      </div>
    </div>
  `,
})
export class SidePanel {
  private readonly contextApi = inject(ProjectContextApiService);
  private readonly auth = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly store = inject(DiscoveryChatStore);

  readonly projectId = input.required<string>();
  readonly open = model(false);
  /** Story to scroll to / highlight in the Stories tab (suggestion targets). */
  readonly focusStoryId = model<string | null>(null);

  protected readonly tabs: PanelTab[] = ['stories', 'info', 'glossary', 'constraints'];
  protected readonly tab = signal<PanelTab>('stories');
  protected readonly query = signal('');

  protected readonly glossary = signal<GlossaryTermResponse[]>([]);
  protected readonly glossaryState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly constraints = signal<ProjectConstraintResponse[]>([]);
  protected readonly constraintsState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  protected readonly project = computed(() =>
    this.workspace.projects().find((p) => p.id === this.projectId()),
  );

  protected readonly stack = computed(() => {
    const p = this.project();
    if (!p) return [];
    return [...p.programmingLanguages, ...p.frameworks, ...p.databases, ...p.clientPlatforms];
  });

  protected readonly filteredStories = computed(() => {
    const q = this.query().trim().toLowerCase();
    const stories = this.store.projectStories();
    if (!q) return stories;
    return stories.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        s.action.toLowerCase().includes(q),
    );
  });

  protected readonly filteredGlossary = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.glossary();
    return this.glossary().filter(
      (t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q),
    );
  });

  protected readonly filteredConstraints = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.constraints();
    return this.constraints().filter((c) => c.description.toLowerCase().includes(q));
  });

  constructor() {
    // Lazy-load glossary/constraints the first time their tab opens.
    effect(() => {
      const tab = this.tab();
      if (tab === 'glossary' && this.glossaryState() === 'idle') this.loadGlossary();
      if (tab === 'constraints' && this.constraintsState() === 'idle') this.loadConstraints();
    });
    // Reset the filter when switching tabs (each tab filters its own list).
    effect(() => {
      this.tab();
      this.query.set('');
    });
    // Focus request: open the Stories tab and scroll the story into view.
    effect(() => {
      const storyId = this.focusStoryId();
      if (!storyId) return;
      this.tab.set('stories');
      setTimeout(() => {
        const el = (this.host.nativeElement as HTMLElement).querySelector(
          `#panel-story-${CSS.escape(storyId)}`,
        );
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
    });
  }

  private loadGlossary(): void {
    const orgId = this.auth.organizationId();
    if (!orgId) {
      this.glossaryState.set('error');
      return;
    }
    this.glossaryState.set('loading');
    this.contextApi.listGlossaryTerms(orgId, this.projectId()).subscribe({
      next: (terms) => {
        this.glossary.set(terms);
        this.glossaryState.set('ready');
      },
      error: () => this.glossaryState.set('error'),
    });
  }

  private loadConstraints(): void {
    const orgId = this.auth.organizationId();
    if (!orgId) {
      this.constraintsState.set('error');
      return;
    }
    this.constraintsState.set('loading');
    this.contextApi.listConstraints(orgId, this.projectId()).subscribe({
      next: (constraints) => {
        this.constraints.set(constraints);
        this.constraintsState.set('ready');
      },
      error: () => this.constraintsState.set('error'),
    });
  }
}
