import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import {
  CreateUserStoryRequest,
  StoryPriority,
  StorySort,
  StorySortDirection,
  UserStoryResponse,
} from '../../data/discovery.models';
import {
  duplicateStorySimilarityPercent,
  isConflict,
  problemCode,
} from '../../data/duplicate-error';
import { Modal } from '../../../../shared/components/modal/modal';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import { translateFn } from '../../../../core/i18n/translate-fn';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

/** A sort control value: a backend sort field paired with a direction. */
type SortValue = `${StorySort}:${StorySortDirection}`;

/**
 * The project's user-story backlog as a Members-style table: server-paginated
 * with a sort control, plus client-side text search and priority/status filter
 * chips over the loaded page. A manual add card creates a story (POST); a
 * near-duplicate 409 surfaces the backend similarity score.
 *
 * There is no update/delete story endpoint, so rows have no edit/delete actions
 * — clicking a row opens a read-only detail modal instead.
 */
@Component({
  selector: 'app-project-stories',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Modal,
    Select,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucidePlus, lucideSearch })],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'stories.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'stories.subtitle' | transloco }}</p>
      </div>

      <!-- Manual add -->
      <section class="overflow-hidden rounded-2xl border border-border">
        <div class="flex flex-col gap-1 p-5">
          <h2 class="text-base font-semibold">{{ 'stories.addTitle' | transloco }}</h2>
          <p class="text-sm text-muted-foreground">{{ 'stories.addDesc' | transloco }}</p>
        </div>
        <form
          [formGroup]="form"
          (ngSubmit)="add()"
          class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5"
        >
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="story-title">{{ 'stories.fieldTitle' | transloco }}</label>
            <input
              hlmInput
              id="story-title"
              formControlName="title"
              [placeholder]="'stories.placeholderTitle' | transloco"
              data-testid="story-title"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="story-role">{{ 'stories.fieldRole' | transloco }}</label>
              <textarea
                hlmInput
                id="story-role"
                rows="2"
                formControlName="role"
                [placeholder]="'stories.placeholderRole' | transloco"
              ></textarea>
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="story-action">{{ 'stories.fieldAction' | transloco }}</label>
              <textarea
                hlmInput
                id="story-action"
                rows="2"
                formControlName="action"
                [placeholder]="'stories.placeholderAction' | transloco"
              ></textarea>
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="story-benefit">{{ 'stories.fieldBenefit' | transloco }}</label>
              <textarea
                hlmInput
                id="story-benefit"
                rows="2"
                formControlName="benefit"
                [placeholder]="'stories.placeholderBenefit' | transloco"
              ></textarea>
            </div>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1.5">
              <span hlmLabel>{{ 'stories.fieldPriority' | transloco }}</span>
              <app-select
                [options]="priorityOptions()"
                [value]="form.controls.priority.value"
                (valueChange)="form.controls.priority.setValue($any($event))"
                [ariaLabel]="'stories.fieldPriority' | transloco"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="story-points">{{ 'stories.fieldPoints' | transloco }}</label>
              <input
                hlmInput
                id="story-points"
                type="number"
                min="0"
                class="w-28"
                formControlName="storyPoints"
                [placeholder]="'stories.placeholderPoints' | transloco"
              />
            </div>
            <button
              hlmBtn
              size="sm"
              type="submit"
              class="ml-auto"
              [disabled]="form.invalid || submitting()"
              data-testid="story-submit"
            >
              @if (submitting()) {
                <hlm-spinner class="h-4 w-4" />
              } @else {
                <hlm-icon name="lucidePlus" size="15px" />
              }
              {{ 'stories.submit' | transloco }}
            </button>
          </div>
          @if (formError()) {
            <p class="text-sm text-destructive" data-testid="story-form-error">{{ formError() }}</p>
          }
        </form>
      </section>

      <!-- Filters + sort -->
      <div class="flex flex-wrap items-center gap-2">
        <div
          class="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3"
        >
          <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
          <input
            type="text"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
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
          (valueChange)="priorityFilter.set($event)"
          [ariaLabel]="'stories.filterPriorityAria' | transloco"
        />
        <app-select
          [options]="statusFilterOptions()"
          [value]="statusFilter()"
          (valueChange)="statusFilter.set($event)"
          [ariaLabel]="'stories.filterStatusAria' | transloco"
        />
        <app-select
          [options]="sortOptions()"
          [value]="sort()"
          (valueChange)="onSortChange($event)"
          [ariaLabel]="'stories.sortAria' | transloco"
        />
      </div>

      @if (state() === 'loading') {
        <div
          class="overflow-hidden rounded-2xl border border-border"
          data-testid="stories-skeleton"
        >
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
      } @else if (rows().length === 0) {
        <p
          class="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
          data-testid="stories-empty"
        >
          {{ (stories().length === 0 ? 'stories.emptyBody' : 'stories.noMatches') | transloco }}
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
              @for (s of rows(); track s.id) {
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

      <!-- Read-only detail (no update/delete endpoint exists) -->
      <app-modal [(open)]="detailOpen">
        <span modalTitle>{{ 'stories.detailTitle' | transloco }}</span>
        @if (detail(); as d) {
          <div class="flex flex-col gap-3">
            <p class="text-sm font-medium text-foreground">{{ d.title }}</p>
            <div class="flex flex-wrap gap-2">
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                [class]="priorityClass(d.priority)"
              >
                {{ 'stories.priority.' + d.priority | transloco }}
              </span>
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                [class]="statusClass(d.status)"
              >
                {{ 'stories.status.' + d.status | transloco }}
              </span>
              @if (d.storyPoints !== null) {
                <span
                  class="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {{ d.storyPoints }} {{ 'stories.points' | transloco }}
                </span>
              }
            </div>
            <p class="text-sm leading-relaxed text-muted-foreground">
              {{ 'stories.as' | transloco }} <span class="text-foreground">{{ d.role }}</span
              >{{ 'stories.want' | transloco }} <span class="text-foreground">{{ d.action }}</span
              >{{ 'stories.benefit' | transloco }}
              <span class="text-foreground">{{ d.benefit }}</span
              >.
            </p>
          </div>
        }
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="detailOpen.set(false)"
        >
          {{ 'stories.close' | transloco }}
        </button>
      </app-modal>
    </div>
  `,
})
export class ProjectStories implements OnInit {
  private readonly api = inject(DiscoveryApiService);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

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
  protected readonly sort = signal<SortValue>('createdAt:DESC');

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly detailOpen = signal(false);
  protected readonly detail = signal<UserStoryResponse | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    role: ['', [Validators.required, Validators.maxLength(500)]],
    action: ['', [Validators.required, Validators.maxLength(500)]],
    benefit: ['', [Validators.required, Validators.maxLength(500)]],
    priority: ['MEDIUM' as StoryPriority, [Validators.required]],
    storyPoints: [null as number | null],
  });

  private readonly translate = translateFn(this.transloco);

  protected readonly priorityOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => ({
      value: p,
      label: t('stories.priority.' + p),
    }));
  });
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
      ...(['DRAFT', 'APPROVED', 'REJECTED'] as const).map((s) => ({
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

  /** The loaded page after the client-side text search and priority/status chips. */
  protected readonly rows = computed(() =>
    filterStories(this.stories(), this.query(), this.priorityFilter(), this.statusFilter()),
  );

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    const [sortBy, sortDirection] = this.sort().split(':') as [StorySort, StorySortDirection];
    this.state.set('loading');
    this.api
      .listProjectStories(this.projectId(), {
        page: this.page(),
        size: this.pageSize,
        sortBy,
        sortDirection,
      })
      .subscribe({
        next: (res) => {
          this.stories.set(res.content);
          this.totalPages.set(Math.max(1, res.page.totalPages));
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  protected onSortChange(value: string): void {
    this.sort.set(value as SortValue);
    this.page.set(0);
    this.load();
  }

  protected goToPage(next: number): void {
    if (next < 0 || next >= this.totalPages()) return;
    this.page.set(next);
    this.load();
  }

  protected openDetail(story: UserStoryResponse): void {
    this.detail.set(story);
    this.detailOpen.set(true);
  }

  protected add(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.formError.set(null);
    const raw = this.form.getRawValue();
    const body: CreateUserStoryRequest = {
      title: raw.title.trim(),
      role: raw.role.trim(),
      action: raw.action.trim(),
      benefit: raw.benefit.trim(),
      priority: raw.priority,
      storyPoints:
        raw.storyPoints != null && `${raw.storyPoints}` !== '' ? Number(raw.storyPoints) : null,
    };
    this.api.createStory(this.projectId(), body).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.stories.update((list) => [created, ...list]);
        this.form.reset({ priority: 'MEDIUM', storyPoints: null });
        this.toast.success(this.transloco.translate('stories.created'));
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        const message = this.errorMessage(err);
        this.formError.set(message);
        this.toast.error(message);
      },
    });
  }

  /** Turns a create error into a user message; a duplicate 409 surfaces the similarity score. */
  private errorMessage(err: unknown): string {
    if (isConflict(err) && problemCode(err) === 'DUPLICATE_USER_STORY') {
      const percent = duplicateStorySimilarityPercent(err);
      return percent !== null
        ? this.transloco.translate('stories.errorDuplicate', { percent })
        : this.transloco.translate('stories.errorDuplicateNoScore');
    }
    return this.transloco.translate('stories.errorCreate');
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
 * Client-side narrowing of a loaded story page: a case-insensitive text match on
 * title/role/action, plus exact priority/status chips ('all' = no filter).
 * Exported as a pure helper so it can be unit-tested without the component.
 */
export function filterStories(
  stories: readonly UserStoryResponse[],
  query: string,
  priority: string,
  status: string,
): UserStoryResponse[] {
  const q = query.trim().toLowerCase();
  return stories.filter((s) => {
    const matchesQuery =
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      s.action.toLowerCase().includes(q);
    const matchesPriority = priority === 'all' || s.priority === priority;
    const matchesStatus = status === 'all' || s.status === status;
    return matchesQuery && matchesPriority && matchesStatus;
  });
}
