import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideDownload,
  lucidePlus,
  lucideSearch,
  lucideTrash2,
  lucideUpload,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { IntegrationsApiService } from '../../../workspace/data/integrations-api.service';
import { IntegrationJobsStore } from '../../../workspace/data/integration-jobs.store';
import {
  JiraImportIssue,
  defaultImportSelection,
} from '../../../workspace/data/integrations.models';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { HttpErrorResponse } from '@angular/common/http';
import { Modal } from '../../../../shared/components/modal/modal';
import { Indeterminate } from '../../../../shared/directives/indeterminate';
import { HasPermission } from '../../../../shared/directives/has-permission';
import { HlmBadge, HlmSpinner } from '../../../../shared/ui';
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
import {
  allSelectedOnPage,
  someSelectedOnPage,
  toggleAllOnPage,
  toggleId,
} from './selection.helpers';

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
  imports: [
    RouterLink,
    Select,
    Modal,
    Indeterminate,
    HasPermission,
    HlmBadge,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [
    provideIcons({ lucideDownload, lucidePlus, lucideSearch, lucideTrash2, lucideUpload }),
  ],
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <div class="flex h-full min-h-0 flex-col gap-6">
      <div class="flex shrink-0 items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ 'stories.title' | transloco }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ 'stories.subtitle' | transloco }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            (click)="openImport()"
            [disabled]="importPreviewing() || importJobRunning() || jiraConfigured() !== true"
            [title]="
              importJobRunning()
                ? ('integrations.jobs.alreadyRunning' | transloco)
                : jiraConfigured() === false
                  ? ('integrations.push.notConfigured' | transloco)
                  : ''
            "
            data-testid="stories-import"
          >
            @if (importPreviewing() || importJobRunning()) {
              <hlm-spinner class="h-4 w-4" />
            } @else {
              <hlm-icon name="lucideDownload" size="15px" />
            }
            {{ 'integrations.import.action' | transloco }}
          </button>
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            (click)="pushAll()"
            [disabled]="pushAllBusy() || jiraConfigured() !== true"
            [title]="
              pushJobRunning()
                ? ('integrations.jobs.alreadyRunning' | transloco)
                : jiraConfigured() === false
                  ? ('integrations.push.notConfigured' | transloco)
                  : ''
            "
            data-testid="stories-push-all"
          >
            @if (pushAllBusy()) {
              <hlm-spinner class="h-4 w-4" />
            } @else {
              <hlm-icon name="lucideUpload" size="15px" />
            }
            {{ 'integrations.push.pushAll' | transloco }}
          </button>
          <a
            *appHasPermission="'STORY_WRITE'"
            hlmBtn
            size="sm"
            [routerLink]="['new']"
            data-testid="stories-new"
          >
            <hlm-icon name="lucidePlus" size="15px" />
            {{ 'stories.new' | transloco }}
          </a>
        </div>
      </div>

      <!-- Contextual action bar: shown while any row on this page is selected. -->
      @if (selectedCount() > 0) {
        <div
          class="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
          data-testid="stories-action-bar"
        >
          <span class="text-sm font-medium">
            {{ 'stories.selectedCount' | transloco: { count: selectedCount() } }}
          </span>
          <button
            hlmBtn
            size="sm"
            variant="ghost"
            type="button"
            (click)="clearSelection()"
            data-testid="stories-clear-selection"
          >
            {{ 'stories.clearSelection' | transloco }}
          </button>
          <div class="ml-auto flex items-center gap-2">
            <button
              hlmBtn
              size="sm"
              variant="outline"
              type="button"
              (click)="pushSelected()"
              [disabled]="pushAllBusy() || jiraConfigured() !== true"
              [title]="
                pushJobRunning()
                  ? ('integrations.jobs.alreadyRunning' | transloco)
                  : jiraConfigured() === false
                    ? ('integrations.push.notConfigured' | transloco)
                    : ''
              "
              data-testid="stories-push-selected"
            >
              @if (pushAllBusy()) {
                <hlm-spinner class="h-4 w-4" />
              } @else {
                <hlm-icon name="lucideUpload" size="15px" />
              }
              {{ 'stories.bulkPush' | transloco: { count: selectedCount() } }}
            </button>
            <button
              hlmBtn
              size="sm"
              variant="destructive"
              type="button"
              (click)="askBulkDelete()"
              data-testid="stories-bulk-delete"
            >
              <hlm-icon name="lucideTrash2" size="15px" />
              {{ 'stories.bulkDelete' | transloco: { count: selectedCount() } }}
            </button>
          </div>
        </div>
      }

      <!-- Filters + sort -->
      <div class="flex shrink-0 flex-col gap-2">
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
        <div
          class="min-h-0 flex-1 overflow-auto rounded-2xl border border-border"
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
        <p class="shrink-0 text-sm text-destructive">{{ 'stories.loadError' | transloco }}</p>
      } @else if (stories().length === 0) {
        <p
          class="min-h-0 flex-1 rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
          data-testid="stories-empty"
        >
          {{ (hasFilters() ? 'stories.noMatches' : 'stories.emptyBody') | transloco }}
        </p>
      } @else {
        <div class="min-h-0 flex-1 overflow-auto rounded-2xl border border-border">
          <table class="w-full min-w-[720px] text-sm">
            <thead>
              <tr
                class="sticky top-0 z-10 border-b border-border bg-card text-left text-xs text-muted-foreground"
              >
                <th class="w-10 px-4 py-2.5 font-medium">
                  <input
                    type="checkbox"
                    class="h-4 w-4 shrink-0 align-middle accent-primary"
                    [checked]="allRowsSelected()"
                    [appIndeterminate]="someRowsSelected()"
                    (change)="toggleAllRows()"
                    [attr.aria-label]="'stories.selectAllAria' | transloco"
                    data-testid="stories-select-all"
                  />
                </th>
                <th class="px-4 py-2.5 font-medium">{{ 'stories.colTitle' | transloco }}</th>
                <th class="px-3 py-2.5 font-medium">{{ 'stories.colPriority' | transloco }}</th>
                <th class="px-3 py-2.5 font-medium">{{ 'stories.colStatus' | transloco }}</th>
                <th class="px-3 py-2.5 text-right font-medium">
                  {{ 'stories.colPoints' | transloco }}
                </th>
                <th class="px-3 py-2.5 whitespace-nowrap font-medium">
                  {{ 'stories.colCreated' | transloco }}
                </th>
                <th class="w-12 px-3 py-2.5 text-right font-medium">
                  <span class="sr-only">{{ 'stories.colActions' | transloco }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (s of stories(); track s.id) {
                <tr
                  class="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent/50"
                  [class.bg-muted]="selected().has(s.id)"
                  (click)="openDetail(s)"
                  data-testid="story-row"
                >
                  <td class="w-10 px-4 py-3" (click)="$event.stopPropagation()">
                    <input
                      type="checkbox"
                      class="h-4 w-4 shrink-0 align-middle accent-primary"
                      [checked]="selected().has(s.id)"
                      (change)="toggleRow(s.id)"
                      [attr.aria-label]="'stories.selectRowAria' | transloco"
                      [attr.data-testid]="'story-select-' + s.id"
                    />
                  </td>
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
                  <td class="w-12 px-3 py-3 text-right">
                    <button
                      type="button"
                      (click)="askDelete(s, $event)"
                      [attr.aria-label]="'stories.deleteAria' | transloco"
                      class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      [attr.data-testid]="'story-delete-' + s.id"
                    >
                      <hlm-icon name="lucideTrash2" size="15px" />
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="flex shrink-0 items-center justify-between gap-3">
          <div class="flex flex-col text-sm text-muted-foreground">
            <span>{{ 'stories.total' | transloco: { count: total() } }}</span>
            <span>{{
              'stories.pageOf' | transloco: { page: page() + 1, total: totalPages() }
            }}</span>
          </div>
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
    </div>

    <!-- Delete a single story -->
    <app-modal [(open)]="deleteOpen">
      <span modalTitle>{{ 'stories.deleteConfirmTitle' | transloco }}</span>
      <p>{{ 'stories.deleteConfirmBody' | transloco }}</p>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="deleteOpen.set(false)"
      >
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="destructive"
        type="button"
        (click)="confirmDelete()"
        [disabled]="deleting()"
        data-testid="stories-delete-confirm"
      >
        @if (deleting()) {
          <hlm-spinner class="h-4 w-4" />
        }
        {{ 'stories.delete' | transloco }}
      </button>
    </app-modal>

    <!-- Bulk delete the selected stories -->
    <app-modal [(open)]="bulkDeleteOpen">
      <span modalTitle>{{
        'stories.deleteConfirmBulkTitle' | transloco: { count: selectedCount() }
      }}</span>
      <p>{{ 'stories.deleteConfirmBulkBody' | transloco: { count: selectedCount() } }}</p>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="bulkDeleteOpen.set(false)"
      >
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="destructive"
        type="button"
        (click)="confirmBulkDelete()"
        [disabled]="bulkDeleting()"
        data-testid="stories-bulk-delete-confirm"
      >
        @if (bulkDeleting()) {
          <hlm-spinner class="h-4 w-4" />
        }
        {{ 'stories.bulkDelete' | transloco: { count: selectedCount() } }}
      </button>
    </app-modal>

    <!-- Import from Jira: preview picker -->
    <app-modal [(open)]="importOpen">
      <span modalTitle>{{ 'integrations.import.title' | transloco }}</span>
      <div class="flex flex-col gap-3">
        @if (importIssues().length === 0) {
          <p class="text-sm text-muted-foreground" data-testid="import-empty">
            {{ 'integrations.import.empty' | transloco }}
          </p>
        } @else {
          <p class="text-sm text-muted-foreground">
            {{ 'integrations.import.subtitle' | transloco: { total: importIssues().length } }}
          </p>
          <label
            class="flex cursor-pointer items-center gap-2.5 border-b border-border pb-2 text-sm font-medium"
          >
            <input
              type="checkbox"
              class="h-4 w-4 shrink-0 accent-primary"
              [checked]="allSelected()"
              [appIndeterminate]="someSelected()"
              (change)="toggleAll()"
              data-testid="import-select-all"
            />
            {{ 'integrations.import.selectAll' | transloco }}
          </label>
          <div class="-mx-1 max-h-72 overflow-y-auto">
            @for (issue of importIssues(); track issue.jiraIssueKey) {
              <label
                class="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-2 text-sm hover:bg-accent/50"
              >
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  [checked]="selectedKeys().has(issue.jiraIssueKey)"
                  (change)="toggleIssue(issue.jiraIssueKey)"
                  [attr.data-testid]="'import-issue-' + issue.jiraIssueKey"
                />
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="flex items-center gap-2">
                    <span class="font-mono text-xs text-muted-foreground">{{
                      issue.jiraIssueKey
                    }}</span>
                    <span class="text-xs text-muted-foreground">· {{ issue.issueType }}</span>
                    @if (issue.duplicate) {
                      <span hlmBadge variant="secondary" data-testid="import-duplicate-badge">
                        {{ 'integrations.import.duplicate' | transloco }}
                      </span>
                    }
                  </span>
                  <span class="truncate font-medium text-foreground">{{ issue.summary }}</span>
                </span>
              </label>
            }
          </div>
        }
      </div>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="importOpen.set(false)"
      >
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        type="button"
        (click)="confirmImport()"
        [disabled]="selectedKeys().size === 0 || importing()"
        data-testid="import-confirm"
      >
        @if (importing()) {
          <hlm-spinner class="h-4 w-4" />
        }
        {{ 'integrations.import.confirm' | transloco: { count: selectedKeys().size } }}
      </button>
    </app-modal>
  `,
})
export class ProjectStories implements OnInit, OnDestroy {
  private readonly api = inject(DiscoveryApiService);
  private readonly integrations = inject(IntegrationsApiService);
  private readonly jobs = inject(IntegrationJobsStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly projectId = input.required<string>();

  // Background-job state: the 202 request itself is brief (pushStarting), then the
  // jobs store owns the RUNNING state — the buttons stay disabled from it while the
  // work happens server-side, without blocking the page.
  protected readonly pushStarting = signal(false);
  protected readonly pushJobRunning = computed(() => this.jobs.runningOfType('PUSH_ALL'));
  protected readonly pushAllBusy = computed(() => this.pushStarting() || this.pushJobRunning());
  protected readonly importJobRunning = computed(() => this.jobs.runningOfType('IMPORT'));

  /**
   * Whether the project has a Jira push target configured; `null` while resolving. Import and
   * push-all are disabled (with an explanatory tooltip) until a target exists — a missing target
   * would only 409 on click. The GET's 404 is the expected "not configured" answer, not an error.
   */
  protected readonly jiraConfigured = signal<boolean | null>(null);

  // Import-from-Jira flow: preview loads the candidate issues into the picker modal,
  // where non-duplicates are selected by default; confirm POSTs the chosen keys.
  protected readonly importOpen = signal(false);
  protected readonly importPreviewing = signal(false);
  protected readonly importing = signal(false);
  protected readonly importIssues = signal<JiraImportIssue[]>([]);
  protected readonly selectedKeys = signal<ReadonlySet<string>>(new Set());
  protected readonly allSelected = computed(
    () => this.importIssues().length > 0 && this.selectedKeys().size === this.importIssues().length,
  );
  /** Some — but not all — issues selected: drives the header checkbox's indeterminate state. */
  protected readonly someSelected = computed(() => {
    const n = this.selectedKeys().size;
    return n > 0 && n < this.importIssues().length;
  });

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly pageSize = 20;

  protected readonly stories = signal<UserStoryResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly page = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);

  // PER-PAGE multi-select: the ids selected on the currently visible page only. The
  // table is server-side paged, so the selection is cleared whenever the page, filters
  // or sort change (see clearSelection in resetAndLoad/goToPage/load).
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedCount = computed(() => this.selected().size);
  private readonly pageStoryIds = computed(() => this.stories().map((s) => s.id));
  protected readonly allRowsSelected = computed(() =>
    allSelectedOnPage(this.selected(), this.pageStoryIds()),
  );
  /** Some — but not all — of the page's rows selected: the header checkbox's indeterminate flag. */
  protected readonly someRowsSelected = computed(() =>
    someSelectedOnPage(this.selected(), this.pageStoryIds()),
  );

  // Single-story delete confirmation (row-level trash action).
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<UserStoryResponse | null>(null);
  protected readonly deleting = signal(false);
  // Bulk delete confirmation (contextual action bar).
  protected readonly bulkDeleteOpen = signal(false);
  protected readonly bulkDeleting = signal(false);

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
    this.integrations.getProjectTarget(this.projectId()).subscribe({
      next: () => this.jiraConfigured.set(true),
      error: () => this.jiraConfigured.set(false),
    });
    // A finished background job (import or push-all) changes the backlog — new
    // stories, or statuses flipped to EXPORTED — so refresh the visible page.
    this.jobs.completed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((job) => {
      if (job.projectId === this.projectId()) this.load();
    });
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
    this.clearSelection();
    this.page.set(next);
    this.load();
  }

  protected openDetail(story: UserStoryResponse): void {
    void this.router.navigate(['/projects', this.projectId(), 'stories', story.id]);
  }

  // ---- Per-page selection ----

  /** Toggles one row's checkbox. */
  protected toggleRow(id: string): void {
    this.selected.set(toggleId(this.selected(), id));
  }

  /** Header checkbox: select every row on the current page, or clear them all. */
  protected toggleAllRows(): void {
    this.selected.set(toggleAllOnPage(this.selected(), this.pageStoryIds()));
  }

  /** Empties the selection — also called on page/filter/sort change so it stays per-page. */
  protected clearSelection(): void {
    if (this.selected().size > 0) this.selected.set(new Set());
  }

  // ---- Selective push to Jira ----

  /**
   * Pushes only the SELECTED stories to Jira, reusing the same background-job flow as
   * {@link pushAll}: the 202's job goes to the jobs store (global banner) and a
   * "started" toast confirms the kick-off. The selection is cleared once the job starts.
   */
  protected pushSelected(): void {
    if (this.pushAllBusy() || this.selectedCount() === 0) return;
    this.pushStarting.set(true);
    const storyIds = [...this.selected()];
    this.integrations.pushAllStories(this.projectId(), { storyIds }).subscribe({
      next: (job) => {
        this.pushStarting.set(false);
        this.clearSelection();
        this.jobs.track(job);
        this.toast.success(this.transloco.translate('integrations.jobs.started'));
      },
      error: (err: unknown) => {
        this.pushStarting.set(false);
        this.toast.error(this.pushAllErrorMessage(err));
      },
    });
  }

  // ---- Single-story delete ----

  protected askDelete(story: UserStoryResponse, event: Event): void {
    // Don't let the click bubble to the row (which navigates to the detail page).
    event.stopPropagation();
    this.deleteTarget.set(story);
    this.deleteOpen.set(true);
  }

  protected confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.deleting()) return;
    this.deleting.set(true);
    this.api.deleteStory(this.projectId(), target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        if (this.selected().has(target.id)) {
          const next = new Set(this.selected());
          next.delete(target.id);
          this.selected.set(next);
        }
        this.toast.success(this.transloco.translate('stories.deleted'));
        this.load();
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  // ---- Bulk delete ----

  protected askBulkDelete(): void {
    if (this.selectedCount() === 0) return;
    this.bulkDeleteOpen.set(true);
  }

  protected confirmBulkDelete(): void {
    if (this.bulkDeleting() || this.selectedCount() === 0) return;
    this.bulkDeleting.set(true);
    const storyIds = [...this.selected()];
    this.api.batchDeleteStories(this.projectId(), storyIds).subscribe({
      next: (result) => {
        this.bulkDeleting.set(false);
        this.bulkDeleteOpen.set(false);
        this.clearSelection();
        this.toast.success(
          this.transloco.translate('stories.deletedBulk', { deleted: result.deleted }),
        );
        this.load();
      },
      error: (err: unknown) => {
        this.bulkDeleting.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  /**
   * Starts pushing every eligible story to Jira as a background job: the 202's job
   * is handed to the jobs store (global banner + button disabling) and a "started"
   * toast confirms the kick-off — completion is announced by the banner's toast. A
   * missing mapping (INTEGRATION_TARGET_NOT_CONFIGURED) points at the project's
   * integration settings; a job already in flight (INTEGRATION_JOB_ALREADY_RUNNING,
   * e.g. started by a teammate) surfaces its own message via `messageForError`.
   */
  protected pushAll(): void {
    if (this.pushAllBusy()) return;
    this.pushStarting.set(true);
    this.integrations.pushAllStories(this.projectId()).subscribe({
      next: (job) => {
        this.pushStarting.set(false);
        this.jobs.track(job);
        this.toast.success(this.transloco.translate('integrations.jobs.started'));
      },
      error: (err: unknown) => {
        this.pushStarting.set(false);
        this.toast.error(this.pushAllErrorMessage(err));
      },
    });
  }

  private pushAllErrorMessage(err: unknown): string {
    if (
      err instanceof HttpErrorResponse &&
      (err.error as { code?: unknown } | null)?.code === 'INTEGRATION_TARGET_NOT_CONFIGURED'
    ) {
      return this.transloco.translate('integrations.push.notConfigured');
    }
    return messageForError(err, this.transloco);
  }

  /**
   * Fetches the Jira import preview and opens the picker modal with the candidate
   * issues (non-duplicates pre-selected). An unconfigured target
   * (INTEGRATION_TARGET_NOT_CONFIGURED) points the user at project settings.
   */
  protected openImport(): void {
    if (this.importPreviewing()) return;
    this.importPreviewing.set(true);
    this.integrations.previewJiraImport(this.projectId()).subscribe({
      next: (preview) => {
        this.importPreviewing.set(false);
        this.importIssues.set(preview.issues);
        this.selectedKeys.set(new Set(defaultImportSelection(preview)));
        this.importOpen.set(true);
      },
      error: (err: unknown) => {
        this.importPreviewing.set(false);
        this.toast.error(this.importErrorMessage(err));
      },
    });
  }

  protected toggleAll(): void {
    if (this.allSelected()) {
      this.selectedKeys.set(new Set());
    } else {
      this.selectedKeys.set(new Set(this.importIssues().map((i) => i.jiraIssueKey)));
    }
  }

  protected toggleIssue(key: string): void {
    this.selectedKeys.update((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * Starts importing the selected Jira issues as a background job: on the 202 the
   * modal closes immediately, the job is handed to the jobs store (global banner)
   * and a "started" toast confirms the kick-off. The list refreshes when the job's
   * completion event arrives (see ngOnInit); the summary toast comes from the banner.
   */
  protected confirmImport(): void {
    if (this.importing() || this.selectedKeys().size === 0) return;
    this.importing.set(true);
    const issueKeys = [...this.selectedKeys()];
    this.integrations.importFromJira(this.projectId(), { issueKeys }).subscribe({
      next: (job) => {
        this.importing.set(false);
        this.importOpen.set(false);
        this.jobs.track(job);
        this.toast.success(this.transloco.translate('integrations.jobs.started'));
      },
      error: (err: unknown) => {
        this.importing.set(false);
        this.toast.error(this.importErrorMessage(err));
      },
    });
  }

  private importErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const code = (err.error as { code?: unknown } | null)?.code;
      if (code === 'INTEGRATION_TARGET_NOT_CONFIGURED') {
        return this.transloco.translate('integrations.push.notConfigured');
      }
    }
    return messageForError(err, this.transloco);
  }

  private resetAndLoad(): void {
    this.clearSelection();
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
        this.totalPages.set(Math.max(1, res.page?.totalPages ?? 1));
        this.total.set(res.page?.totalElements ?? res.content.length);
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
