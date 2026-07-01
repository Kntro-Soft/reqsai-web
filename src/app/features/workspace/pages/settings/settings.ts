import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCopy, lucideUpload } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse, UpdateOrganizationRequest } from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

type OrgField = 'name' | 'meetingLanguage' | 'audioRetentionDays';

const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Auto-detect' },
  { value: 'es-PE', label: 'Español (Perú)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'fr-FR', label: 'Français' },
];

/**
 * Organization settings, Vercel-style: one bordered card per setting (logo, name, meeting language,
 * audio retention, org id), each with its own footer Save that PATCHes only that field. Matches the
 * members page styling (rounded-2xl card + muted footer bar).
 */
@Component({
  selector: 'app-org-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Avatar,
    Select,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideCheck, lucideCopy, lucideUpload })],
  template: `
    <div class="flex flex-col gap-6">
      @if (state() === 'loading') {
        <div class="flex justify-center rounded-2xl border border-border py-10">
          <hlm-spinner class="h-5 w-5" />
        </div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'orgSettings.errorGeneric' | transloco }}</p>
      } @else {
        <!-- Logo / avatar -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex items-center justify-between gap-4 p-5">
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-semibold">{{ 'orgSettings.logo' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">{{ 'orgSettings.logoDesc' | transloco }}</p>
            </div>
            <button
              type="button"
              (click)="fileInput.click()"
              class="group relative shrink-0 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              [attr.aria-label]="'orgSettings.logoUpload' | transloco"
            >
              <app-avatar
                [name]="orgName()"
                [seed]="orgId() ?? ''"
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
            <span class="text-xs text-muted-foreground">
              @if (uploadingAvatar()) {
                {{ 'orgSettings.logoUploading' | transloco }}
              } @else {
                {{ 'orgSettings.logoHint' | transloco }}
              }
            </span>
          </div>
        </section>

        <div [formGroup]="form" class="flex flex-col gap-6">
          <!-- Name -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <div class="flex flex-col gap-1">
                <label hlmLabel for="name" class="text-base font-semibold">
                  {{ 'orgSettings.name' | transloco }}
                </label>
                <p class="text-sm text-muted-foreground">{{ 'orgSettings.nameDesc' | transloco }}</p>
              </div>
              <input hlmInput id="name" formControlName="name" class="max-w-md" />
            </div>
            <div
              class="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3"
            >
              <span class="text-xs text-muted-foreground">
                {{ 'orgSettings.nameHint' | transloco }}
              </span>
              <div class="flex items-center gap-2">
                @if (savedField() === 'name') {
                  <span class="flex items-center gap-1 text-xs text-emerald-500" data-testid="settings-saved">
                    <hlm-icon name="lucideCheck" size="13px" />
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
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <div class="flex flex-col gap-1">
                <span hlmLabel class="text-base font-semibold">
                  {{ 'orgSettings.meetingLanguage' | transloco }}
                </span>
                <p class="text-sm text-muted-foreground">
                  {{ 'orgSettings.languageDesc' | transloco }}
                </p>
              </div>
              <app-select
                [options]="languageOptions"
                [value]="form.controls.meetingLanguage.value"
                (valueChange)="form.controls.meetingLanguage.setValue($event)"
                [ariaLabel]="'orgSettings.meetingLanguage' | transloco"
              />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              @if (savedField() === 'meetingLanguage') {
                <span class="flex items-center gap-1 text-xs text-emerald-500">
                  <hlm-icon name="lucideCheck" size="13px" />
                  {{ 'orgSettings.saved' | transloco }}
                </span>
              }
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="saveField('meetingLanguage')"
                [disabled]="saving() === 'meetingLanguage'"
              >
                @if (saving() === 'meetingLanguage') {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'orgSettings.save' | transloco }}
              </button>
            </div>
          </section>

          <!-- Audio retention -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <div class="flex flex-col gap-1">
                <label hlmLabel for="audioRetentionDays" class="text-base font-semibold">
                  {{ 'orgSettings.audioRetention' | transloco }}
                </label>
                <p class="text-sm text-muted-foreground">
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
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              @if (savedField() === 'audioRetentionDays') {
                <span class="flex items-center gap-1 text-xs text-emerald-500">
                  <hlm-icon name="lucideCheck" size="13px" />
                  {{ 'orgSettings.saved' | transloco }}
                </span>
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
        </div>

        <!-- Organization ID (read-only) -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-3 p-5">
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-semibold">{{ 'orgSettings.orgId' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">{{ 'orgSettings.orgIdDesc' | transloco }}</p>
            </div>
            <div class="flex items-center gap-2">
              <code
                class="flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-sm"
              >
                {{ orgId() }}
              </code>
              <button
                hlmBtn
                variant="outline"
                size="sm"
                type="button"
                (click)="copyId()"
                [attr.aria-label]="'orgSettings.copyId' | transloco"
              >
                <hlm-icon [name]="copied() ? 'lucideCheck' : 'lucideCopy'" size="15px" />
              </button>
            </div>
          </div>
        </section>

        @if (isOwner()) {
          <!-- Transfer ownership -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <div class="flex flex-col gap-1">
                <h2 class="text-base font-semibold">{{ 'orgSettings.transfer' | transloco }}</h2>
                <p class="text-sm text-muted-foreground">
                  {{ 'orgSettings.transferDesc' | transloco }}
                </p>
              </div>
              @if (transferOptions().length) {
                <app-select
                  [options]="transferOptions()"
                  [value]="newOwnerId()"
                  (valueChange)="newOwnerId.set($event)"
                  [ariaLabel]="'orgSettings.transfer' | transloco"
                />
              } @else {
                <p class="text-sm text-muted-foreground">
                  {{ 'orgSettings.transferEmpty' | transloco }}
                </p>
              }
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="transfer()"
                [disabled]="!newOwnerId() || transferring()"
              >
                @if (transferring()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'orgSettings.transferCta' | transloco }}
              </button>
            </div>
          </section>

          <!-- Delete organization -->
          <section class="overflow-hidden rounded-2xl border border-destructive/40">
            <div class="flex flex-col gap-1 p-5">
              <h2 class="text-base font-semibold text-destructive">
                {{ 'orgSettings.delete' | transloco }}
              </h2>
              <p class="text-sm text-muted-foreground">{{ 'orgSettings.deleteDesc' | transloco }}</p>
            </div>
            <div
              class="flex items-center justify-between gap-2 border-t border-destructive/30 bg-destructive/5 px-5 py-3"
            >
              <span class="text-xs text-muted-foreground">
                {{ 'orgSettings.deleteHint' | transloco }}
              </span>
              @if (confirmingDelete()) {
                <div class="flex items-center gap-2">
                  <button
                    hlmBtn
                    size="sm"
                    variant="ghost"
                    type="button"
                    (click)="confirmingDelete.set(false)"
                  >
                    {{ 'common.cancel' | transloco }}
                  </button>
                  <button
                    hlmBtn
                    size="sm"
                    variant="destructive"
                    type="button"
                    (click)="deleteOrg()"
                    [disabled]="deleting()"
                  >
                    @if (deleting()) {
                      <hlm-spinner class="h-4 w-4" />
                    }
                    {{ 'orgSettings.deleteConfirm' | transloco }}
                  </button>
                </div>
              } @else {
                <button
                  hlmBtn
                  size="sm"
                  variant="destructive"
                  type="button"
                  (click)="confirmingDelete.set(true)"
                >
                  {{ 'orgSettings.delete' | transloco }}
                </button>
              }
            </div>
          </section>
        } @else {
          <!-- Leave organization -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-1 p-5">
              <h2 class="text-base font-semibold">{{ 'orgSettings.leave' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">{{ 'orgSettings.leaveDesc' | transloco }}</p>
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              @if (confirmingLeave()) {
                <button
                  hlmBtn
                  size="sm"
                  variant="ghost"
                  type="button"
                  (click)="confirmingLeave.set(false)"
                >
                  {{ 'common.cancel' | transloco }}
                </button>
                <button
                  hlmBtn
                  size="sm"
                  variant="destructive"
                  type="button"
                  (click)="leaveOrg()"
                  [disabled]="leaving()"
                >
                  @if (leaving()) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'orgSettings.leaveConfirm' | transloco }}
                </button>
              } @else {
                <button
                  hlmBtn
                  size="sm"
                  variant="outline"
                  type="button"
                  (click)="confirmingLeave.set(true)"
                >
                  {{ 'orgSettings.leave' | transloco }}
                </button>
              }
            </div>
          </section>
        }

        @if (errorMessage()) {
          <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
        }
      }
    </div>
  `,
})
export class OrgSettings {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly languageOptions = LANGUAGE_OPTIONS;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal<OrgField | null>(null);
  protected readonly savedField = signal<OrgField | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly orgId = computed(() => this.store.organizationId());
  protected readonly orgName = signal('');
  protected readonly uploadingAvatar = signal(false);
  protected readonly copied = signal(false);

  // Ownership / danger-zone state.
  private readonly ownerId = signal<string | null>(null);
  private readonly members = signal<MemberResponse[]>([]);
  protected readonly newOwnerId = signal('');
  protected readonly transferring = signal(false);
  protected readonly deleting = signal(false);
  protected readonly leaving = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly confirmingLeave = signal(false);
  protected readonly isOwner = computed(() => {
    const uid = this.store.user()?.id;
    return !!uid && this.ownerId() === uid;
  });
  protected readonly transferOptions = computed<SelectOption[]>(() =>
    this.members()
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => ({ value: m.id, label: m.displayName || m.email })),
  );

  private readonly avatarBase = signal<string | null>(null);
  private readonly avatarVersion = signal(0);
  protected readonly avatarUrl = computed(() => {
    const base = this.avatarBase();
    if (!base) return null;
    return this.avatarVersion() ? `${base}?v=${this.avatarVersion()}` : base;
  });

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
        this.orgName.set(org.name);
        this.avatarBase.set(org.avatarUrl);
        this.ownerId.set(org.ownerId);
        this.form.patchValue({
          name: org.name,
          meetingLanguage: org.meetingLanguage,
          audioRetentionDays: org.audioRetentionDays,
        });
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
    this.api.listMembers(orgId).subscribe({
      next: (members) => this.members.set(members),
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
        if (field === 'name') this.orgName.set(value.name);
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

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const orgId = this.store.organizationId();
    if (!file || !orgId || this.uploadingAvatar()) return;
    this.uploadingAvatar.set(true);
    this.errorMessage.set(null);
    this.api.uploadOrganizationAvatar(orgId, file).subscribe({
      next: (org) => {
        this.uploadingAvatar.set(false);
        this.avatarBase.set(org.avatarUrl);
        this.avatarVersion.update((v) => v + 1);
        this.workspace.loadOrganizations();
      },
      error: (err: HttpErrorResponse) => {
        this.uploadingAvatar.set(false);
        this.errorMessage.set(
          this.transloco.translate(
            err.status === 400 ? 'orgSettings.logoError' : 'orgSettings.errorGeneric',
          ),
        );
      },
    });
  }

  protected transfer(): void {
    const orgId = this.store.organizationId();
    const target = this.newOwnerId();
    if (!orgId || !target || this.transferring()) return;
    this.transferring.set(true);
    this.errorMessage.set(null);
    this.api.transferOwnership(orgId, target).subscribe({
      next: (org) => {
        this.transferring.set(false);
        this.ownerId.set(org.ownerId);
        this.newOwnerId.set('');
        this.workspace.loadOrganizations();
      },
      error: () => {
        this.transferring.set(false);
        this.errorMessage.set(this.transloco.translate('orgSettings.errorGeneric'));
      },
    });
  }

  protected deleteOrg(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.deleting()) return;
    this.deleting.set(true);
    this.errorMessage.set(null);
    this.api.deleteOrganization(orgId).subscribe({
      next: () => this.leaveToLaunch(),
      error: () => {
        this.deleting.set(false);
        this.errorMessage.set(this.transloco.translate('orgSettings.errorGeneric'));
      },
    });
  }

  protected leaveOrg(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.leaving()) return;
    this.leaving.set(true);
    this.errorMessage.set(null);
    this.api.leaveOrganization(orgId).subscribe({
      next: () => this.leaveToLaunch(),
      error: () => {
        this.leaving.set(false);
        this.errorMessage.set(this.transloco.translate('orgSettings.errorGeneric'));
      },
    });
  }

  /** After leaving/deleting the active org, re-resolve the workspace from the launch route. */
  private leaveToLaunch(): void {
    this.workspace.loadOrganizations();
    void this.router.navigate(['/launch']);
  }

  protected copyId(): void {
    const id = this.orgId();
    if (!id) return;
    void navigator.clipboard.writeText(id).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }
}
