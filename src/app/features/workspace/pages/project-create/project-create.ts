import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { rememberReturnPath } from '../../../../core/navigation/return-path';
import { WorkspaceStore } from '../../data/workspace.store';
import { messageForError } from '../../../../core/errors/error-message';
import { AnimatedBackdrop } from '../../../../shared/components/animated-backdrop/animated-backdrop';
import { CreatePageHeader } from '../../../../shared/components/create-page-header/create-page-header';
import { ChipInput } from '../../../../shared/components/chip-input/chip-input';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';
import { GITHUB_RETURN_KEY } from '../../../discovery/data/codebase';
import { JIRA_RETURN_KEY } from '../../data/integrations.models';
import {
  JiraDraft,
  PickedRepository,
  ProjectDraft,
  buildSources,
  discardDraft,
  emptyDraft,
  jiraIncomplete,
  saveDraft,
  takeDraft,
} from '../../data/project-setup';
import { ProjectSourcesStep } from '../../components/project-sources-step/project-sources-step';

/**
 * Dedicated "new project" page (no app shell): only the name is required (and says so); the
 * technical profile is one clearly optional, collapsible section grouped into business context
 * (domain, architecture) and tech stack (chip lists). Placeholders read as examples ("e.g. …"),
 * never as pre-filled values. The backend accepts a name-only project.
 */
@Component({
  selector: 'app-project-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AnimatedBackdrop,
    CreatePageHeader,
    ChipInput,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
    ProjectSourcesStep,
  ],
  viewProviders: [provideIcons({ lucideCheck, lucideChevronDown })],
  template: `
    <div
      class="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <!-- Decorative, interactive background matching the onboarding composition. -->
      <app-animated-backdrop />

      <app-create-page-header backHref="/projects" [logoSize]="24" />

      <main
        class="relative z-10 flex flex-1 justify-center px-4 py-10"
        [class.items-center]="!showAdvanced()"
        [class.items-start]="showAdvanced()"
      >
        <div class="w-full max-w-2xl">
          <div class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight">
              {{ 'projectCreate.title' | transloco }}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ 'projectCreate.subtitle' | transloco }}
            </p>
          </div>

          <ol
            class="mb-6 flex items-center gap-2 text-sm"
            [attr.aria-label]="'projectCreate.steps.label' | transloco"
            data-testid="project-create-steps"
          >
            @for (item of stepItems; track item.n; let last = $last) {
              <li
                class="flex items-center gap-2"
                [class.text-foreground]="step() >= item.n"
                [class.text-muted-foreground]="step() < item.n"
                [attr.aria-current]="step() === item.n ? 'step' : null"
              >
                <span
                  class="grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium"
                  [class.border-primary]="step() >= item.n"
                  [class.bg-primary]="step() > item.n"
                  [class.text-primary-foreground]="step() > item.n"
                  [class.border-border]="step() < item.n"
                  aria-hidden="true"
                >
                  @if (step() > item.n) {
                    <hlm-icon name="lucideCheck" size="12px" />
                  } @else {
                    {{ item.n }}
                  }
                </span>
                <span
                  [class.font-medium]="step() === item.n"
                  [class.hidden]="step() !== item.n"
                  class="sm:inline"
                  >{{ item.key | transloco }}</span
                >
                @if (!last) {
                  <span class="mx-1 h-px w-5 bg-border sm:w-8" aria-hidden="true"></span>
                }
              </li>
            }
          </ol>

          @if (step() === 1) {
            <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5">
              <div class="flex flex-col gap-2">
                <div class="flex items-baseline justify-between gap-3">
                  <label hlmLabel for="name">{{ 'projects.name' | transloco }}</label>
                  <span class="text-xs text-muted-foreground">{{
                    'common.required' | transloco
                  }}</span>
                </div>
                <input
                  hlmInput
                  id="name"
                  formControlName="name"
                  aria-required="true"
                  [placeholder]="'projectCreate.namePlaceholder' | transloco"
                />
              </div>

              <!-- Everything below is optional context for the AI, grouped by what it
                 describes instead of eight loose fields. -->
              <button
                type="button"
                (click)="showAdvanced.set(!showAdvanced())"
                [attr.aria-expanded]="showAdvanced()"
                aria-controls="project-tech-profile"
                class="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
                data-testid="project-create-advanced"
              >
                <span class="min-w-0">
                  <span
                    class="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground"
                  >
                    {{ 'projectCreate.advanced' | transloco }}
                    <span
                      class="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >{{ 'common.optional' | transloco }}</span
                    >
                  </span>
                  <span class="mt-0.5 block text-xs text-muted-foreground">
                    {{ 'projectCreate.advancedHint' | transloco }}
                  </span>
                </span>
                <hlm-icon
                  name="lucideChevronDown"
                  size="16px"
                  class="shrink-0 text-muted-foreground transition-transform"
                  [class.rotate-180]="showAdvanced()"
                />
              </button>

              @if (showAdvanced()) {
                <div
                  id="project-tech-profile"
                  class="flex flex-col gap-6 rounded-xl border border-border bg-card/70 p-4 sm:p-5"
                >
                  <div class="flex flex-col gap-2">
                    <label hlmLabel for="description">{{
                      'projects.description' | transloco
                    }}</label>
                    <textarea
                      hlmInput
                      id="description"
                      rows="2"
                      formControlName="description"
                      [placeholder]="'projectCreate.descriptionPlaceholder' | transloco"
                    ></textarea>
                  </div>

                  <fieldset class="flex flex-col gap-3">
                    <legend hlmLabel class="mb-3 text-sm font-semibold">
                      {{ 'projectCreate.contextGroup' | transloco }}
                    </legend>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <div class="flex flex-col gap-2">
                        <label hlmLabel for="domain">{{ 'projects.domain' | transloco }}</label>
                        <input
                          hlmInput
                          id="domain"
                          formControlName="domain"
                          [placeholder]="'projectCreate.example' | transloco: { value: 'Fintech' }"
                        />
                      </div>
                      <div class="flex flex-col gap-2">
                        <label hlmLabel for="architecture">{{
                          'projects.architecture' | transloco
                        }}</label>
                        <input
                          hlmInput
                          id="architecture"
                          formControlName="architecture"
                          [placeholder]="
                            'projectCreate.example' | transloco: { value: 'Hexagonal' }
                          "
                        />
                      </div>
                    </div>
                  </fieldset>

                  <fieldset class="flex flex-col gap-3">
                    <legend hlmLabel class="mb-1 text-sm font-semibold">
                      {{ 'projectCreate.stackGroup' | transloco }}
                    </legend>
                    <p id="project-chip-hint" class="text-xs text-muted-foreground">
                      {{ 'projectCreate.chipHint' | transloco }}
                    </p>
                    <div class="grid gap-4 sm:grid-cols-2">
                      @for (f of chipFields; track f.key) {
                        <div class="flex flex-col gap-2">
                          <label hlmLabel [for]="'chip-' + f.key">{{
                            f.labelKey | transloco
                          }}</label>
                          <app-chip-input
                            [inputId]="'chip-' + f.key"
                            describedBy="project-chip-hint"
                            [value]="f.list()"
                            (valueChange)="f.list.set($event)"
                            [placeholder]="
                              'projectCreate.example' | transloco: { value: f.placeholder }
                            "
                          />
                        </div>
                      }
                    </div>
                  </fieldset>
                </div>
              }

              @if (errorMessage()) {
                <p class="text-sm text-destructive" data-testid="form-error">
                  {{ errorMessage() }}
                </p>
              }

              <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  hlmBtn
                  variant="outline"
                  type="submit"
                  [disabled]="form.invalid || loading()"
                  data-testid="project-create-submit"
                >
                  @if (loading()) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'projects.createCta' | transloco }}
                </button>
                <button
                  hlmBtn
                  type="button"
                  [disabled]="form.invalid || loading()"
                  (click)="goTo(2)"
                  data-testid="project-create-next"
                >
                  {{ 'projectCreate.steps.next' | transloco }}
                </button>
              </div>
            </form>
          } @else if (step() === 2) {
            <div class="flex flex-col gap-8" data-testid="project-create-sources">
              <div>
                <h2
                  id="project-step-title"
                  tabindex="-1"
                  class="text-lg font-semibold outline-none"
                >
                  {{ 'projectCreate.sources.title' | transloco }}
                </h2>
                <p class="mt-1 max-w-[65ch] text-sm text-muted-foreground">
                  {{ 'projectCreate.sources.subtitle' | transloco }}
                </p>
              </div>
              <app-project-sources-step
                [(jira)]="jira"
                [(picks)]="picks"
                (leaving)="leave($event)"
              />
              <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button hlmBtn variant="ghost" type="button" (click)="goTo(1)">
                  {{ 'projectCreate.steps.back' | transloco }}
                </button>
                <button
                  hlmBtn
                  type="button"
                  [disabled]="jiraPending()"
                  (click)="goTo(3)"
                  data-testid="project-create-review"
                >
                  {{ 'projectCreate.steps.next' | transloco }}
                </button>
              </div>
              @if (jiraPending()) {
                <p class="-mt-4 text-right text-xs text-muted-foreground" role="status">
                  {{ 'projectCreate.sources.jira.incomplete' | transloco }}
                </p>
              }
            </div>
          } @else {
            <div class="flex flex-col gap-6" data-testid="project-create-confirm">
              <div>
                <h2
                  id="project-step-title"
                  tabindex="-1"
                  class="text-lg font-semibold outline-none"
                >
                  {{ 'projectCreate.confirm.title' | transloco }}
                </h2>
                <p class="mt-1 max-w-[65ch] text-sm text-muted-foreground">
                  {{
                    (hasSources()
                      ? 'projectCreate.confirm.withSources'
                      : 'projectCreate.confirm.withoutSources'
                    ) | transloco
                  }}
                </p>
              </div>
              <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
                <dt class="text-muted-foreground">{{ 'projects.name' | transloco }}</dt>
                <dd class="font-medium wrap-anywhere">{{ form.getRawValue().name }}</dd>
                @if (jiraSummary(); as jiraText) {
                  <dt class="text-muted-foreground">Jira</dt>
                  <dd data-testid="project-create-summary-jira">
                    {{ jiraText }}
                    @if (jira().importStories) {
                      <span class="text-muted-foreground">
                        · {{ 'projectCreate.confirm.importStories' | transloco }}</span
                      >
                    }
                  </dd>
                }
                @if (picks().length > 0) {
                  <dt class="text-muted-foreground">GitHub</dt>
                  <dd data-testid="project-create-summary-github">
                    <ul class="flex flex-col gap-1">
                      @for (repo of picks(); track repo.fullName) {
                        <li class="wrap-anywhere">
                          {{ repo.fullName }}
                          @if (repo.branch.trim()) {
                            <span class="text-muted-foreground">· {{ repo.branch.trim() }}</span>
                          }
                        </li>
                      }
                    </ul>
                  </dd>
                }
              </dl>
              @if (errorMessage()) {
                <p class="text-sm text-destructive" role="alert" data-testid="form-error">
                  {{ errorMessage() }}
                </p>
              }
              <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button
                  hlmBtn
                  variant="ghost"
                  type="button"
                  (click)="goTo(2)"
                  [disabled]="loading()"
                >
                  {{ 'projectCreate.steps.back' | transloco }}
                </button>
                <button
                  hlmBtn
                  type="button"
                  (click)="submit()"
                  [disabled]="loading()"
                  data-testid="project-create-confirm-submit"
                >
                  @if (loading()) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'projects.createCta' | transloco }}
                </button>
              </div>
            </div>
          }
        </div>
      </main>
    </div>
  `,
})
export class ProjectCreate {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly store = inject(WorkspaceStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showAdvanced = signal(false);
  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly stepItems = [
    { n: 1, key: 'projectCreate.steps.basics' },
    { n: 2, key: 'projectCreate.steps.sources' },
    { n: 3, key: 'projectCreate.steps.confirm' },
  ];
  protected readonly jira = signal<JiraDraft>(emptyDraft().jira);
  protected readonly picks = signal<PickedRepository[]>([]);
  protected readonly jiraPending = computed(() => jiraIncomplete(this.jira()));
  protected readonly hasSources = computed(
    () => this.jiraSummary() !== null || this.picks().length > 0,
  );
  protected readonly jiraSummary = computed(() => {
    const jira = this.jira();
    return jira.enabled && jira.projectKey && jira.issueTypeName
      ? `${jira.projectKey} · ${jira.issueTypeName}`
      : null;
  });

  protected readonly programmingLanguages = signal<string[]>([]);
  protected readonly frameworks = signal<string[]>([]);
  protected readonly clientPlatforms = signal<string[]>([]);
  protected readonly databases = signal<string[]>([]);

  protected readonly chipFields = [
    {
      key: 'lang',
      labelKey: 'projects.programmingLanguages',
      placeholder: 'TypeScript',
      list: this.programmingLanguages,
    },
    { key: 'fw', labelKey: 'projects.frameworks', placeholder: 'Angular', list: this.frameworks },
    {
      key: 'plat',
      labelKey: 'projects.clientPlatforms',
      placeholder: 'Web',
      list: this.clientPlatforms,
    },
    { key: 'db', labelKey: 'projects.databases', placeholder: 'PostgreSQL', list: this.databases },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(2000)]],
    architecture: ['', [Validators.maxLength(100)]],
    domain: ['', [Validators.maxLength(100)]],
  });

  constructor() {
    // Coming back from GitHub or Atlassian: pick the wizard up where it was left.
    const draft = takeDraft();
    if (draft) this.restore(draft);
  }

  protected goTo(step: 1 | 2 | 3): void {
    if (step > 1 && this.form.invalid) return;
    this.errorMessage.set(null);
    this.step.set(step);
    // The new step's heading takes focus so a screen reader announces where it landed.
    setTimeout(() => document.getElementById('project-step-title')?.focus());
  }

  /** Keeps the wizard across the full-page trip to GitHub, Atlassian or the settings. */
  protected leave(kind: 'jira' | 'github' | 'settings'): void {
    saveDraft(this.draft(2));
    if (kind === 'jira') rememberReturnPath(JIRA_RETURN_KEY, '/projects/new');
    if (kind === 'github') rememberReturnPath(GITHUB_RETURN_KEY, '/projects/new');
  }

  private draft(step: 1 | 2 | 3): ProjectDraft {
    const raw = this.form.getRawValue();
    return {
      step,
      name: raw.name,
      description: raw.description,
      domain: raw.domain,
      architecture: raw.architecture,
      programmingLanguages: this.programmingLanguages(),
      frameworks: this.frameworks(),
      clientPlatforms: this.clientPlatforms(),
      databases: this.databases(),
      showAdvanced: this.showAdvanced(),
      jira: this.jira(),
      repositories: this.picks(),
    };
  }

  private restore(draft: ProjectDraft): void {
    this.form.setValue({
      name: draft.name,
      description: draft.description,
      architecture: draft.architecture,
      domain: draft.domain,
    });
    this.programmingLanguages.set(draft.programmingLanguages);
    this.frameworks.set(draft.frameworks);
    this.clientPlatforms.set(draft.clientPlatforms);
    this.databases.set(draft.databases);
    this.showAdvanced.set(draft.showAdvanced);
    this.jira.set(draft.jira);
    this.picks.set(draft.repositories);
    this.step.set(draft.name.trim() ? draft.step : 1);
  }

  protected submit(): void {
    const orgId = this.authStore.organizationId();
    if (this.form.invalid || this.loading() || !orgId) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    const raw = this.form.getRawValue();
    this.store
      .createProject(orgId, {
        name: raw.name,
        description: raw.description || undefined,
        programmingLanguages: this.programmingLanguages(),
        frameworks: this.frameworks(),
        clientPlatforms: this.clientPlatforms(),
        databases: this.databases(),
        architecture: raw.architecture || undefined,
        domain: raw.domain || undefined,
        sources: buildSources(this.draft(this.step())),
      })
      .subscribe({
        next: (project) => {
          discardDraft();
          void this.router.navigate(['/projects', project.id]);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.errorMessage.set(messageForError(err, this.transloco));
        },
      });
  }
}
