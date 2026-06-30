import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideMonitor, lucideMoon, lucideSun, lucideUpload } from '@ng-icons/lucide';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ThemeMode, ThemeService } from '../../../../core/theme/theme.service';
import { Lang, SUPPORTED_LANGS, saveLang } from '../../../../core/i18n/language';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { HlmButton, HlmCard, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

const MAX_AVATAR_BYTES = 1_000_000;

/** Personal account settings (Vercel-style): profile (avatar + name), password, appearance. */
@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Avatar,
    HlmButton,
    HlmCard,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideMonitor, lucideSun, lucideMoon, lucideUpload })],
  template: `
    <div class="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'account.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'account.subtitle' | transloco }}</p>
      </div>

      <!-- Profile: avatar + name -->
      <section hlmCard class="overflow-hidden">
        <div class="flex flex-col gap-5 p-6">
          <div class="flex items-center gap-4">
            <app-avatar
              [name]="store.user()?.fullName ?? ''"
              [seed]="store.user()?.id ?? ''"
              [imageUrl]="avatarUrl()"
              [size]="64"
              [circle]="true"
            />
            <div class="flex flex-col gap-2">
              <p class="text-sm text-muted-foreground">{{ 'account.avatarDesc' | transloco }}</p>
              <div>
                <input
                  #fileInput
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  class="hidden"
                  (change)="onAvatarSelected($event)"
                />
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  type="button"
                  (click)="fileInput.click()"
                  [disabled]="uploading()"
                >
                  @if (uploading()) {
                    <hlm-spinner class="h-4 w-4" />
                  } @else {
                    <hlm-icon name="lucideUpload" size="15px" />
                  }
                  {{ 'account.changeAvatar' | transloco }}
                </button>
              </div>
              @if (avatarError()) {
                <p class="text-xs text-destructive">{{ avatarError() }}</p>
              }
            </div>
          </div>

          <form [formGroup]="profileForm" class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="firstName">{{ 'auth.fields.firstName' | transloco }}</label>
              <input hlmInput id="firstName" formControlName="firstName" />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="lastName">{{ 'auth.fields.lastName' | transloco }}</label>
              <input hlmInput id="lastName" formControlName="lastName" />
            </div>
          </form>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
          @if (profileSaved()) {
            <span class="text-xs text-emerald-500">{{ 'account.saved' | transloco }}</span>
          }
          <button
            hlmBtn
            size="sm"
            type="button"
            (click)="saveProfile()"
            [disabled]="profileForm.invalid || savingProfile()"
          >
            @if (savingProfile()) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'account.save' | transloco }}
          </button>
        </div>
      </section>

      <!-- Password -->
      <section hlmCard class="overflow-hidden">
        <form [formGroup]="passwordForm" class="flex flex-col gap-4 p-6">
          <div>
            <h2 class="text-base font-semibold">{{ 'account.password' | transloco }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">{{ 'account.passwordDesc' | transloco }}</p>
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
        <div class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
          @if (passwordSaved()) {
            <span class="text-xs text-emerald-500">{{ 'account.passwordSaved' | transloco }}</span>
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

      <!-- Appearance -->
      <section hlmCard class="overflow-hidden">
        <div class="flex flex-col gap-4 p-6">
          <div>
            <h2 class="text-base font-semibold">{{ 'account.appearance' | transloco }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">{{ 'account.appearanceDesc' | transloco }}</p>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm">{{ 'userMenu.theme' | transloco }}</span>
            <div class="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              @for (opt of themes; track opt.mode) {
                <button
                  type="button"
                  (click)="theme.set(opt.mode)"
                  [attr.aria-pressed]="theme.mode() === opt.mode"
                  [attr.title]="'theme.' + opt.mode | transloco"
                  class="grid h-8 w-9 place-items-center rounded-md transition-colors"
                  [class]="
                    theme.mode() === opt.mode
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  "
                >
                  <hlm-icon [name]="opt.icon" size="15px" />
                </button>
              }
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm">{{ 'language.label' | transloco }}</span>
            <div class="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              @for (lang of langs; track lang) {
                <button
                  type="button"
                  (click)="setLang(lang)"
                  [attr.aria-pressed]="lang === activeLang()"
                  class="rounded-md px-3 py-1 text-xs font-medium uppercase transition-colors"
                  [class]="
                    lang === activeLang()
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  "
                >
                  {{ lang }}
                </button>
              }
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class Account {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly store = inject(AuthStore);
  protected readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);

  protected readonly langs = SUPPORTED_LANGS;
  protected readonly themes: { mode: ThemeMode; icon: string }[] = [
    { mode: 'system', icon: 'lucideMonitor' },
    { mode: 'light', icon: 'lucideSun' },
    { mode: 'dark', icon: 'lucideMoon' },
  ];
  protected readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  // Cache-busting version so a freshly uploaded avatar (same URL) reloads.
  private readonly avatarVersion = signal(0);
  protected readonly avatarUrl = computed(() => {
    const url = this.store.user()?.avatarUrl;
    if (!url) return null;
    const v = this.avatarVersion();
    return v ? `${url}?v=${v}` : url;
  });

  protected readonly savingProfile = signal(false);
  protected readonly profileSaved = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly passwordSaved = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly avatarError = signal<string | null>(null);

  protected readonly profileForm = this.fb.nonNullable.group({
    firstName: [this.store.user()?.firstName ?? '', [Validators.required, Validators.maxLength(100)]],
    lastName: [this.store.user()?.lastName ?? '', [Validators.required, Validators.maxLength(100)]],
  });

  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });

  protected saveProfile(): void {
    if (this.profileForm.invalid || this.savingProfile()) return;
    this.savingProfile.set(true);
    this.profileSaved.set(false);
    const { firstName, lastName } = this.profileForm.getRawValue();
    this.auth.updateProfile(firstName, lastName).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.profileSaved.set(true);
      },
      error: () => this.savingProfile.set(false),
    });
  }

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

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.avatarError.set(null);
    if (file.size > MAX_AVATAR_BYTES) {
      this.avatarError.set(this.transloco.translate('account.avatarTooLarge'));
      return;
    }
    this.uploading.set(true);
    this.auth.uploadAvatar(file).subscribe({
      next: () => {
        this.uploading.set(false);
        this.avatarVersion.set(Date.now());
      },
      error: () => {
        this.uploading.set(false);
        this.avatarError.set(this.transloco.translate('account.errorGeneric'));
      },
    });
  }

  protected setLang(lang: Lang): void {
    this.transloco.setActiveLang(lang);
    saveLang(lang);
  }
}
