import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import {
  StoryListFilters,
  StoryPriority,
  StorySort,
  StorySortDirection,
  StoryStatus,
  UserStoryResponse,
} from '../../data/discovery.models';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { HlmButton, HlmIcon, HlmInput, HlmSkeleton } from '../../../../shared/ui';

/** A sort control value: a backend sort field paired with a direction. */
type SortValue = `${StorySort}:${StorySortDirection}`;

/**
 * The project's user-story backlog as a Members-style table, filtered and paged
 * entirely server-side: a debounced text search, status + priority selects, a
 * created-date range, a sort control and real pagination all drive the
 * `GET /stories` query. A "New story" button opens the dedicated create page;
 * clicking a row navigates to that story's detail/edit page.
 */
@Component({
  selector: 'app-project-stories',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Select, HlmButton, HlmIcon, HlmInput, HlmSkeleton, TranslocoPipe],
  viewProviders: [provideIcons({ lucidePlus, lucideSearch })],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ 'stories.title' | transloco }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ 'stories.subtitle' | transloco }}</p>
        </div>
        <a hlmBtn size="sm" [routerLink]="['new']" data-testid="stories-new">
          <hlm-icon name="lucidePlus" size="15px" />
          {{ 'stories.new' | transloco }}
        </a>
      </div>

      <!-- Filters + sort -->
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <div
            class="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3"
          >
            <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
            <input
              type="text"
              [value]="query()"
              (input)="onSearch($any($event.target).value)"
              [placeholder]="'stories.searchPlaceholder' | transloco"
              class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autocomplete="off"
              spellcheck="false"
              data-testid="stories-filter"
            />
          </div>
          <app-select
            [options]="priorityFilterOptions()"
            [value]="priorityFilter()"
            (valueChange)="onFilterChange('priority', $event)"
            [ariaLabel]="'stories.filterPriorityAria' | transloco"
          />
          <app-select
            [options]="statusFilterOptions()"
            [value]="statusFilter()"
            (valueChange)="onFilterChange('status', $event)"
            [ariaLabel]="'stories.filterStatusAria' | transloco"
          />
          <app-select
            [options]="sortOptions()"
            [value]="sort()"
            (valueChange)="onSortChange($event)"
            [ariaLabel]="'stories.sortAria' | transloco"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <label class="text-muted-foreground" for="stories-after">
            {{ 'stories.createdAfter' | transloco }}
          </label>
          <input
            hlmInput
            id="stories-after"
            type="date"
            class="w-44"
            [value]="createdAfter()"
            (change)="onDateChange('after', $any($event.target).value)"
            data-testid="stories-after"
          />
          <label class="text-muted-foreground" for="stories-before">
            {{ 'stories.createdBefore' | transloco }}
          </label>
          <input
            hlmInput
            id="stories-before"
            type="date"
            class="w-44"
            [value]="createdBefore()"
            (change)="onDateChange('before', $any($event.target).value)"
            data-testid="stories-before"
          />
          @if (createdAfter() || createdBefore()) {
            <button
              hlmBtn
              size="sm"
              variant="ghost"
              type="button"
              (click)="clearDates()"
              data-testid="stories-clear-dates"
            >
              {{ 'stories.clearDates' | transloco }}
            </button>
          }
        </div>
      </div>

      @if (state() === 'loading') {
        <div class="overflow-hidden rounded-2xl border border-border" data-testid="stories-skeleton">
          @for (i of skeletonRows; track i) {
            <div class="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                <hlm-skeleton class="h-4 w-56 max-w-full" />
                <hlm-skeleton class="h-3 w-40" />
              </div>
              <hlm-skeleton class="h-6 w-16 shrink-0 rounded-full" />
              <hlm-skeleton class="h-6 w-16 shrink-0 rounded-full" />
            </div>
          }
        </div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'stories.loadError' | transloco }}</p>
      } @else if (stories().length === 0) {
        <p
          class="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
          data-testid="stories-empty"
        >
          {{ (hasFilters() ? 'stories.noMatches' : 'stories.emptyBody') | transloco }}
        </p>
      } @else {
        <div class="overflow-hidden rounded-2xl border border-border">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs text-muted-foreground">
                <th class="px-4 py-2.5 font-medium">{{ 'stories.colTitle' | transloco }}</th>
                <th class="px-3 py-2.5 font-medium">{{ 'stories.colPriority' | transloco }}</th>
                <th class="px-3 py-2.5 font-medium">{{ 'stories.colStatus' | transloco }}</th>
                <th class="px-3 py-2.5 text-right font-medium">
                  {{ 'stories.colPoints' | transloco }}
                </th>
                <th class="px-3 py-2.5 whitespace-nowrap font-medium">
                  {{ 'stories.colCreated' | transloco }}
                </th>
              </tr>
            </thead>
            <tbody>
              @for (s of stories(); track s.id) {
                <tr
                  class="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent/50"
                  (click)="openDetail(s)"
                  data-testid="story-row"
                >
                  <td class="max-w-xs px-4 py-3">
                    <p class="truncate font-medium">{{ s.title }}</p>
                    <p class="truncate text-xs text-muted-foreground">
                      {{ 'stories.as' | transloco }} {{ s.role }}{{ 'stories.want' | transloco }}
                      {{ s.action }}
                    </p>
                  </td>
                  <td class="px-3 py-3">
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      [class]="priorityClass(s.priority)"
                    >
                      {{ 'stories.priority.' + s.priority | transloco }}
                    </span>
                  </td>
                  <td class="px-3 py-3">
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      [class]="statusClass(s.status)"
                    >
                      {{ 'stories.status.' + s.status | transloco }}
                    </span>
                  </td>
                  <td class="px-3 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {{ s.storyPoints ?? '—' }}
                  </td>
                  <td class="px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {{ formatDate(s.createdAt) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1) {
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-muted-foreground">
              {{ 'stories.pageOf' | transloco: { page: page() + 1, total: totalPages() } }}
            </span>
            <div class="flex gap-2">
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                [disabled]="page() === 0 || state() === 'loading'"
                (click)="goToPage(page() - 1)"
                data-testid="stories-prev"
              >
                {{ 'stories.prev' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                [disabled]="page() >= totalPages() - 1 || state() === 'loading'"
                (click)="goToPage(page() + 1)"
                data-testid="stories-next"
              >
                {{ 'stories.next' | transloco }}
              </button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class ProjectStories implements OnInit, OnDestroy {
  private readonly api = inject(DiscoveryApiService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly pageSize = 20;

  protected readonly stories = signal<UserStoryResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly page = signal(0);
  protected readonly totalPages = signal(1);

  protected readonly query = signal('');
  protected readonly priorityFilter = signal('all');
  protected readonly statusFilter = signal('all');
  protected readonly createdAfter = signal('');
  protected readonly createdBefore = signal('');
  protected readonly sort = signal<SortValue>('createdAt:DESC');

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly translate = translateFn(this.transloco);

  protected readonly hasFilters = computed(
    () =>
      !!this.query().trim() ||
      this.priorityFilter() !== 'all' ||
      this.statusFilter() !== 'all' ||
      !!this.createdAfter() ||
      !!this.createdBefore(),
  );

  protected readonly priorityFilterOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return [
      { value: 'all', label: t('stories.filterAllPriorities') },
      ...(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => ({
        value: p,
        label: t('stories.priority.' + p),
      })),
    ];
  });
  protected readonly statusFilterOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return [
      { value: 'all', label: t('stories.filterAllStatuses') },
      ...(['DRAFT', 'APPROVED', 'REJECTED', 'MERGED', 'EXPORTED'] as const).map((s) => ({
        value: s,
        label: t('stories.status.' + s),
      })),
    ];
  });
  protected readonly sortOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return [
      { value: 'createdAt:DESC', label: t('stories.sort.recent') },
      { value: 'title:ASC', label: t('stories.sort.title') },
      { value: 'priority:DESC', label: t('stories.sort.priority') },
      { value: 'status:ASC', label: t('stories.sort.status') },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  /** Debounced server-side search: resets to the first page and reloads. */
  protected onSearch(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.resetAndLoad(), 300);
  }

  protected onFilterChange(kind: 'priority' | 'status', value: string): void {
    if (kind === 'priority') this.priorityFilter.set(value);
    else this.statusFilter.set(value);
    this.resetAndLoad();
  }

  protected onDateChange(bound: 'after' | 'before', value: string): void {
    if (bound === 'after') this.createdAfter.set(value);
    else this.createdBefore.set(value);
    this.resetAndLoad();
  }

  protected clearDates(): void {
    this.createdAfter.set('');
    this.createdBefore.set('');
    this.resetAndLoad();
  }

  protected onSortChange(value: string): void {
    this.sort.set(value as SortValue);
    this.resetAndLoad();
  }

  protected goToPage(next: number): void {
    if (next < 0 || next >= this.totalPages()) return;
    this.page.set(next);
    this.load();
  }

  protected openDetail(story: UserStoryResponse): void {
    void this.router.navigate(['/projects', this.projectId(), 'stories', story.id]);
  }

  private resetAndLoad(): void {
    this.page.set(0);
    this.load();
  }

  private load(): void {
    const [sortBy, sortDirection] = this.sort().split(':') as [StorySort, StorySortDirection];
    const filters: StoryListFilters = {
      page: this.page(),
      size: this.pageSize,
      sortBy,
      sortDirection,
      search: this.query(),
      status: this.statusFilter() === 'all' ? undefined : (this.statusFilter() as StoryStatus),
      priority:
        this.priorityFilter() === 'all' ? undefined : (this.priorityFilter() as StoryPriority),
      createdAfter: toInstant(this.createdAfter(), false),
      createdBefore: toInstant(this.createdBefore(), true),
    };
    this.state.set('loading');
    this.api.listProjectStories(this.projectId(), filters).subscribe({
      next: (res) => {
        this.stories.set(res.content);
        this.totalPages.set(Math.max(1, res.page.totalPages));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected priorityClass(priority: string): string {
    const classes: Record<string, string> = {
      CRITICAL: 'bg-destructive/20 text-destructive',
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
      MERGED: 'bg-primary/15 text-primary',
      EXPORTED: 'bg-primary/15 text-primary',
      DRAFT: 'bg-secondary text-muted-foreground',
    };
    return classes[status] ?? 'bg-secondary text-muted-foreground';
  }

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }
}

/**
 * Turns a `<input type="date">` value (YYYY-MM-DD, or '') into an ISO instant for
 * the backend's createdAfter/createdBefore bounds. The lower bound is the start of
 * the day (inclusive); the upper bound is the start of the NEXT day so the range
 * is inclusive of the selected end date (the backend treats createdBefore as
 * exclusive). Returns undefined for a blank value (no bound sent).
 */
export function toInstant(dateValue: string, endExclusive: boolean): string | undefined {
  if (!dateValue) return undefined;
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
