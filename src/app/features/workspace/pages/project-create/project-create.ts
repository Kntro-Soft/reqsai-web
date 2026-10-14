import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { rememberReturnPath } from '../../../../core/navigation/return-path';
import { CodebaseApiService } from '../../../discovery/data/codebase-api.service';
import { ProjectProfileResponse } from '../../../discovery/data/codebase.models';
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
  EMPTY_SOURCE_PROFILE,
  SourceProfile,
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
                <button
                  type="button"
                  class="w-fit text-left text-xs font-medium text-primary hover:underline"
                  (click)="startFromSources()"
                  data-testid="project-create-from-sources"
                >
                  {{ 'projectCreate.fromSources.link' | transloco }}
                </button>
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
                (profile)="sourceProfile.set($event)"
                (jiraProject)="jiraProject.set($event)"
                (leaving)="leave($event)"
              />
              @if (hasSourceSelection()) {
                <p
                  class="max-w-[65ch] text-sm text-muted-foreground"
                  data-testid="project-create-autofill-hint"
                >
                  {{ 'projectCreate.fromSources.hint' | transloco }}
                </p>
              }
              <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button hlmBtn variant="ghost" type="button" (click)="goTo(1)">
                  {{ 'projectCreate.steps.back' | transloco }}
                </button>
                <button
                  hlmBtn
                  type="button"
                  [disabled]="
                    jiraPending() || generating() || (fromSources() && !canNameFromSources())
                  "
                  (click)="goTo(3)"
                  data-testid="project-create-review"
                >
                  @if (generating()) {
                    <hlm-spinner class="h-4 w-4" />
                    {{ 'projectCreate.fromSources.generating' | transloco }}
                  } @else {
                    {{ 'projectCreate.steps.next' | transloco }}
                  }
                </button>
              </div>
              @if (fromSources() && !canNameFromSources() && !jiraPending()) {
                <p class="-mt-4 text-right text-xs text-muted-foreground" role="status">
                  {{ 'projectCreate.fromSources.needName' | transloco }}
                </p>
              }
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
                @if (proposalGenerated()) {
                  <p
                    class="mt-1 text-xs font-medium text-primary"
                    data-testid="project-create-ai-note"
                  >
                    {{ 'projectCreate.fromSources.aiNote' | transloco }}
                  </p>
                }
              </div>
              <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
                <dt class="text-muted-foreground">{{ 'projects.name' | transloco }}</dt>
                <dd class="font-medium wrap-anywhere">{{ form.getRawValue().name }}</dd>
                @if (form.getRawValue().description; as description) {
                  <dt class="text-muted-foreground">{{ 'projects.description' | transloco }}</dt>
                  <dd class="wrap-anywhere" data-testid="project-create-summary-description">
                    {{ description }}
                  </dd>
                }
                @if (profileLine(); as line) {
                  <dt class="text-muted-foreground">
                    {{ 'projectCreate.fromSources.profile' | transloco }}
                  </dt>
                  <dd class="wrap-anywhere" data-testid="project-create-summary-profile">
                    {{ line }}
                  </dd>
                }
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
  private readonly codebase = inject(CodebaseApiService);
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

  /** What the chosen sources say about the project; the wizard fills the basics from it on the way to the review. */
  protected readonly sourceProfile = signal<SourceProfile>(EMPTY_SOURCE_PROFILE);
  /** The person started from Jira or GitHub, so the name may come from them. */
  protected readonly fromSources = signal(false);
  /** The Jira project picked in the sources step, for the proposal. */
  protected readonly jiraProject = signal<{ name: string; description: string | null } | null>(
    null,
  );
  /** The AI proposal was asked for and answered (not just the sources' metadata). */
  protected readonly proposalGenerated = signal(false);
  protected readonly generating = signal(false);
  /** The sources the current proposal was made for, so going back and forth does not ask again. */
  private proposedFor: string | null = null;
  protected readonly hasProfile = computed(() => {
    const p = this.sourceProfile();
    return p.name !== null || p.description !== null || p.languages.length > 0;
  });
  protected readonly hasSourceSelection = computed(
    () => this.jiraSummary() !== null || this.picks().length > 0,
  );

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

  /** Starts from the sources: the name is optional until they have been picked. */
  protected startFromSources(): void {
    this.fromSources.set(true);
    this.goTo(2);
  }

  /** Whether the review can be reached: a name typed, or sources the proposal can name it from. */
  protected canNameFromSources(): boolean {
    return this.form.controls.name.value.trim() !== '' || this.hasSourceSelection();
  }

  /** The technical profile as one line, for the review. */
  protected profileLine(): string {
    const parts = [
      this.form.getRawValue().domain,
      this.form.getRawValue().architecture,
      ...this.programmingLanguages(),
      ...this.frameworks(),
      ...this.clientPlatforms(),
      ...this.databases(),
    ].filter((part) => part.trim() !== '');
    return parts.join(' · ');
  }

  /**
   * Asks the AI for the project's profile from the picked sources and fills in what is still empty: a name
   * typed by the person is kept. When the AI cannot answer (allowance spent, no model, an outage) the
   * wizard fills in what the sources' metadata says instead, so continuing never fails on it.
   */
  private propose(next: () => void): void {
    const orgId = this.authStore.organizationId();
    const picks = this.picks();
    const jira = this.jira().enabled ? this.jiraProject() : null;
    const key = JSON.stringify([picks.map((p) => [p.installationId, p.fullName]), jira?.name]);
    if (!orgId || (picks.length === 0 && !jira)) {
      this.applyProfile(this.sourceProfileAsResponse());
      next();
      return;
    }
    if (this.proposedFor === key) {
      next();
      return;
    }
    this.generating.set(true);
    this.codebase
      .proposeProjectProfile(orgId, {
        repositories: picks.map((p) => ({
          installationId: p.installationId,
          fullName: p.fullName,
        })),
        jiraName: jira?.name ?? null,
        jiraDescription: jira?.description ?? null,
        language: this.transloco.getActiveLang(),
      })
      .subscribe({
        next: (profile) => {
          this.applyProfile(profile);
          this.proposedFor = key;
          this.generating.set(false);
          next();
        },
        error: () => {
          this.applyProfile(this.sourceProfileAsResponse());
          this.generating.set(false);
          next();
        },
      });
  }

  private sourceProfileAsResponse(): ProjectProfileResponse {
    const p = this.sourceProfile();
    return {
      generated: false,
      name: p.name,
      description: p.description,
      domain: null,
      architecture: null,
      programmingLanguages: p.languages,
      frameworks: [],
      clientPlatforms: [],
      databases: [],
    };
  }

  /** Fills in what is empty; lists are merged without repeating an entry. */
  private applyProfile(profile: ProjectProfileResponse): void {
    const form = this.form.controls;
    const fill = (control: typeof form.name, value: string | null, max: number) => {
      if (value && control.value.trim() === '') control.setValue(value.slice(0, max));
    };
    fill(form.name, profile.name, 150);
    fill(form.description, profile.description, 2000);
    fill(form.domain, profile.domain, 100);
    fill(form.architecture, profile.architecture, 100);
    const merge = (list: ReturnType<typeof signal<string[]>>, values: string[]) => {
      const merged = [...list()];
      for (const value of values) {
        if (!merged.some((known) => known.toLowerCase() === value.toLowerCase()))
          merged.push(value);
      }
      list.set(merged);
    };
    merge(this.programmingLanguages, profile.programmingLanguages);
    merge(this.frameworks, profile.frameworks);
    merge(this.clientPlatforms, profile.clientPlatforms);
    merge(this.databases, profile.databases);
    this.proposalGenerated.set(profile.generated);
    if (profile.domain || profile.architecture) this.showAdvanced.set(true);
  }

  protected goTo(step: 1 | 2 | 3): void {
    if (this.generating()) return;
    if (step === 3 && this.step() === 2) {
      this.propose(() => this.move(3));
      return;
    }
    this.move(step);
  }

  private move(step: 1 | 2 | 3): void {
    if (step > 1 && this.form.invalid && !(step === 2 && this.fromSources())) return;
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
      fromSources: this.fromSources(),
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
    this.fromSources.set(draft.fromSources);
    this.step.set(draft.name.trim() || draft.fromSources ? draft.step : 1);
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
