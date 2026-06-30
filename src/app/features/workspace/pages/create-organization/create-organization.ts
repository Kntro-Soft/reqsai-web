import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import { lucideBuilding2 } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../../core/auth/auth.service';
import { WorkspaceStore } from '../../data/workspace.store';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { LanguageSwitcher } from '../../../../shared/components/language-switcher/language-switcher';
import { Logo } from '../../../../shared/components/logo/logo';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmIcon,
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
    HlmCardContent,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    HlmIcon,
    TranslocoPipe,
    ThemeToggle,
    LanguageSwitcher,
    Logo,
  ],
  viewProviders: [provideIcons({ lucideBuilding2 })],
  template: `
    <div class="min-h-dvh">
      <header class="flex items-center justify-between px-6 py-4">
        <app-logo [size]="28" />
        <div class="flex items-center gap-1">
          <app-language-switcher />
          <app-theme-toggle />
        </div>
      </header>
      <div class="mx-auto flex max-w-lg flex-col gap-6 px-6 py-6">
        <div class="flex flex-col items-center gap-3 text-center">
          <span class="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <hlm-icon name="lucideBuilding2" size="26px" />
          </span>
          <div>
            <h1 class="text-2xl font-bold tracking-tight">{{ 'createOrg.title' | transloco }}</h1>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ 'createOrg.subtitle' | transloco }}
            </p>
          </div>
        </div>

        <div hlmCard>
          <div hlmCardContent class="pt-6">
            <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="name">{{ 'createOrg.name' | transloco }}</label>
                <input hlmInput id="name" formControlName="name" placeholder="Acme Inc." />
              </div>

              <div class="flex flex-col gap-2">
                <label hlmLabel for="meetingLanguage">{{ 'createOrg.language' | transloco }}</label>
                <input
                  hlmInput
                  id="meetingLanguage"
                  formControlName="meetingLanguage"
                  placeholder="es-PE"
                />
              </div>

              @if (errorMessage()) {
                <p class="text-sm text-destructive" data-testid="form-error">
                  {{ errorMessage() }}
                </p>
              }

              <button hlmBtn type="submit" [disabled]="form.invalid || loading()" class="mt-2">
                @if (loading()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'createOrg.submit' | transloco }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CreateOrganization {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(WorkspaceStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

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
            this.transloco.translate(
              err.status === 400 ? 'createOrg.errorNameInUse' : 'createOrg.errorGeneric',
            ),
          );
        },
      });
  }
}
