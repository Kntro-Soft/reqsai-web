import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { WorkspaceStore } from '../../data/workspace.store';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '../../../../shared/ui';

@Component({
  selector: 'app-create-organization',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmCard,
    HlmCardHeader,
    HlmCardTitle,
    HlmCardDescription,
    HlmCardContent,
    HlmInput,
    HlmLabel,
    HlmSpinner,
  ],
  template: `
    <div hlmCard class="mx-auto max-w-lg">
      <div hlmCardHeader>
        <h1 hlmCardTitle>Crea tu organización</h1>
        <p hlmCardDescription>
          Tu organización es tu espacio de trabajo. Podrás crear proyectos dentro de ella.
        </p>
      </div>
      <div hlmCardContent>
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label hlmLabel for="name">Nombre de la organización</label>
            <input hlmInput id="name" formControlName="name" placeholder="Acme Inc." />
          </div>

          <div class="flex flex-col gap-2">
            <label hlmLabel for="meetingLanguage">Idioma de reuniones</label>
            <input
              hlmInput
              id="meetingLanguage"
              formControlName="meetingLanguage"
              placeholder="es-PE"
            />
          </div>

          @if (errorMessage()) {
            <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
          }

          <button hlmBtn type="submit" [disabled]="form.invalid || loading()" class="mt-2">
            @if (loading()) {
              <hlm-spinner class="h-4 w-4" />
            }
            Crear y continuar
          </button>
        </form>
      </div>
    </div>
  `,
})
export class CreateOrganization {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(WorkspaceStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    meetingLanguage: ['es-PE', [Validators.maxLength(8)]],
  });

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    const { name, meetingLanguage } = this.form.getRawValue();
    this.store
      .createOrganization({ name, meetingLanguage: meetingLanguage || undefined })
      // Activate it so the new tenant is embedded in the rotated session.
      .pipe(switchMap((org) => this.auth.switchOrganization(org.id)))
      .subscribe({
        next: () => void this.router.navigate(['/projects']),
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.errorMessage.set(
            err.status === 400
              ? 'Ese nombre ya está en uso. Prueba con otro.'
              : 'No se pudo crear la organización. Intenta de nuevo.',
          );
        },
      });
  }
}
