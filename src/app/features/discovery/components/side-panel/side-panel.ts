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
import { lucideChevronDown, lucideSearch, lucideX } from '@ng-icons/lucide';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import { comparePriority, compareRecent } from '../../data/feed';
import { SuggestionPriority } from '../../data/discovery.models';
import {
  GlossaryTermResponse,
  ProjectConstraintResponse,
  ProjectContextApiService,
} from '../../data/project-context-api.service';
import { HlmIcon, HlmSpinner } from '../../../../shared/ui';

export type PanelTab = 'stories' | 'info' | 'glossary' | 'constraints';

/** Stories tab ordering: by priority (default) or most-recently created. */
export type StorySort = 'priority' | 'recent';

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
  viewProviders: [provideIcons({ lucideChevronDown, lucideSearch, lucideX })],
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

      <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2.5" #scroller>
        @switch (tab()) {
          @case ('stories') {
            <!-- Sort + priority filter controls -->
            <div class="mb-2.5 flex flex-col gap-2">
              <div class="flex items-center gap-1.5">
                <span class="text-[11px] font-medium text-muted-foreground">
                  {{ 'discovery.panel.sortBy' | transloco }}
                </span>
                @for (option of sortOptions; track option) {
                  <button
                    type="button"
                    (click)="sort.set(option)"
                    class="rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors"
                    [class]="
                      sort() === option
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    "
                    [attr.data-testid]="'panel-sort-' + option"
                  >
                    {{ 'discovery.panel.sort.' + option | transloco }}
                  </button>
                }
              </div>
              <div class="flex flex-wrap items-center gap-1">
                @for (chip of priorityChips; track chip) {
                  <button
                    type="button"
                    (click)="togglePriority(chip)"
                    class="rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors"
                    [class]="
                      priorityFilter() === chip
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    "
                    [attr.data-testid]="'panel-priority-' + chip"
                  >
                    {{ 'discovery.suggestion.priority.' + chip | transloco }}
                  </button>
                }
              </div>
            </div>

            @if (visibleStories().length === 0) {
              <p class="p-3 text-center text-xs text-muted-foreground">
                {{ 'discovery.panel.storiesEmpty' | transloco }}
              </p>
            }
            <div class="flex flex-col gap-2">
              @for (story of visibleStories(); track story.id) {
                <div
                  [id]="'panel-story-' + story.id"
                  class="overflow-hidden rounded-xl border transition-colors"
                  [class]="
                    story.id === focusStoryId()
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border bg-background/40'
                  "
                  [class.story-flash]="story.id === flashStoryId()"
                  data-testid="panel-story"
                >
                  <!-- Collapsed header: title + priority chip + points badge -->
                  <button
                    type="button"
                    (click)="toggleExpanded(story.id)"
                    class="flex w-full items-start gap-2 p-3 text-left"
                    [attr.aria-expanded]="isExpanded(story.id)"
                    data-testid="panel-story-toggle"
                  >
                    <hlm-icon
                      name="lucideChevronDown"
                      size="15px"
                      class="mt-0.5 shrink-0 text-muted-foreground transition-transform"
                      [class.rotate-180]="isExpanded(story.id)"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-medium">{{ story.title }}</span>
                      <span class="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          class="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                          [class]="priorityClass(story.priority)"
                          data-testid="panel-story-priority"
                        >
                          {{ 'discovery.suggestion.priority.' + story.priority | transloco }}
                        </span>
                        @if (story.storyPoints !== null && story.storyPoints !== undefined) {
                          <span
                            class="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                            data-testid="panel-story-points"
                          >
                            {{ 'discovery.panel.points' | transloco: { n: story.storyPoints } }}
                          </span>
                        }
                      </span>
                    </span>
                  </button>

                  <!-- Expanded body: role/action/benefit + acceptance criteria -->
                  @if (isExpanded(story.id)) {
                    <div
                      class="border-t border-border/60 px-3 pb-3 pt-2.5"
                      data-testid="panel-story-body"
                    >
                      <p class="text-xs leading-relaxed text-muted-foreground">
                        {{ 'discovery.story.as' | transloco }}
                        <span class="text-foreground">{{ story.role }}</span
                        >{{ 'discovery.story.want' | transloco }}
                        <span class="text-foreground">{{ story.action }}</span
                        >{{ 'discovery.story.soThat' | transloco }}
                        <span class="text-foreground">{{ story.benefit }}</span
                        >.
                      </p>
                      @if (story.acceptanceCriteria.length > 0) {
                        <p
                          class="mb-1.5 mt-3 text-[11px] font-medium uppercase text-muted-foreground"
                        >
                          {{ 'discovery.suggestion.criteria' | transloco }}
                        </p>
                        <ul class="flex flex-col gap-1.5" data-testid="panel-story-criteria">
                          @for (c of story.acceptanceCriteria; track $index) {
                            <li
                              class="rounded-lg border border-border bg-background/40 px-2.5 py-1.5 text-xs leading-relaxed"
                            >
                              @if (c.scenario) {
                                <p class="mb-0.5 font-medium text-foreground">{{ c.scenario }}</p>
                              }
                              <p class="text-muted-foreground">
                                <span class="font-semibold text-primary">{{
                                  'discovery.suggestion.criteriaGiven' | transloco
                                }}</span>
                                {{ c.given }} ·
                                <span class="font-semibold text-primary">{{
                                  'discovery.suggestion.criteriaWhen' | transloco
                                }}</span>
                                {{ c.when }} ·
                                <span class="font-semibold text-primary">{{
                                  'discovery.suggestion.criteriaThen' | transloco
                                }}</span>
                                {{ c.then }}
                              </p>
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  }
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

    <style>
      /* Transient thick-outline flash when a story is focused from a chat decision.
         Reduced-motion users get a brief static ring instead of the fade. */
      @media (prefers-reduced-motion: no-preference) {
        .story-flash {
          animation: story-flash 1.5s ease-out;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .story-flash {
          box-shadow: 0 0 0 3px var(--primary);
        }
      }
      @keyframes story-flash {
        0% {
          box-shadow: 0 0 0 3px var(--primary);
        }
        70% {
          box-shadow: 0 0 0 3px var(--primary);
        }
        100% {
          box-shadow: 0 0 0 0 transparent;
        }
      }
    </style>
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

  protected readonly sortOptions: StorySort[] = ['priority', 'recent'];
  protected readonly sort = signal<StorySort>('priority');
  protected readonly priorityChips: SuggestionPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  /** Active priority filter, or null when showing every priority. */
  protected readonly priorityFilter = signal<SuggestionPriority | null>(null);
  /** Ids of expanded story cards (collapsed by default). */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  /** The story id currently playing the transient focus flash, or null. */
  protected readonly flashStoryId = signal<string | null>(null);

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

  /**
   * The Stories tab list after the text filter, priority chip filter and the
   * chosen sort. A fresh array is sorted so the source signal is never mutated.
   */
  protected readonly visibleStories = computed(() => {
    const q = this.query().trim().toLowerCase();
    const priority = this.priorityFilter();
    const sort = this.sort();
    const filtered = this.store
      .projectStories()
      .filter((s) => !priority || s.priority?.toUpperCase() === priority)
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q) ||
          s.action.toLowerCase().includes(q),
      );
    return [...filtered].sort(sort === 'recent' ? compareRecent : comparePriority);
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
    // Focus request: open the Stories tab, expand the story, scroll it into
    // view and play the transient flash outline (ties TASK 4a to the panel).
    effect(() => {
      const storyId = this.focusStoryId();
      if (!storyId) return;
      this.tab.set('stories');
      // Clear any priority filter that would hide the focused story.
      this.priorityFilter.set(null);
      this.expanded.update((set) => new Set(set).add(storyId));
      this.flashStoryId.set(storyId);
      setTimeout(() => {
        const el = (this.host.nativeElement as HTMLElement).querySelector(
          `#panel-story-${CSS.escape(storyId)}`,
        );
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
      // Drop the flash marker once the 1.5s animation has run its course.
      const timer = setTimeout(() => {
        if (this.flashStoryId() === storyId) this.flashStoryId.set(null);
      }, 1600);
      return () => clearTimeout(timer);
    });
  }

  protected toggleExpanded(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  /** Toggles a priority filter chip: clicking the active one clears the filter. */
  protected togglePriority(priority: SuggestionPriority): void {
    this.priorityFilter.update((current) => (current === priority ? null : priority));
  }

  protected priorityClass(priority: string): string {
    const classes: Record<string, string> = {
      CRITICAL: 'bg-destructive/20 text-destructive',
      HIGH: 'bg-destructive/15 text-destructive',
      MEDIUM: 'bg-amber-500/15 text-amber-600',
      LOW: 'bg-secondary text-muted-foreground',
    };
    return classes[priority?.toUpperCase()] ?? 'bg-secondary text-muted-foreground';
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
