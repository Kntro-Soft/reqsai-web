import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideGlobe, lucideLockKeyhole, lucideSearch } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmIcon, HlmInput } from '../../../../shared/ui';
import { GitHubRepositoryResponse } from '../../data/codebase.models';
import { filterGitHubRepositories } from '../../data/codebase';
import {
  PickedRepository,
  isPicked,
  setPickBranch,
  togglePick,
} from '../../../workspace/data/project-setup';

/**
 * Picks up to `max` repositories from what the organization's GitHub App shares, for a project that
 * does not exist yet: a filterable checklist, and for each picked repository an optional branch. Pure
 * view over `repositories`; the picks are two-way bound through `picks`.
 */
@Component({
  selector: 'app-repository-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, HlmIcon, HlmInput],
  viewProviders: [provideIcons({ lucideGlobe, lucideLockKeyhole, lucideSearch })],
  host: { class: 'flex flex-col gap-3' },
  template: `
    <label
      class="flex h-10 w-full min-w-0 cursor-text items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
    >
      <span class="sr-only">{{ 'code.github.filter' | transloco }}</span>
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
        [value]="filter()"
        (input)="filter.set($any($event.target).value)"
        [placeholder]="'code.github.filter' | transloco"
        data-testid="repo-picker-filter"
      />
    </label>

    <p class="text-xs text-muted-foreground" aria-live="polite" data-testid="repo-picker-count">
      {{ 'projectCreate.sources.github.count' | transloco: { count: picks().length, max: max() } }}
    </p>

    <fieldset class="min-w-0">
      <legend class="sr-only">{{ 'projectCreate.sources.github.pick' | transloco }}</legend>
      @if (visible().length === 0) {
        <p class="py-3 text-sm text-muted-foreground">
          {{ 'code.github.noMatch' | transloco: { query: filter().trim() } }}
        </p>
      } @else {
        <ul class="flex max-h-72 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1">
          @for (repo of visible(); track repo.installationId + ':' + repo.fullName) {
            <li>
              <label
                [class]="rowClass(repo)"
                data-testid="repo-picker-row"
                [attr.data-full-name]="repo.fullName"
              >
                <input
                  type="checkbox"
                  class="mt-1 size-4 shrink-0 accent-primary"
                  [checked]="picked(repo)"
                  [disabled]="disabled() || (!picked(repo) && full())"
                  (change)="toggle(repo)"
                />
                <hlm-icon
                  [name]="repo.private ? 'lucideLockKeyhole' : 'lucideGlobe'"
                  size="15px"
                  class="mt-0.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="flex flex-wrap items-center gap-x-2">
                    <span class="font-medium wrap-anywhere">{{ repo.fullName }}</span>
                    <span class="sr-only">
                      · {{ (repo.private ? 'code.repo.private' : 'code.repo.public') | transloco }}
                    </span>
                  </span>
                  @if (repo.description) {
                    <span class="line-clamp-1 text-xs text-muted-foreground">{{
                      repo.description
                    }}</span>
                  }
                </span>
              </label>
              @if (picked(repo)) {
                <div class="mt-1.5 ml-9 flex items-center gap-2">
                  <label class="shrink-0 text-xs text-muted-foreground" [for]="branchId(repo)">{{
                    'code.connect.branch' | transloco
                  }}</label>
                  <input
                    hlmInput
                    class="h-8 max-w-56 text-xs"
                    [id]="branchId(repo)"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    maxlength="255"
                    [value]="branchOf(repo)"
                    (input)="setBranch(repo, $any($event.target).value)"
                    [placeholder]="repo.defaultBranch"
                    [disabled]="disabled()"
                    data-testid="repo-picker-branch"
                  />
                </div>
              }
            </li>
          }
        </ul>
      }
    </fieldset>
  `,
})
export class RepositoryPicker {
  /** What the organization's installations share. */
  readonly repositories = input.required<GitHubRepositoryResponse[]>();
  readonly picks = model<PickedRepository[]>([]);
  readonly max = input(3);
  readonly disabled = input(false);

  protected readonly filter = signal('');
  protected readonly visible = computed(() =>
    filterGitHubRepositories(this.repositories(), this.filter()),
  );
  protected readonly full = computed(() => this.picks().length >= this.max());

  protected picked(repo: GitHubRepositoryResponse): boolean {
    return isPicked(this.picks(), repo);
  }

  protected toggle(repo: GitHubRepositoryResponse): void {
    this.picks.set(togglePick(this.picks(), repo, this.max()));
  }

  protected branchOf(repo: GitHubRepositoryResponse): string {
    return this.picks().find((p) => isPicked([p], repo))?.branch ?? '';
  }

  protected setBranch(repo: GitHubRepositoryResponse, branch: string): void {
    this.picks.set(setPickBranch(this.picks(), repo, branch));
  }

  protected branchId(repo: GitHubRepositoryResponse): string {
    return `repo-branch-${repo.installationId}-${repo.fullName.replace(/[^A-Za-z0-9]/g, '-')}`;
  }

  protected rowClass(repo: GitHubRepositoryResponse): string {
    const base =
      'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ';
    if (this.picked(repo)) return base + 'cursor-pointer border-primary bg-primary/5';
    if (this.full() || this.disabled()) return base + 'cursor-not-allowed border-border opacity-60';
    return base + 'cursor-pointer border-border hover:bg-accent';
  }
}
