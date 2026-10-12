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
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideBoxes,
  lucideChevronDown,
  lucideCircleAlert,
  lucideCircleCheck,
  lucideCodeXml,
  lucideFolderGit2,
  lucideGitBranch,
  lucideGlobe,
  lucideInfo,
  lucideKeyRound,
  lucideWebhook,
  lucideLockKeyhole,
  lucidePlus,
  lucideRefreshCw,
  lucideSearch,
  lucideShieldCheck,
  lucideSparkles,
  lucideTrash2,
  lucideWandSparkles,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { messageForError } from '../../../../core/errors/error-message';
import { HasPermission } from '../../../../shared/directives/has-permission';
import { Modal } from '../../../../shared/components/modal/modal';
import { FromNowPipe } from '../../../../shared/pipes/from-now.pipe';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmButton, HlmIcon, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';
import { WorkspaceApiService } from '../../../workspace/data/workspace-api.service';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { ProjectResponse } from '../../../workspace/data/workspace.models';
import { CodebaseApiService } from '../../data/codebase-api.service';
import { CodeConnect } from '../../components/code-connect/code-connect';
import { CodeModuleResponse, CodeRepositoryResponse } from '../../data/codebase.models';
import {
  INDEXING_POLL_MS,
  MAX_REPOSITORIES,
  ProfileAdditions,
  additionsCount,
  aggregateProfile,
  anyIndexing,
  filterModules,
  indexingProgress,
  isAddition,
  isIndexing,
  isProfileEmpty,
  mergeProfile,
  modulesLoadKey,
  pluralKey,
  profileAdditions,
  shortSha,
  statusKey,
} from '../../data/codebase';

/** A repository's module map as loaded for its latest indexing (`key`). */
interface ModulesEntry {
  key: string;
  state: 'loading' | 'ready' | 'error';
  list: CodeModuleResponse[];
}

/** One category of the detected profile, as the profile section renders it. */
interface ProfileGroup {
  category: keyof ProfileAdditions;
  labelKey: string;
  values: string[];
  added: string[];
}

/** Capability chips a collapsed module row shows before "+N". */
const CAPABILITY_PREVIEW = 4;

/**
 * The project's code (code-aware copilot): the analyst connects the project's GitHub repositories and
 * ReqsAI indexes each into a map of modules (summary, capabilities, implemented business rules,
 * endpoints, entities). During a meeting the AI suggestions then say when a request already exists
 * in the code or contradicts it. Indexing runs in the background: the list is polled while a
 * repository is indexing, and a repository's modules load once it is ready. The technology found in
 * the code can be merged into the project's technical profile.
 */
@Component({
  selector: 'app-project-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CodeConnect,
    TranslocoPipe,
    FromNowPipe,
    HasPermission,
    Modal,
    HlmButton,
    HlmIcon,
    HlmSkeleton,
    HlmSpinner,
  ],
  viewProviders: [
    provideIcons({
      lucideArrowUpRight,
      lucideBoxes,
      lucideChevronDown,
      lucideCircleAlert,
      lucideCircleCheck,
      lucideCodeXml,
      lucideFolderGit2,
      lucideGitBranch,
      lucideGlobe,
      lucideInfo,
      lucideKeyRound,
      lucideWebhook,
      lucideLockKeyhole,
      lucidePlus,
      lucideRefreshCw,
      lucideSearch,
      lucideShieldCheck,
      lucideSparkles,
      lucideTrash2,
      lucideWandSparkles,
    }),
  ],
  host: { class: 'flex min-h-full flex-col' },
  template: `
    <div class="flex flex-col gap-6 pb-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1 basis-72">
          <h1 class="text-2xl font-bold tracking-tight">{{ 'code.title' | transloco }}</h1>
          <p class="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            {{ 'code.subtitle' | transloco }}
          </p>
        </div>
        @if (canOpenForm()) {
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            (click)="openForm()"
            data-testid="code-connect-open"
          >
            <hlm-icon name="lucidePlus" size="15px" />
            {{ 'code.connect.open' | transloco }}
          </button>
        }
      </div>

      @switch (listState()) {
        @case ('loading') {
          <div class="flex flex-col gap-3" data-testid="code-skeleton">
            @for (i of skeletonRows; track i) {
              <div class="flex items-start gap-3 rounded-2xl border border-border p-4">
                <hlm-skeleton class="h-9 w-9 shrink-0 rounded-lg" />
                <div class="flex flex-1 flex-col gap-2">
                  <hlm-skeleton class="h-4 w-48 max-w-full" />
                  <hlm-skeleton class="h-3 w-72 max-w-full" />
                </div>
              </div>
            }
          </div>
        }
        @case ('error') {
          <div class="flex flex-wrap items-center gap-3" role="alert">
            <p class="text-sm text-destructive">{{ 'code.repo.loadError' | transloco }}</p>
            <button hlmBtn size="sm" variant="outline" type="button" (click)="retryLoad()">
              <hlm-icon name="lucideRefreshCw" size="14px" />
              {{ 'discovery.retry' | transloco }}
            </button>
          </div>
        }
        @default {
          @if (repositories().length === 0) {
            <!-- First run: what connecting does, then the form (or who can do it). -->
            <section
              class="overflow-hidden rounded-2xl border border-border"
              data-testid="code-empty"
            >
              <div class="flex flex-col gap-4 p-5">
                <div>
                  <h2 class="text-base font-semibold">{{ 'code.empty.title' | transloco }}</h2>
                  <p class="mt-1 max-w-[70ch] text-sm text-muted-foreground">
                    {{ 'code.empty.body' | transloco }}
                  </p>
                </div>
                <ul class="grid gap-3 sm:grid-cols-2">
                  @for (point of emptyPoints; track point.key) {
                    <li class="flex items-start gap-3 text-sm leading-relaxed">
                      <span
                        class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-foreground"
                        aria-hidden="true"
                      >
                        <hlm-icon [name]="point.icon" size="16px" />
                      </span>
                      <span class="min-w-0 pt-1 text-muted-foreground">{{
                        'code.empty.points.' + point.key | transloco
                      }}</span>
                    </li>
                  }
                </ul>
              </div>
              <div class="border-t border-border bg-muted/30 p-5">
                @if (canWrite()) {
                  <app-code-connect [projectId]="projectId()" (connected)="onConnected($event)" />
                } @else {
                  <p class="text-sm text-muted-foreground" data-testid="code-no-permission">
                    {{ 'code.empty.noPermission' | transloco }}
                  </p>
                }
              </div>
            </section>
          } @else {
            @if (formOpen() && canWrite() && !atLimit()) {
              <section
                class="overflow-hidden rounded-2xl border border-border"
                data-testid="code-connect-panel"
              >
                <div class="flex flex-col gap-1 p-5">
                  <h2 class="text-base font-semibold">{{ 'code.connect.title' | transloco }}</h2>
                  <p class="text-sm text-muted-foreground">
                    {{ 'code.connect.description' | transloco }}
                  </p>
                </div>
                <div class="border-t border-border bg-muted/30 p-5">
                  <app-code-connect
                    [projectId]="projectId()"
                    [showCancel]="true"
                    [autofocus]="true"
                    (connected)="onConnected($event)"
                    (cancelled)="closeForm()"
                  />
                </div>
              </section>
            }

            <!-- Connected repositories -->
            <section class="flex flex-col gap-3" data-testid="code-repos">
              <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 class="text-base font-semibold">
                  {{ 'code.repo.title' | transloco }}
                  <span class="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{{
                    'code.repo.countOf' | transloco: { count: repositories().length, max: maxRepos }
                  }}</span>
                </h2>
                @if (atLimit() && canWrite()) {
                  <p class="text-xs text-muted-foreground" data-testid="code-limit">
                    {{ 'code.connect.limit' | transloco: { max: maxRepos } }}
                  </p>
                }
              </div>
              <ul class="flex flex-col gap-3">
                @for (repo of repositories(); track repo.id) {
                  <li
                    class="rounded-2xl border border-border bg-card p-4"
                    data-testid="code-repo"
                    [attr.data-status]="repo.status"
                    [attr.aria-busy]="indexing(repo)"
                  >
                    <div class="flex items-start gap-3">
                      <span
                        class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground"
                        aria-hidden="true"
                      >
                        <hlm-icon name="lucideFolderGit2" size="18px" />
                      </span>
                      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <a
                            [href]="repo.htmlUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex min-w-0 items-center gap-1 font-semibold text-foreground wrap-anywhere hover:underline"
                            data-testid="code-repo-name"
                          >
                            {{ repo.fullName }}
                            <hlm-icon
                              name="lucideArrowUpRight"
                              size="13px"
                              class="shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span class="sr-only">({{ 'code.repo.newTab' | transloco }})</span>
                          </a>
                          <span
                            class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                            data-testid="code-repo-visibility"
                          >
                            <hlm-icon
                              [name]="repo.private ? 'lucideLockKeyhole' : 'lucideGlobe'"
                              size="12px"
                              aria-hidden="true"
                            />
                            {{
                              (repo.private ? 'code.repo.private' : 'code.repo.public') | transloco
                            }}
                          </span>
                          <span
                            class="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                            [title]="'code.repo.branch' | transloco"
                            data-testid="code-repo-branch"
                          >
                            <hlm-icon
                              name="lucideGitBranch"
                              size="12px"
                              class="shrink-0"
                              aria-hidden="true"
                            />
                            <span class="truncate font-mono">{{ repo.branch }}</span>
                          </span>
                          @if (repo.autoUpdate) {
                            <span
                              class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                              data-testid="code-repo-auto-update"
                            >
                              <hlm-icon name="lucideWebhook" size="12px" aria-hidden="true" />
                              {{ 'code.github.autoUpdate' | transloco }}
                            </span>
                          }
                        </div>

                        <!-- Status line -->
                        @switch (repo.status) {
                          @case ('READY') {
                            <p
                              class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
                              data-testid="code-repo-status"
                            >
                              <span
                                class="inline-flex items-center gap-1 font-medium text-verified"
                              >
                                <hlm-icon name="lucideCircleCheck" size="13px" aria-hidden="true" />
                                {{ statusLabel(repo) | transloco }}
                              </span>
                              @if (repo.indexedAt; as at) {
                                <span aria-hidden="true">·</span>
                                <time [attr.datetime]="at" [title]="at | date: 'd MMM y, HH:mm'">{{
                                  'code.repo.indexedAt' | transloco: { when: at | fromNow }
                                }}</time>
                              }
                              @if (sha(repo); as commit) {
                                <span aria-hidden="true">·</span>
                                <span
                                  class="font-mono"
                                  [title]="repo.commitSha"
                                  data-testid="code-repo-sha"
                                  >{{ commit }}</span
                                >
                              }
                              <span aria-hidden="true">·</span>
                              <span class="tabular-nums">{{
                                plural('code.repo.files', repo.fileCount)
                                  | transloco: { count: repo.fileCount }
                              }}</span>
                              <span aria-hidden="true">·</span>
                              <span class="tabular-nums">{{
                                plural('code.repo.modules', repo.moduleCount)
                                  | transloco: { count: repo.moduleCount }
                              }}</span>
                            </p>
                          }
                          @case ('FAILED') {
                            <p
                              class="flex items-center gap-1 text-xs font-medium text-destructive"
                              data-testid="code-repo-status"
                            >
                              <hlm-icon name="lucideCircleAlert" size="13px" aria-hidden="true" />
                              {{ statusLabel(repo) | transloco }}
                            </p>
                          }
                          @default {
                            <p
                              class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
                              role="status"
                              data-testid="code-repo-status"
                            >
                              <span
                                class="inline-flex items-center gap-1.5 font-medium text-foreground"
                              >
                                <hlm-spinner class="h-3 w-3" />
                                {{ statusLabel(repo) | transloco }}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span class="tabular-nums">{{
                                repo.moduleCount > 0
                                  ? ('code.repo.progress'
                                    | transloco
                                      : { done: repo.modulesDone, total: repo.moduleCount })
                                  : ('code.repo.progressUnknown' | transloco)
                              }}</span>
                            </p>
                          }
                        }
                      </div>

                      <div class="flex shrink-0 items-center gap-1">
                        @if (repo.status === 'READY') {
                          <button
                            *appHasPermission="'INTEGRATION_WRITE'"
                            hlmBtn
                            size="sm"
                            variant="ghost"
                            type="button"
                            class="gap-0 px-2 sm:gap-2 sm:px-3"
                            (click)="reindex(repo)"
                            [disabled]="reindexing().includes(repo.id)"
                            [attr.aria-label]="'code.repo.reindex' | transloco"
                            [title]="'code.repo.reindex' | transloco"
                            data-testid="code-repo-reindex"
                          >
                            @if (reindexing().includes(repo.id)) {
                              <hlm-spinner class="h-4 w-4" />
                            } @else {
                              <hlm-icon name="lucideRefreshCw" size="15px" />
                            }
                            <span class="hidden sm:inline">{{
                              'code.repo.reindex' | transloco
                            }}</span>
                          </button>
                        }
                        <button
                          *appHasPermission="'INTEGRATION_DELETE'"
                          type="button"
                          (click)="askRemove(repo)"
                          [attr.aria-label]="'code.repo.remove' | transloco"
                          [title]="'code.repo.remove' | transloco"
                          class="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          data-testid="code-repo-remove"
                        >
                          <hlm-icon name="lucideTrash2" size="16px" />
                        </button>
                      </div>
                    </div>

                    @if (indexing(repo)) {
                      @let percent = progress(repo);
                      <div
                        class="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        [attr.aria-valuenow]="percent"
                        [attr.aria-label]="
                          'code.repo.progressAria' | transloco: { name: repo.fullName }
                        "
                        data-testid="code-repo-progress"
                        [attr.data-indeterminate]="percent === null"
                      >
                        @if (percent !== null) {
                          <div
                            class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                            [style.width.%]="percent < 3 ? 3 : percent"
                          ></div>
                        } @else {
                          <div
                            class="code-indeterminate h-full w-1/3 rounded-full bg-primary"
                          ></div>
                        }
                      </div>
                    }

                    @if (repo.status === 'READY' && !repo.summarized) {
                      <p
                        class="mt-3 flex items-start gap-2 rounded-lg border border-pending-border bg-pending-soft px-3 py-2 text-xs leading-relaxed text-foreground"
                        role="note"
                        data-testid="code-repo-basic"
                      >
                        <hlm-icon
                          name="lucideInfo"
                          size="14px"
                          class="mt-px shrink-0 text-pending"
                          aria-hidden="true"
                        />
                        {{ 'code.repo.basicSummaries' | transloco }}
                      </p>
                    }

                    @if (repo.status === 'FAILED') {
                      <div
                        class="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
                        role="alert"
                        data-testid="code-repo-error"
                      >
                        <p class="min-w-0 flex-1 basis-56 text-sm leading-relaxed text-foreground">
                          {{ repo.error || ('code.repo.failedFallback' | transloco) }}
                        </p>
                        <button
                          *appHasPermission="'INTEGRATION_WRITE'"
                          hlmBtn
                          size="sm"
                          variant="outline"
                          type="button"
                          (click)="reindex(repo)"
                          [disabled]="reindexing().includes(repo.id)"
                          data-testid="code-repo-retry"
                        >
                          @if (reindexing().includes(repo.id)) {
                            <hlm-spinner class="h-4 w-4" />
                          } @else {
                            <hlm-icon name="lucideRefreshCw" size="14px" />
                          }
                          {{ 'code.repo.retry' | transloco }}
                        </button>
                      </div>
                    }
                  </li>
                }
              </ul>
            </section>

            <!-- Detected technical profile (READY repositories only) -->
            @if (readyRepositories().length > 0) {
              <section
                class="overflow-hidden rounded-2xl border border-border"
                data-testid="code-profile"
              >
                <div class="flex flex-col gap-1 p-5">
                  <h2 class="text-base font-semibold">{{ 'code.profile.title' | transloco }}</h2>
                  <p class="text-sm text-muted-foreground">
                    {{ 'code.profile.description' | transloco }}
                  </p>
                </div>
                <div class="flex flex-col gap-4 border-t border-border bg-muted/30 p-5">
                  @if (profileEmpty()) {
                    <p class="text-sm text-muted-foreground" data-testid="code-profile-empty">
                      {{ 'code.profile.empty' | transloco }}
                    </p>
                  } @else {
                    <dl class="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4">
                      @for (group of profileGroups(); track group.category) {
                        <dt class="text-xs font-medium text-muted-foreground sm:pt-1">
                          {{ group.labelKey | transloco }}
                        </dt>
                        <dd class="-mt-2 sm:mt-0">
                          <ul class="flex flex-wrap gap-1.5">
                            @for (value of group.values; track value) {
                              @let added = isNew(group, value);
                              <li
                                class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                                [class]="
                                  added
                                    ? 'border-dashed border-ai-border bg-card text-foreground'
                                    : 'border-border bg-card text-muted-foreground'
                                "
                                data-testid="code-profile-chip"
                                [attr.data-category]="group.category"
                                [attr.data-value]="value"
                                [attr.data-new]="added"
                              >
                                @if (added) {
                                  <hlm-icon
                                    name="lucidePlus"
                                    size="11px"
                                    class="text-ai"
                                    aria-hidden="true"
                                  />
                                }
                                {{ value }}
                                @if (added) {
                                  <span class="sr-only"
                                    >({{ 'code.profile.new' | transloco }})</span
                                  >
                                }
                              </li>
                            }
                          </ul>
                        </dd>
                      }
                    </dl>
                  }

                  @for (overview of detected().overviews; track overview.repository) {
                    <div class="flex flex-col gap-1" data-testid="code-profile-overview">
                      @if (detected().overviews.length > 1) {
                        <p class="text-xs font-medium text-muted-foreground">
                          {{ overview.repository }}
                        </p>
                      }
                      <p class="max-w-[75ch] text-sm leading-relaxed text-foreground">
                        {{ overview.text }}
                      </p>
                    </div>
                  }

                  @if (!profileEmpty() && canUpdateProject() && projectLoaded()) {
                    <div
                      class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
                    >
                      <p
                        class="min-w-0 flex-1 basis-64 text-xs leading-relaxed text-muted-foreground"
                        data-testid="code-profile-additions"
                      >
                        @if (additionsTotal() > 0) {
                          {{ 'code.profile.willAdd' | transloco: { items: additionsList() } }}
                        } @else {
                          {{ 'code.profile.upToDate' | transloco }}
                        }
                      </p>
                      <button
                        hlmBtn
                        size="sm"
                        type="button"
                        (click)="applyProfile()"
                        [disabled]="!canApplyProfile()"
                        data-testid="code-profile-apply"
                      >
                        @if (applying()) {
                          <hlm-spinner class="h-4 w-4" />
                        } @else {
                          <hlm-icon name="lucideWandSparkles" size="15px" />
                        }
                        {{ 'code.profile.apply' | transloco }}
                      </button>
                    </div>
                    @if (applyError()) {
                      <p
                        class="text-sm text-destructive"
                        role="alert"
                        data-testid="code-profile-error"
                      >
                        {{ applyError() }}
                      </p>
                    }
                  }
                </div>
              </section>

              <!-- Module map -->
              <section class="flex flex-col gap-3" data-testid="code-modules">
                <div class="flex flex-col gap-1">
                  <h2 class="text-base font-semibold">{{ 'code.modules.title' | transloco }}</h2>
                  <p class="text-sm text-muted-foreground">
                    {{ 'code.modules.description' | transloco }}
                  </p>
                </div>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label
                    class="flex h-10 w-full min-w-0 cursor-text items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background sm:w-auto sm:flex-1"
                  >
                    <span class="sr-only">{{ 'code.modules.filter' | transloco }}</span>
                    <hlm-icon
                      name="lucideSearch"
                      size="15px"
                      class="shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      autocomplete="off"
                      spellcheck="false"
                      class="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      [value]="moduleFilter()"
                      (input)="moduleFilter.set($any($event.target).value)"
                      [placeholder]="'code.modules.filterPlaceholder' | transloco"
                      data-testid="code-modules-filter"
                    />
                  </label>
                  @if (readyRepositories().length > 1) {
                    <div
                      class="flex flex-wrap gap-1.5"
                      role="group"
                      [attr.aria-label]="'code.modules.repository' | transloco"
                    >
                      <button
                        type="button"
                        class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                        [class]="repoFilterClass(null)"
                        [attr.aria-pressed]="moduleRepo() === null"
                        (click)="moduleRepo.set(null)"
                        data-testid="code-modules-repo"
                      >
                        {{ 'code.modules.all' | transloco }}
                      </button>
                      @for (repo of readyRepositories(); track repo.id) {
                        <button
                          type="button"
                          class="max-w-full truncate rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                          [class]="repoFilterClass(repo.id)"
                          [attr.aria-pressed]="moduleRepo() === repo.id"
                          (click)="moduleRepo.set(repo.id)"
                          data-testid="code-modules-repo"
                        >
                          {{ repo.name }}
                        </button>
                      }
                    </div>
                  }
                </div>

                @for (group of moduleGroups(); track group.repo.id) {
                  <div class="flex flex-col gap-2" data-testid="code-modules-group">
                    @if (moduleGroups().length > 1) {
                      <p
                        class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground wrap-anywhere"
                      >
                        <hlm-icon name="lucideFolderGit2" size="13px" aria-hidden="true" />
                        {{ group.repo.fullName }}
                      </p>
                    }
                    @switch (group.state) {
                      @case ('loading') {
                        <div
                          class="rounded-2xl border border-border"
                          data-testid="code-modules-skeleton"
                        >
                          @for (i of skeletonRows; track i) {
                            <div
                              class="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-0"
                            >
                              <hlm-skeleton class="h-4 w-40 max-w-full" />
                              <hlm-skeleton class="h-3 w-full" />
                            </div>
                          }
                        </div>
                      }
                      @case ('error') {
                        <div class="flex flex-wrap items-center gap-3" role="alert">
                          <p class="text-sm text-destructive">
                            {{ 'code.modules.loadError' | transloco }}
                          </p>
                          <button
                            hlmBtn
                            size="sm"
                            variant="outline"
                            type="button"
                            (click)="reloadModules(group.repo)"
                          >
                            {{ 'discovery.retry' | transloco }}
                          </button>
                        </div>
                      }
                      @default {
                        @if (group.total === 0) {
                          <p
                            class="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
                            data-testid="code-modules-empty"
                          >
                            {{ 'code.modules.empty' | transloco }}
                          </p>
                        } @else if (group.modules.length === 0) {
                          <p
                            class="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
                            data-testid="code-modules-nomatch"
                          >
                            {{
                              'code.modules.noMatch' | transloco: { query: moduleFilter().trim() }
                            }}
                          </p>
                        } @else {
                          <ul
                            class="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card"
                          >
                            @for (module of group.modules; track module.id) {
                              @let open = isExpanded(module.id);
                              <li data-testid="code-module" [attr.data-expanded]="open">
                                <button
                                  type="button"
                                  class="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                  [attr.aria-expanded]="open"
                                  [attr.aria-controls]="'module-' + module.id"
                                  (click)="toggleModule(module.id)"
                                  data-testid="code-module-toggle"
                                >
                                  <span
                                    class="mt-0.5 grid shrink-0 place-items-center text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
                                    [class.-rotate-90]="!open"
                                    aria-hidden="true"
                                  >
                                    <hlm-icon name="lucideChevronDown" size="16px" />
                                  </span>
                                  <span class="flex min-w-0 flex-1 flex-col gap-1">
                                    <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                      <span
                                        class="font-medium text-foreground"
                                        data-testid="code-module-name"
                                        >{{ module.name }}</span
                                      >
                                      <span
                                        class="min-w-0 font-mono text-xs text-muted-foreground wrap-anywhere"
                                        data-testid="code-module-path"
                                        >{{
                                          module.path || ('code.modules.root' | transloco)
                                        }}</span
                                      >
                                    </span>
                                    @if (module.summary) {
                                      <span
                                        class="text-sm leading-relaxed text-muted-foreground"
                                        [class.line-clamp-2]="!open"
                                        >{{ module.summary }}</span
                                      >
                                    }
                                    @if (module.capabilities.length > 0) {
                                      <span class="mt-0.5 flex flex-wrap gap-1">
                                        @for (
                                          capability of capabilitiesOf(module, open);
                                          track $index
                                        ) {
                                          <span
                                            class="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                                            data-testid="code-module-capability"
                                            >{{ capability }}</span
                                          >
                                        }
                                        @if (
                                          !open && module.capabilities.length > capabilityPreview
                                        ) {
                                          <span class="px-1 py-0.5 text-xs text-muted-foreground">{{
                                            'code.modules.more'
                                              | transloco
                                                : {
                                                    count:
                                                      module.capabilities.length -
                                                      capabilityPreview,
                                                  }
                                          }}</span>
                                        }
                                      </span>
                                    }
                                  </span>
                                  @if (module.businessRules.length > 0) {
                                    <span
                                      class="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground tabular-nums sm:inline"
                                      >{{
                                        plural(
                                          'code.modules.rulesCount',
                                          module.businessRules.length
                                        ) | transloco: { count: module.businessRules.length }
                                      }}</span
                                    >
                                  }
                                </button>
                                @if (open) {
                                  <div
                                    [id]="'module-' + module.id"
                                    class="flex flex-col gap-4 px-4 pb-4 pl-11"
                                    data-testid="code-module-details"
                                  >
                                    @if (module.businessRules.length > 0) {
                                      <div class="flex flex-col gap-1.5">
                                        <h3 class="text-xs font-medium text-muted-foreground">
                                          {{ 'code.modules.rules' | transloco }}
                                        </h3>
                                        <ul
                                          class="flex flex-col gap-1.5"
                                          data-testid="code-module-rules"
                                        >
                                          @for (rule of module.businessRules; track $index) {
                                            <li
                                              class="flex items-start gap-2 text-sm leading-relaxed text-foreground"
                                              data-testid="code-module-rule"
                                            >
                                              <hlm-icon
                                                name="lucideShieldCheck"
                                                size="14px"
                                                class="mt-1 shrink-0 text-muted-foreground"
                                                aria-hidden="true"
                                              />
                                              <span class="min-w-0">{{ rule }}</span>
                                            </li>
                                          }
                                        </ul>
                                      </div>
                                    }
                                    @if (module.endpoints.length > 0) {
                                      <div class="flex flex-col gap-1.5">
                                        <h3 class="text-xs font-medium text-muted-foreground">
                                          {{ 'code.modules.endpoints' | transloco }}
                                        </h3>
                                        <ul
                                          class="flex flex-col gap-1"
                                          data-testid="code-module-endpoints"
                                        >
                                          @for (endpoint of module.endpoints; track $index) {
                                            <li
                                              class="font-mono text-xs leading-relaxed text-foreground wrap-anywhere"
                                            >
                                              {{ endpoint }}
                                            </li>
                                          }
                                        </ul>
                                      </div>
                                    }
                                    @if (module.entities.length > 0) {
                                      <div class="flex flex-col gap-1.5">
                                        <h3 class="text-xs font-medium text-muted-foreground">
                                          {{ 'code.modules.entities' | transloco }}
                                        </h3>
                                        <ul
                                          class="flex flex-wrap gap-1"
                                          data-testid="code-module-entities"
                                        >
                                          @for (entity of module.entities; track $index) {
                                            <li
                                              class="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-foreground"
                                            >
                                              {{ entity }}
                                            </li>
                                          }
                                        </ul>
                                      </div>
                                    }
                                    <div
                                      class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
                                    >
                                      <span class="tabular-nums">{{
                                        plural('code.repo.files', module.fileCount)
                                          | transloco: { count: module.fileCount }
                                      }}</span>
                                      @if (module.url) {
                                        <a
                                          [href]="module.url"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                          data-testid="code-module-link"
                                        >
                                          {{ 'code.modules.viewOnGithub' | transloco }}
                                          <hlm-icon
                                            name="lucideArrowUpRight"
                                            size="12px"
                                            aria-hidden="true"
                                          />
                                        </a>
                                      }
                                    </div>
                                  </div>
                                }
                              </li>
                            }
                          </ul>
                        }
                      }
                    }
                  </div>
                }
              </section>
            }
          }
        }
      }

      <app-modal [(open)]="removeOpen">
        <span modalTitle>{{ 'code.repo.removeTitle' | transloco }}</span>
        @if (removeTarget(); as target) {
          <p>{{ 'code.repo.removeBody' | transloco: { name: target.fullName } }}</p>
        }
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="removeOpen.set(false)"
        >
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="destructive"
          type="button"
          (click)="confirmRemove()"
          [disabled]="removing()"
          data-testid="code-remove-confirm"
        >
          @if (removing()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'code.repo.remove' | transloco }}
        </button>
      </app-modal>
    </div>

    <style>
      @media (prefers-reduced-motion: no-preference) {
        .code-indeterminate {
          animation: code-indeterminate 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite;
        }
      }
      @keyframes code-indeterminate {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(300%);
        }
      }
    </style>
  `,
})
export class ProjectCode implements OnInit, OnDestroy {
  private readonly api = inject(CodebaseApiService);
  private readonly workspaceApi = inject(WorkspaceApiService);
  private readonly workspace = inject(WorkspaceStore);
  private readonly auth = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly maxRepos = MAX_REPOSITORIES;
  protected readonly capabilityPreview = CAPABILITY_PREVIEW;
  protected readonly skeletonRows = [0, 1, 2];
  protected readonly emptyPoints = [
    { key: 'map', icon: 'lucideBoxes' },
    { key: 'meeting', icon: 'lucideSparkles' },
    { key: 'access', icon: 'lucideKeyRound' },
    { key: 'privacy', icon: 'lucideShieldCheck' },
  ] as const;

  protected readonly canWrite = computed(() => this.permissions.has('INTEGRATION_WRITE'));
  protected readonly canUpdateProject = computed(() => this.permissions.has('PROJECT_UPDATE'));

  // ---- Repositories ----
  protected readonly repositories = signal<CodeRepositoryResponse[]>([]);
  protected readonly listState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly atLimit = computed(() => this.repositories().length >= MAX_REPOSITORIES);
  protected readonly readyRepositories = computed(() =>
    this.repositories().filter((r) => r.status === 'READY'),
  );
  protected readonly reindexing = signal<readonly string[]>([]);
  protected readonly removeOpen = signal(false);
  protected readonly removeTarget = signal<CodeRepositoryResponse | null>(null);
  protected readonly removing = signal(false);
  private listSub?: Subscription;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  // ---- Connect panel ----
  protected readonly formOpen = signal(false);
  protected readonly canOpenForm = computed(
    () =>
      this.listState() === 'ready' &&
      this.canWrite() &&
      this.repositories().length > 0 &&
      !this.atLimit() &&
      !this.formOpen(),
  );

  // ---- Detected profile ----
  private readonly project = signal<ProjectResponse | null>(null);
  protected readonly detected = computed(() => aggregateProfile(this.repositories()));
  protected readonly profileEmpty = computed(() => isProfileEmpty(this.detected()));
  /** What applying would add; nothing until the project's current profile is known. */
  protected readonly additions = computed<ProfileAdditions>(() => {
    const project = this.project();
    return project
      ? profileAdditions(project, this.detected())
      : { languages: [], frameworks: [], databases: [], platforms: [] };
  });
  protected readonly projectLoaded = computed(() => this.project() !== null);
  protected readonly additionsTotal = computed(() => additionsCount(this.additions()));
  protected readonly additionsList = computed(() => {
    const a = this.additions();
    return [...a.languages, ...a.frameworks, ...a.databases, ...a.platforms].join(', ');
  });
  protected readonly profileGroups = computed<ProfileGroup[]>(() => {
    const detected = this.detected();
    const additions = this.additions();
    const groups: ProfileGroup[] = [
      {
        category: 'languages',
        labelKey: 'code.profile.languages',
        values: detected.languages,
        added: additions.languages,
      },
      {
        category: 'frameworks',
        labelKey: 'code.profile.frameworks',
        values: detected.frameworks,
        added: additions.frameworks,
      },
      {
        category: 'databases',
        labelKey: 'code.profile.databases',
        values: detected.databases,
        added: additions.databases,
      },
      {
        category: 'platforms',
        labelKey: 'code.profile.platforms',
        values: detected.platforms,
        added: additions.platforms,
      },
    ];
    return groups.filter((g) => g.values.length > 0);
  });
  protected readonly applying = signal(false);
  protected readonly applyError = signal<string | null>(null);
  protected readonly canApplyProfile = computed(
    () => !!this.project() && !this.applying() && this.additionsTotal() > 0,
  );

  // ---- Modules ----
  private readonly modules = signal<Readonly<Record<string, ModulesEntry>>>({});
  protected readonly moduleFilter = signal('');
  /** The repository the module map is narrowed to, or null for all. */
  protected readonly moduleRepo = signal<string | null>(null);
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly moduleGroups = computed(() => {
    const filter = this.moduleFilter();
    const only = this.moduleRepo();
    const entries = this.modules();
    return this.readyRepositories()
      .filter((repo) => only === null || repo.id === only)
      .map((repo) => {
        const entry = entries[repo.id];
        const list = entry?.list ?? [];
        return {
          repo,
          state: entry?.state ?? 'loading',
          total: list.length,
          modules: filterModules(list, filter),
        };
      });
  });

  ngOnInit(): void {
    // Back from installing the GitHub App: open the panel with the repositories it now shares (once;
    // a reload of this history entry does not reopen it).
    const state = history.state as { githubConnected?: boolean } | null;
    if (state?.githubConnected) {
      this.formOpen.set(true);
      history.replaceState({ ...state, githubConnected: false }, '');
    }
    this.loadRepositories();
    this.loadProject();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearPoll();
    this.listSub?.unsubscribe();
  }

  // ---- Repositories ----

  protected indexing(repo: CodeRepositoryResponse): boolean {
    return isIndexing(repo);
  }

  protected progress(repo: CodeRepositoryResponse): number | null {
    return indexingProgress(repo);
  }

  /** The singular or plural form of a counted label. */
  protected plural(key: string, count: number): string {
    return pluralKey(key, count);
  }

  protected statusLabel(repo: CodeRepositoryResponse): string {
    return statusKey(repo.status);
  }

  protected sha(repo: CodeRepositoryResponse): string | null {
    return shortSha(repo.commitSha);
  }

  protected retryLoad(): void {
    this.listState.set('loading');
    this.loadRepositories();
  }

  /** Loads the repositories, then keeps polling while one is indexing. */
  private loadRepositories(): void {
    this.listSub?.unsubscribe();
    this.listSub = this.api.listRepositories(this.projectId()).subscribe({
      next: (repos) => {
        this.applyRepositories(repos);
        this.listState.set('ready');
        this.schedulePoll();
      },
      error: () => {
        // A failed poll keeps the last known list and tries again; a failed first load says so.
        if (this.listState() === 'loading') this.listState.set('error');
        else this.schedulePoll();
      },
    });
  }

  private schedulePoll(): void {
    this.clearPoll();
    if (this.destroyed || !anyIndexing(this.repositories())) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      this.loadRepositories();
    }, INDEXING_POLL_MS);
  }

  private clearPoll(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  /** Puts the list in place (oldest first) and loads the modules of each newly ready repository. */
  private applyRepositories(repos: readonly CodeRepositoryResponse[]): void {
    const sorted = [...repos].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    this.repositories.set(sorted);
    const ids = new Set(sorted.map((r) => r.id));
    this.modules.update((entries) =>
      Object.fromEntries(Object.entries(entries).filter(([id]) => ids.has(id))),
    );
    if (this.moduleRepo() !== null && !sorted.some((r) => r.id === this.moduleRepo())) {
      this.moduleRepo.set(null);
    }
    for (const repo of sorted) {
      const key = modulesLoadKey(repo);
      if (key !== null && this.modules()[repo.id]?.key !== key) this.loadModules(repo, key);
    }
  }

  private loadModules(repo: CodeRepositoryResponse, key: string): void {
    this.modules.update((entries) => ({
      ...entries,
      [repo.id]: { key, state: 'loading', list: entries[repo.id]?.list ?? [] },
    }));
    this.api.listModules(this.projectId(), repo.id).subscribe({
      next: (list) => {
        if (this.modules()[repo.id]?.key !== key) return;
        this.modules.update((entries) => ({
          ...entries,
          [repo.id]: { key, state: 'ready', list },
        }));
      },
      error: () => {
        if (this.modules()[repo.id]?.key !== key) return;
        this.modules.update((entries) => ({
          ...entries,
          [repo.id]: { key, state: 'error', list: [] },
        }));
      },
    });
  }

  protected reloadModules(repo: CodeRepositoryResponse): void {
    const key = modulesLoadKey(repo);
    if (key !== null) this.loadModules(repo, key);
  }

  /** Reindexes a repository (also the "Reintentar" of a failed one); polling picks it up. */
  protected reindex(repo: CodeRepositoryResponse): void {
    if (this.reindexing().includes(repo.id)) return;
    this.reindexing.update((ids) => [...ids, repo.id]);
    const done = (): void => this.reindexing.update((ids) => ids.filter((id) => id !== repo.id));
    this.api.reindexRepository(this.projectId(), repo.id).subscribe({
      next: (updated) => {
        done();
        this.applyRepositories(this.repositories().map((r) => (r.id === updated.id ? updated : r)));
        this.toast.info(this.transloco.translate('code.repo.reindexStarted'));
        this.schedulePoll();
      },
      error: (err: unknown) => {
        done();
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  protected askRemove(repo: CodeRepositoryResponse): void {
    this.removeTarget.set(repo);
    this.removeOpen.set(true);
  }

  protected confirmRemove(): void {
    const target = this.removeTarget();
    if (!target || this.removing()) return;
    this.removing.set(true);
    this.api.removeRepository(this.projectId(), target.id).subscribe({
      next: () => {
        this.removing.set(false);
        this.removeOpen.set(false);
        this.applyRepositories(this.repositories().filter((r) => r.id !== target.id));
        this.schedulePoll();
        this.toast.success(this.transloco.translate('code.repo.removed'));
      },
      error: (err: unknown) => {
        this.removing.set(false);
        this.removeOpen.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  // ---- Connect ----

  protected openForm(): void {
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
  }

  /** A repository was connected from the panel: list it, and poll while it is indexed. */
  protected onConnected(repo: CodeRepositoryResponse): void {
    this.formOpen.set(false);
    this.applyRepositories([...this.repositories().filter((r) => r.id !== repo.id), repo]);
    this.toast.success(this.transloco.translate('code.connect.connected', { name: repo.fullName }));
    this.schedulePoll();
  }

  // ---- Detected profile ----

  private loadProject(): void {
    const orgId = this.auth.organizationId();
    if (!orgId) return;
    this.workspaceApi.getProject(orgId, this.projectId()).subscribe({
      next: (project) => this.project.set(project),
      error: () => undefined,
    });
  }

  protected isNew(group: ProfileGroup, value: string): boolean {
    return !!this.project() && isAddition(group.added, value);
  }

  /**
   * Adds the detected technology the project's profile lacks, keeping everything else of the
   * project as it is (the workspace update is a full PUT, so the current values are sent back).
   */
  protected applyProfile(): void {
    const orgId = this.auth.organizationId();
    const project = this.project();
    if (!orgId || !project || !this.canApplyProfile()) return;
    const added = this.additionsTotal();
    const stack = mergeProfile(project, this.additions());
    this.applying.set(true);
    this.applyError.set(null);
    this.workspaceApi
      .updateProject(orgId, project.id, {
        name: project.name,
        description: project.description || undefined,
        ...stack,
        architecture: project.architecture || undefined,
        domain: project.domain || undefined,
      })
      .subscribe({
        next: (updated) => {
          this.applying.set(false);
          this.project.set(updated);
          this.workspace.replaceProject(updated);
          this.toast.success(
            this.transloco.translate(pluralKey('code.profile.applied', added), { count: added }),
          );
        },
        error: (err: unknown) => {
          this.applying.set(false);
          const message = messageForError(err, this.transloco);
          this.applyError.set(message);
          this.toast.error(message);
        },
      });
  }

  // ---- Modules ----

  /** Every capability of an open module; the first few of a collapsed one. */
  protected capabilitiesOf(module: CodeModuleResponse, open: boolean): string[] {
    return open ? module.capabilities : module.capabilities.slice(0, CAPABILITY_PREVIEW);
  }

  protected isExpanded(moduleId: string): boolean {
    return this.expanded().has(moduleId);
  }

  protected toggleModule(moduleId: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  protected repoFilterClass(repoId: string | null): string {
    return this.moduleRepo() === repoId
      ? 'border-foreground bg-foreground text-background'
      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground';
  }
}
