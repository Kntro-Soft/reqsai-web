import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { AuthService } from '../../../../../core/auth/auth.service';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../../shared/ui';

/** Account · Security: the change-password card. */
@Component({
  selector: 'app-account-security',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideCheck })],
  template: `
    <div class="flex flex-col gap-6">
      <section class="overflow-hidden rounded-2xl border border-border">
        <form [formGroup]="passwordForm" class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-semibold">{{ 'account.password' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'account.passwordDesc' | transloco }}</p>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="currentPassword">
                {{ 'account.currentPassword' | transloco }}
              </label>
              <input
                hlmInput
                id="currentPassword"
                type="password"
                formControlName="currentPassword"
                autocomplete="current-password"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="newPassword">{{ 'account.newPassword' | transloco }}</label>
              <input
                hlmInput
                id="newPassword"
                type="password"
                formControlName="newPassword"
                autocomplete="new-password"
                [placeholder]="'auth.signUp.passwordPlaceholder' | transloco"
              />
            </div>
          </div>
          @if (passwordError()) {
            <p class="text-sm text-destructive">{{ passwordError() }}</p>
          }
        </form>
        <div class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          @if (passwordSaved()) {
            <span class="flex items-center gap-1 text-xs text-emerald-500">
              <hlm-icon name="lucideCheck" size="13px" />
              {{ 'account.passwordSaved' | transloco }}
            </span>
          }
          <button
            hlmBtn
            size="sm"
            type="button"
            (click)="savePassword()"
            [disabled]="passwordForm.invalid || savingPassword()"
          >
            @if (savingPassword()) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'account.save' | transloco }}
          </button>
        </div>
      </section>
    </div>
  `,
})
export class AccountSecurity {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  protected readonly savingPassword = signal(false);
  protected readonly passwordSaved = signal(false);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });

  protected savePassword(): void {
    if (this.passwordForm.invalid || this.savingPassword()) return;
    this.savingPassword.set(true);
    this.passwordSaved.set(false);
    this.passwordError.set(null);
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordSaved.set(true);
        this.passwordForm.reset();
      },
      error: (err: HttpErrorResponse) => {
        this.savingPassword.set(false);
        this.passwordError.set(
          this.transloco.translate(
            err.status === 400 || err.status === 401
              ? 'account.passwordWrong'
              : 'account.errorGeneric',
          ),
        );
      },
    });
  }
}
