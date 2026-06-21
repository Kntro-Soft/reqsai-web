import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
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

/** Organization settings: the editable name, meeting language and audio retention. */
@Component({
  selector: 'app-org-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, HlmButton, HlmCard, HlmCardContent, HlmInput, HlmLabel, HlmSpinner],
  template: `
    <div class="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Ajustes</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Configura tu organización y los valores por defecto de las reuniones.
        </p>
      </div>

      <div hlmCard>
        <div hlmCardContent class="pt-6">
          @if (state() === 'loading') {
            <div class="flex justify-center py-8"><hlm-spinner class="h-5 w-5" /></div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="name">Nombre de la organización</label>
                <input hlmInput id="name" formControlName="name" />
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="meetingLanguage">Idioma de reuniones</label>
                  <input hlmInput id="meetingLanguage" formControlName="meetingLanguage" placeholder="es-PE" />
                </div>
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="audioRetentionDays">Retención de audio (días)</label>
                  <input
                    hlmInput
                    id="audioRetentionDays"
                    type="number"
                    formControlName="audioRetentionDays"
                  />
                  <p class="text-xs text-muted-foreground">Usa -1 para conservar sin límite.</p>
                </div>
              </div>

              @if (errorMessage()) {
                <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
              }
              @if (saved()) {
                <p class="text-sm text-emerald-500" data-testid="settings-saved">Cambios guardados.</p>
              }

              <div class="mt-2 flex justify-end">
                <button hlmBtn type="submit" [disabled]="form.invalid || saving()" data-testid="settings-save">
                  @if (saving()) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  Guardar cambios
                </button>
              </div>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class OrgSettings {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
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

  protected save(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.saved.set(false);
    this.errorMessage.set(null);
    const { name, meetingLanguage, audioRetentionDays } = this.form.getRawValue();
    this.api
      .updateOrganization(orgId, { name, meetingLanguage: meetingLanguage || undefined, audioRetentionDays })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.errorMessage.set(
            err.status === 400
              ? 'Revisa los datos e intenta de nuevo.'
              : 'No se pudieron guardar los cambios.',
          );
        },
      });
  }
}
