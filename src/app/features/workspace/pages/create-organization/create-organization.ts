import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import { lucideBuilding2, lucideChevronDown } from '@ng-icons/lucide';
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

/** The browser locale, capped to the backend's 8-char meeting-language column. */
function detectMeetingLanguage(): string {
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return lang.length <= 8 ? lang : (lang.split('-')[0] ?? lang.slice(0, 8));
}

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
  viewProviders: [provideIcons({ lucideBuilding2, lucideChevronDown })],
  styles: [
    `
      .org-grid {
        background-image:
          linear-gradient(to right, var(--border) 1px, transparent 1px),
          linear-gradient(to bottom, var(--border) 1px, transparent 1px);
        background-size: 44px 44px;
        -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent 72%);
        mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent 72%);
      }
    `,
  ],
  template: `
    <div
      class="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4 py-20 text-foreground"
    >
      <!-- Decorative background: faint grid, soft brand glows and a faint brand-mark watermark -->
      <div class="org-grid pointer-events-none absolute inset-0 opacity-50"></div>
      <div
        class="pointer-events-none absolute -top-32 left-1/2 h-80 w-2xl -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      ></div>
      <div
        class="pointer-events-none absolute -bottom-40 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      ></div>
      <img
        src="/assets/img/reqsai-combination-mark-original.webp"
        alt=""
        aria-hidden="true"
        class="pointer-events-none absolute -bottom-10 -left-10 w-64 opacity-[0.05] select-none dark:opacity-[0.08]"
      />

      <header
        class="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 md:px-6"
      >
        <app-logo [size]="28" />
        <div class="flex items-center gap-1">
          <app-language-switcher />
          <app-theme-toggle />
        </div>
      </header>

      <div class="relative z-1 w-full max-w-md">
        <div class="mb-6 flex flex-col items-center gap-3 text-center">
          <span class="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <hlm-icon name="lucideBuilding2" size="24px" />
          </span>
          <div>
            <h1 class="text-2xl font-bold tracking-tight">{{ 'createOrg.title' | transloco }}</h1>
            <p class="mt-1.5 text-sm text-muted-foreground">
              {{ 'createOrg.subtitle' | transloco }}
            </p>
          </div>
        </div>

        <div hlmCard>
          <div hlmCardContent class="pt-6">
            <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
              <div class="flex flex-col gap-2">
                <label hlmLabel for="name">{{ 'createOrg.name' | transloco }}</label>
                <input
                  hlmInput
                  id="name"
                  formControlName="name"
                  placeholder="Acme Inc."
                  autocomplete="organization"
                />
              </div>

              <button
                type="button"
                (click)="showAdvanced.set(!showAdvanced())"
                class="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
              >
                <hlm-icon
                  name="lucideChevronDown"
                  size="15px"
                  class="transition-transform"
                  [class.rotate-180]="showAdvanced()"
                />
                {{ 'createOrg.advanced' | transloco }}
              </button>

              @if (showAdvanced()) {
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="meetingLanguage">
                    {{ 'createOrg.language' | transloco }}
                  </label>
                  <input
                    hlmInput
                    id="meetingLanguage"
                    formControlName="meetingLanguage"
                    placeholder="es-PE"
                  />
                  <p class="text-xs text-muted-foreground">
                    {{ 'createOrg.languageHint' | transloco }}
                  </p>
                </div>
              }

              @if (errorMessage()) {
                <p class="text-sm text-destructive" data-testid="form-error">
                  {{ errorMessage() }}
                </p>
              }

              <button
                hlmBtn
                type="submit"
                [disabled]="form.invalid || loading()"
                class="mt-2 w-full"
              >
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
  protected readonly showAdvanced = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    meetingLanguage: [detectMeetingLanguage(), [Validators.maxLength(8)]],
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
