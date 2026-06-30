import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '../../../../shared/ui';

const toList = (value: string): string[] =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/** Project settings: editable name, description and tech stack. */
@Component({
  selector: 'app-project-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  template: `
    <div class="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'projectSettings.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'projectSettings.subtitle' | transloco }}
        </p>
      </div>

      <div hlmCard>
        <div hlmCardContent class="pt-6">
          @if (state() === 'loading') {
            <div class="flex justify-center py-8"><hlm-spinner class="h-5 w-5" /></div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="name">{{ 'projects.name' | transloco }}</label>
                <input hlmInput id="name" formControlName="name" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="description">{{ 'projects.description' | transloco }}</label>
                <input hlmInput id="description" formControlName="description" />
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="programmingLanguages">{{
                    'projects.programmingLanguages' | transloco
                  }}</label>
                  <input
                    hlmInput
                    id="programmingLanguages"
                    formControlName="programmingLanguages"
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="frameworks">{{ 'projects.frameworks' | transloco }}</label>
                  <input hlmInput id="frameworks" formControlName="frameworks" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="clientPlatforms">{{
                    'projects.clientPlatforms' | transloco
                  }}</label>
                  <input hlmInput id="clientPlatforms" formControlName="clientPlatforms" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="databases">{{ 'projects.databases' | transloco }}</label>
                  <input hlmInput id="databases" formControlName="databases" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="architecture">{{
                    'projects.architecture' | transloco
                  }}</label>
                  <input hlmInput id="architecture" formControlName="architecture" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="domain">{{ 'projects.domain' | transloco }}</label>
                  <input hlmInput id="domain" formControlName="domain" />
                </div>
              </div>

              @if (errorMessage()) {
                <p class="text-sm text-destructive" data-testid="form-error">
                  {{ errorMessage() }}
                </p>
              }
              @if (saved()) {
                <p class="text-sm text-emerald-500" data-testid="settings-saved">
                  {{ 'projectSettings.saved' | transloco }}
                </p>
              }

              <div class="mt-2 flex justify-end">
                <button
                  hlmBtn
                  type="submit"
                  [disabled]="form.invalid || saving()"
                  data-testid="settings-save"
                >
                  @if (saving()) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'projectSettings.save' | transloco }}
                </button>
              </div>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class ProjectSettings implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: [''],
    programmingLanguages: ['', [Validators.required]],
    frameworks: ['', [Validators.required]],
    clientPlatforms: ['', [Validators.required]],
    databases: ['', [Validators.required]],
    architecture: ['', [Validators.required]],
    domain: ['', [Validators.required]],
  });

  ngOnInit(): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.api.getProject(orgId, this.projectId()).subscribe({
      next: (project) => {
        this.form.patchValue({
          name: project.name,
          description: project.description ?? '',
          programmingLanguages: project.programmingLanguages.join(', '),
          frameworks: project.frameworks.join(', '),
          clientPlatforms: project.clientPlatforms.join(', '),
          databases: project.databases.join(', '),
          architecture: project.architecture,
          domain: project.domain,
        });
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected save(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.saved.set(false);
    this.errorMessage.set(null);
    const v = this.form.getRawValue();
    this.api
      .updateProject(orgId, this.projectId(), {
        name: v.name,
        description: v.description || undefined,
        programmingLanguages: toList(v.programmingLanguages),
        frameworks: toList(v.frameworks),
        clientPlatforms: toList(v.clientPlatforms),
        databases: toList(v.databases),
        architecture: v.architecture,
        domain: v.domain,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.errorMessage.set(
            this.transloco.translate(
              err.status === 400
                ? 'projectSettings.errorValidation'
                : 'projectSettings.errorGeneric',
            ),
          );
        },
      });
  }
}
