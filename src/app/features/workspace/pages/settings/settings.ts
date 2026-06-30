import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { UpdateOrganizationRequest } from '../../data/workspace.models';
import { HlmButton, HlmCard, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

type OrgField = 'name' | 'meetingLanguage' | 'audioRetentionDays';

/**
 * Organization settings, Vercel-style: one card per setting, each with its own Save that PATCHes
 * only that field (the backend org update is a partial PATCH).
 */
@Component({
  selector: 'app-org-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, HlmButton, HlmCard, HlmInput, HlmLabel, HlmSpinner, TranslocoPipe],
  template: `
    <div class="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'orgSettings.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'orgSettings.subtitle' | transloco }}</p>
      </div>

      @if (state() === 'loading') {
        <div hlmCard>
          <div class="flex justify-center py-10"><hlm-spinner class="h-5 w-5" /></div>
        </div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'orgSettings.errorGeneric' | transloco }}</p>
      } @else {
        <div [formGroup]="form" class="flex flex-col gap-6">
          <!-- Name -->
          <section hlmCard class="overflow-hidden">
            <div class="flex flex-col gap-3 p-6">
              <div>
                <label hlmLabel for="name" class="text-base font-semibold">
                  {{ 'orgSettings.name' | transloco }}
                </label>
                <p class="mt-1 text-sm text-muted-foreground">
                  {{ 'orgSettings.nameDesc' | transloco }}
                </p>
              </div>
              <input hlmInput id="name" formControlName="name" class="max-w-md" />
            </div>
            <div
              class="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-3"
            >
              <span class="text-xs text-muted-foreground">{{
                'orgSettings.nameHint' | transloco
              }}</span>
              <div class="flex items-center gap-2">
                @if (savedField() === 'name') {
                  <span class="text-xs text-emerald-500" data-testid="settings-saved">
                    {{ 'orgSettings.saved' | transloco }}
                  </span>
                }
                <button
                  hlmBtn
                  size="sm"
                  type="button"
                  (click)="saveField('name')"
                  [disabled]="saving() === 'name' || form.controls.name.invalid"
                >
                  @if (saving() === 'name') {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'orgSettings.save' | transloco }}
                </button>
              </div>
            </div>
          </section>

          <!-- Meeting language -->
          <section hlmCard class="overflow-hidden">
            <div class="flex flex-col gap-3 p-6">
              <div>
                <label hlmLabel for="meetingLanguage" class="text-base font-semibold">
                  {{ 'orgSettings.meetingLanguage' | transloco }}
                </label>
                <p class="mt-1 text-sm text-muted-foreground">
                  {{ 'orgSettings.languageDesc' | transloco }}
                </p>
              </div>
              <input
                hlmInput
                id="meetingLanguage"
                formControlName="meetingLanguage"
                placeholder="es-PE"
                class="max-w-xs"
              />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3"
            >
              @if (savedField() === 'meetingLanguage') {
                <span class="text-xs text-emerald-500">{{ 'orgSettings.saved' | transloco }}</span>
              }
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="saveField('meetingLanguage')"
                [disabled]="saving() === 'meetingLanguage' || form.controls.meetingLanguage.invalid"
              >
                @if (saving() === 'meetingLanguage') {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'orgSettings.save' | transloco }}
              </button>
            </div>
          </section>

          <!-- Audio retention -->
          <section hlmCard class="overflow-hidden">
            <div class="flex flex-col gap-3 p-6">
              <div>
                <label hlmLabel for="audioRetentionDays" class="text-base font-semibold">
                  {{ 'orgSettings.audioRetention' | transloco }}
                </label>
                <p class="mt-1 text-sm text-muted-foreground">
                  {{ 'orgSettings.audioRetentionHint' | transloco }}
                </p>
              </div>
              <input
                hlmInput
                id="audioRetentionDays"
                type="number"
                formControlName="audioRetentionDays"
                class="max-w-[10rem]"
              />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3"
            >
              @if (savedField() === 'audioRetentionDays') {
                <span class="text-xs text-emerald-500">{{ 'orgSettings.saved' | transloco }}</span>
              }
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="saveField('audioRetentionDays')"
                [disabled]="
                  saving() === 'audioRetentionDays' || form.controls.audioRetentionDays.invalid
                "
              >
                @if (saving() === 'audioRetentionDays') {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'orgSettings.save' | transloco }}
              </button>
            </div>
          </section>

          @if (errorMessage()) {
            <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class OrgSettings {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal<OrgField | null>(null);
  protected readonly savedField = signal<OrgField | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    meetingLanguage: ['', [Validators.maxLength(8)]],
    audioRetentionDays: [30, [Validators.required, Validators.min(-1)]],
  });

  constructor() {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.api.getOrganization(orgId).subscribe({
      next: (org) => {
        this.form.patchValue({
          name: org.name,
          meetingLanguage: org.meetingLanguage,
          audioRetentionDays: org.audioRetentionDays,
        });
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected saveField(field: OrgField): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.saving() || this.form.controls[field].invalid) return;
    this.saving.set(field);
    this.savedField.set(null);
    this.errorMessage.set(null);

    const value = this.form.getRawValue();
    const request: UpdateOrganizationRequest =
      field === 'name'
        ? { name: value.name }
        : field === 'meetingLanguage'
          ? { meetingLanguage: value.meetingLanguage || undefined }
          : { audioRetentionDays: value.audioRetentionDays };

    this.api.updateOrganization(orgId, request).subscribe({
      next: () => {
        this.saving.set(null);
        this.savedField.set(field);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(null);
        this.errorMessage.set(
          this.transloco.translate(
            err.status === 400 ? 'orgSettings.errorValidation' : 'orgSettings.errorGeneric',
          ),
        );
      },
    });
  }
}
