import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideUpload } from '@ng-icons/lucide';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AuthStore } from '../../../../../core/auth/auth.store';
import { Avatar } from '../../../../../shared/components/avatar/avatar';
import { ToastService } from '../../../../../shared/toast/toast.service';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../../shared/ui';

const MAX_AVATAR_BYTES = 1_000_000;

/** Account · Profile: the avatar (click to upload) and profile-name cards. */
@Component({
  selector: 'app-account-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Avatar, HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideCheck, lucideUpload })],
  template: `
    <div class="flex flex-col gap-6">
      <!-- Avatar -->
      <section class="overflow-hidden rounded-2xl border border-border">
        <div class="flex items-center justify-between gap-4 p-5">
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-semibold">{{ 'account.avatar' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'account.avatarDesc' | transloco }}</p>
          </div>
          <button
            type="button"
            (click)="fileInput.click()"
            [disabled]="uploading()"
            class="group relative shrink-0 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            [attr.aria-label]="'account.changeAvatar' | transloco"
          >
            <app-avatar
              [name]="store.user()?.fullName ?? ''"
              [seed]="store.user()?.id ?? ''"
              [imageUrl]="avatarUrl()"
              [size]="64"
              [circle]="true"
            />
            <span
              class="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <hlm-icon name="lucideUpload" size="18px" />
            </span>
          </button>
          <input
            #fileInput
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            class="hidden"
            (change)="onAvatarSelected($event)"
          />
        </div>
        <div class="border-t border-border bg-muted/30 px-5 py-3">
          @if (avatarError()) {
            <span class="text-xs text-destructive">{{ avatarError() }}</span>
          } @else {
            <span class="text-xs text-muted-foreground">
              @if (uploading()) {
                {{ 'account.avatarUploading' | transloco }}
              } @else {
                {{ 'account.avatarHint' | transloco }}
              }
            </span>
          }
        </div>
      </section>

      <!-- Profile name -->
      <section class="overflow-hidden rounded-2xl border border-border">
        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-semibold">{{ 'account.profile' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'account.profileDesc' | transloco }}</p>
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
        <div class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          @if (profileSaved()) {
            <span class="flex items-center gap-1 text-xs text-emerald-500">
              <hlm-icon name="lucideCheck" size="13px" />
              {{ 'account.saved' | transloco }}
            </span>
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
    </div>
  `,
})
export class AccountProfile {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

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
  protected readonly uploading = signal(false);
  protected readonly avatarError = signal<string | null>(null);

  protected readonly profileForm = this.fb.nonNullable.group({
    firstName: [this.store.user()?.firstName ?? '', [Validators.required, Validators.maxLength(100)]],
    lastName: [this.store.user()?.lastName ?? '', [Validators.required, Validators.maxLength(100)]],
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
        this.toast.success(this.transloco.translate('toast.profileSaved'));
      },
      error: () => {
        this.savingProfile.set(false);
        this.toast.error(this.transloco.translate('account.errorGeneric'));
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
}
