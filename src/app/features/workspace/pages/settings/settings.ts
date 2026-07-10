import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { OverlayModule } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronsUpDown,
  lucideCopy,
  lucideSearch,
  lucideUpload,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse, UpdateOrganizationRequest } from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { InlineEntity } from '../../../../shared/components/inline-entity/inline-entity';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { Modal } from '../../../../shared/components/modal/modal';
import { BELOW_START } from '../../../../shared/components/popover/popover-positions';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

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
    OverlayModule,
    Avatar,
    InlineEntity,
    Select,
    Modal,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [
    provideIcons({
      lucideCheck,
      lucideChevronsUpDown,
      lucideCopy,
      lucideSearch,
      lucideUpload,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      @if (state() === 'loading') {
        <div class="flex flex-col gap-6" data-testid="org-settings-skeleton">
          @for (i of skeletonCards; track i) {
            <section class="overflow-hidden rounded-2xl border border-border">
              <div class="flex flex-col gap-3 p-5">
                <hlm-skeleton class="h-5 w-40" />
                <hlm-skeleton class="h-3 w-64 max-w-full" />
                <hlm-skeleton class="h-10 w-full max-w-md rounded-md" />
              </div>
              <div class="flex justify-end border-t border-border bg-muted/30 px-5 py-3">
                <hlm-skeleton class="h-8 w-28 rounded-md" />
              </div>
            </section>
          }
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
              [disabled]="!isOwner()"
              class="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:cursor-pointer"
              [attr.aria-label]="'orgSettings.logoUpload' | transloco"
            >
              <app-avatar
                [name]="orgName()"
                [seed]="orgId() ?? ''"
                [imageUrl]="avatarUrl()"
                [size]="64"
                [circle]="true"
              />
              @if (isOwner()) {
                <span
                  class="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <hlm-icon name="lucideUpload" size="18px" />
                </span>
              }
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

        @if (!isOwner()) {
          <p
            class="rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground"
            data-testid="org-settings-readonly-hint"
          >
            {{ 'orgSettings.ownerOnlyHint' | transloco }}
          </p>
        }

        <div [formGroup]="form" class="flex flex-col gap-6">
          <!-- Name -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <div class="flex flex-col gap-1">
                <label hlmLabel for="name" class="text-base font-semibold">
                  {{ 'orgSettings.name' | transloco }}
                </label>
                <p class="text-sm text-muted-foreground">
                  {{ 'orgSettings.nameDesc' | transloco }}
                </p>
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
                  <span
                    class="flex items-center gap-1 text-xs text-emerald-500"
                    data-testid="settings-saved"
                  >
                    <hlm-icon name="lucideCheck" size="13px" />
                    {{ 'orgSettings.saved' | transloco }}
                  </span>
                }
                @if (isOwner()) {
                  <button
                    hlmBtn
                    size="sm"
                    type="button"
                    (click)="saveField('name')"
                    [disabled]="saving() === 'name' || form.controls.name.invalid || !dirtyName()"
                  >
                    @if (saving() === 'name') {
                      <hlm-spinner class="h-4 w-4" />
                    }
                    {{ 'orgSettings.save' | transloco }}
                  </button>
                }
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
              @if (isOwner()) {
                <app-select
                  [options]="languageOptions"
                  [value]="form.controls.meetingLanguage.value"
                  (valueChange)="form.controls.meetingLanguage.setValue($event)"
                  [ariaLabel]="'orgSettings.meetingLanguage' | transloco"
                />
              } @else {
                <div
                  class="flex h-10 max-w-[9rem] items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
                >
                  {{ selectedLanguageLabel() }}
                </div>
              }
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
              @if (isOwner()) {
                <button
                  hlmBtn
                  size="sm"
                  type="button"
                  (click)="saveField('meetingLanguage')"
                  [disabled]="saving() === 'meetingLanguage' || !dirtyLanguage()"
                >
                  @if (saving() === 'meetingLanguage') {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'orgSettings.save' | transloco }}
                </button>
              }
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
              @if (isOwner()) {
                <button
                  hlmBtn
                  size="sm"
                  type="button"
                  (click)="saveField('audioRetentionDays')"
                  [disabled]="
                    saving() === 'audioRetentionDays' ||
                    form.controls.audioRetentionDays.invalid ||
                    !dirtyRetention()
                  "
                >
                  @if (saving() === 'audioRetentionDays') {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'orgSettings.save' | transloco }}
                </button>
              }
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
            <div class="flex flex-col gap-1 p-5">
              <h2 class="text-base font-semibold">{{ 'orgSettings.transfer' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">
                {{ 'orgSettings.transferDesc' | transloco }}
              </p>
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <button hlmBtn size="sm" variant="outline" type="button" (click)="openTransfer()">
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
              <p class="text-sm text-muted-foreground">
                {{ 'orgSettings.deleteDesc' | transloco }}
              </p>
            </div>
            <div
              class="flex items-center justify-between gap-2 border-t border-destructive/30 bg-destructive/5 px-5 py-3"
            >
              <span class="text-xs text-muted-foreground">
                {{ 'orgSettings.deleteHint' | transloco }}
              </span>
              <button hlmBtn size="sm" variant="destructive" type="button" (click)="openDelete()">
                {{ 'orgSettings.delete' | transloco }}
              </button>
            </div>
          </section>

          <!-- Transfer ownership modal -->
          <app-modal [(open)]="transferOpen">
            <span modalTitle>{{ 'orgSettings.transferModalTitle' | transloco }}</span>
            <div class="flex flex-col gap-4">
              <p>
                {{ 'orgSettings.transferModalBodyBefore' | transloco }}
                <app-inline-entity
                  [name]="orgName()"
                  [seed]="orgId() ?? ''"
                  [imageUrl]="avatarUrl()"
                />
                {{ 'orgSettings.transferModalBodyAfter' | transloco }}
              </p>
              @if (activeMembers().length) {
                <div class="flex flex-col gap-1.5">
                  <span hlmLabel>{{ 'orgSettings.transferTo' | transloco }}</span>
                  <!-- Searchable member picker (CDK overlay + avatar rows), like the switchers. -->
                  <button
                    type="button"
                    cdkOverlayOrigin
                    #pickerOrigin="cdkOverlayOrigin"
                    (click)="togglePicker()"
                    [attr.aria-expanded]="pickerOpen()"
                    aria-haspopup="listbox"
                    [attr.aria-label]="'orgSettings.transferTo' | transloco"
                    class="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <hlm-icon
                      name="lucideSearch"
                      size="15px"
                      class="shrink-0 text-muted-foreground"
                    />
                    @if (selectedMember(); as m) {
                      <app-avatar
                        [name]="m.displayName || m.email"
                        [seed]="m.id"
                        [imageUrl]="m.userId ? '/api/users/' + m.userId + '/avatar' : null"
                        [size]="20"
                        [circle]="true"
                      />
                      <span class="min-w-0 flex-1 truncate text-left">{{
                        m.displayName || m.email
                      }}</span>
                    } @else {
                      <span class="min-w-0 flex-1 truncate text-left text-muted-foreground">
                        {{ 'orgSettings.transferPlaceholder' | transloco }}
                      </span>
                    }
                    <hlm-icon
                      name="lucideChevronsUpDown"
                      size="14px"
                      class="shrink-0 text-muted-foreground"
                    />
                  </button>

                  <ng-template
                    cdkConnectedOverlay
                    [cdkConnectedOverlayOrigin]="pickerOrigin"
                    [cdkConnectedOverlayOpen]="pickerOpen()"
                    [cdkConnectedOverlayPositions]="pickerPositions"
                    [cdkConnectedOverlayWidth]="pickerOrigin.elementRef.nativeElement.offsetWidth"
                    (overlayOutsideClick)="pickerOpen.set(false)"
                    (overlayKeydown)="onPickerKeydown($event)"
                    (detach)="pickerOpen.set(false)"
                  >
                    <div
                      role="listbox"
                      class="w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
                    >
                      <div class="flex items-center gap-2 border-b border-border px-3">
                        <hlm-icon
                          name="lucideSearch"
                          size="15px"
                          class="shrink-0 text-muted-foreground"
                        />
                        <input
                          #memberSearch
                          type="text"
                          [value]="memberQuery()"
                          (input)="memberQuery.set($any($event.target).value)"
                          [placeholder]="'orgSettings.transferSearch' | transloco"
                          class="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                          autocomplete="off"
                          spellcheck="false"
                        />
                      </div>
                      <div class="max-h-64 overflow-y-auto p-1">
                        @for (m of filteredMembers(); track m.id) {
                          <button
                            type="button"
                            role="option"
                            [attr.aria-selected]="m.id === newOwnerId()"
                            (click)="pickMember(m.id)"
                            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                          >
                            <app-avatar
                              [name]="m.displayName || m.email"
                              [seed]="m.id"
                              [imageUrl]="m.userId ? '/api/users/' + m.userId + '/avatar' : null"
                              [size]="28"
                              [circle]="true"
                            />
                            <span class="flex min-w-0 flex-1 flex-col">
                              <span class="truncate font-medium">{{
                                m.displayName || m.email
                              }}</span>
                              @if (m.displayName) {
                                <span class="truncate text-xs text-muted-foreground">{{
                                  m.email
                                }}</span>
                              }
                            </span>
                            @if (m.id === newOwnerId()) {
                              <hlm-icon name="lucideCheck" size="15px" class="text-primary" />
                            }
                          </button>
                        } @empty {
                          <p class="px-2.5 py-6 text-center text-sm text-muted-foreground">
                            {{ 'orgSettings.transferSearchEmpty' | transloco }}
                          </p>
                        }
                      </div>
                    </div>
                  </ng-template>
                </div>
              } @else {
                <p class="text-sm text-muted-foreground">
                  {{ 'orgSettings.transferEmpty' | transloco }}
                </p>
              }
            </div>
            <div modalFooter class="flex w-full items-center justify-between gap-2">
              <button
                hlmBtn
                size="sm"
                variant="ghost"
                type="button"
                (click)="transferOpen.set(false)"
              >
                {{ 'common.cancel' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
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
          </app-modal>

          <!-- Delete organization modal -->
          <app-modal [(open)]="deleteOpen">
            <span modalTitle>{{ 'orgSettings.deleteModalTitle' | transloco }}</span>
            <div class="flex flex-col gap-4">
              <p>
                {{ 'orgSettings.deleteModalBodyBefore' | transloco }}
                <app-inline-entity
                  [name]="orgName()"
                  [seed]="orgId() ?? ''"
                  [imageUrl]="avatarUrl()"
                />
                {{ 'orgSettings.deleteModalBodyAfter' | transloco }}
              </p>
              <div class="flex flex-col gap-1.5">
                <label hlmLabel for="delete-confirm-name">
                  {{ 'orgSettings.deleteConfirmName' | transloco: { org: orgName() } }}
                </label>
                <input
                  hlmInput
                  id="delete-confirm-name"
                  autocomplete="off"
                  spellcheck="false"
                  [value]="deleteConfirmName()"
                  (input)="deleteConfirmName.set($any($event.target).value)"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label hlmLabel for="delete-confirm-phrase">
                  <span
                    [innerHTML]="
                      'orgSettings.deleteConfirmPhrase' | transloco: { phrase: deletePhraseHtml() }
                    "
                  ></span>
                </label>
                <input
                  hlmInput
                  id="delete-confirm-phrase"
                  autocomplete="off"
                  spellcheck="false"
                  [value]="deleteConfirmPhrase()"
                  (input)="deleteConfirmPhrase.set($any($event.target).value)"
                />
              </div>
              <div
                class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {{ 'orgSettings.deleteWarning' | transloco: { org: orgName() } }}
              </div>
            </div>
            <div modalFooter class="flex w-full items-center justify-between gap-2">
              <button
                hlmBtn
                size="sm"
                variant="ghost"
                type="button"
                (click)="deleteOpen.set(false)"
              >
                {{ 'common.cancel' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                variant="destructive"
                type="button"
                (click)="deleteOrg()"
                [disabled]="!canDelete() || deleting()"
              >
                @if (deleting()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'orgSettings.delete' | transloco }}
              </button>
            </div>
          </app-modal>
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
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="leaveOpen.set(true)"
              >
                {{ 'orgSettings.leave' | transloco }}
              </button>
            </div>
          </section>

          <!-- Leave organization modal -->
          <app-modal [(open)]="leaveOpen">
            <span modalTitle>{{ 'orgSettings.leaveModalTitle' | transloco }}</span>
            <p>{{ 'orgSettings.leaveModalBody' | transloco: { org: orgName() } }}</p>
            <button
              modalFooter
              hlmBtn
              size="sm"
              variant="ghost"
              type="button"
              (click)="leaveOpen.set(false)"
            >
              {{ 'common.cancel' | transloco }}
            </button>
            <button
              modalFooter
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
              {{ 'orgSettings.leave' | transloco }}
            </button>
          </app-modal>
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
  private readonly toast = inject(ToastService);

  protected readonly languageOptions = LANGUAGE_OPTIONS;
  protected readonly skeletonCards = [0, 1, 2];

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
  // Confirm-modal visibility.
  protected readonly transferOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly leaveOpen = signal(false);
  // Delete: two required type-to-confirm inputs (org name + a literal phrase), both case-sensitive.
  protected readonly deleteConfirmName = signal('');
  protected readonly deleteConfirmPhrase = signal('');
  // Transfer member picker (CDK-overlay searchable list, like the switchers).
  protected readonly pickerOpen = signal(false);
  protected readonly memberQuery = signal('');
  protected readonly pickerPositions = BELOW_START;
  private readonly memberSearch = viewChild<ElementRef<HTMLInputElement>>('memberSearch');

  protected readonly isOwner = computed(() => {
    const uid = this.store.user()?.id;
    return !!uid && this.ownerId() === uid;
  });
  /** The chosen meeting-language option's label, for the non-owner read-only display. */
  protected readonly selectedLanguageLabel = computed(() => {
    const value = this.form.controls.meetingLanguage.value;
    return LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? LANGUAGE_OPTIONS[0].label;
  });
  /** The org's ACTIVE members — the transfer candidates. */
  protected readonly activeMembers = computed(() =>
    this.members().filter((m) => m.status === 'ACTIVE'),
  );
  /** The active members matching the picker's search query (by display name or email). */
  protected readonly filteredMembers = computed(() => {
    const q = this.memberQuery().trim().toLowerCase();
    const members = this.activeMembers();
    if (!q) return members;
    return members.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  });
  /** The member currently chosen as the new owner, or null. */
  protected readonly selectedMember = computed(
    () => this.activeMembers().find((m) => m.id === this.newOwnerId()) ?? null,
  );
  /** The literal delete phrase, resolved for the active language (e.g. "delete my organization"). */
  private readonly deletePhrase = computed(() =>
    this.transloco.translate('orgSettings.deletePhrase'),
  );
  /** Deletion is enabled only when BOTH inputs match exactly (name + literal phrase). */
  protected readonly canDelete = computed(
    () =>
      this.deleteConfirmName() === this.orgName() &&
      this.deleteConfirmPhrase() === this.deletePhrase(),
  );
  /** The delete phrase, escaped and bolded, for the confirm-phrase label. */
  protected readonly deletePhraseHtml = computed(() => this.bold(this.deletePhrase()));

  private bold(text: string): string {
    const escaped = text.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );
    return `<strong>${escaped}</strong>`;
  }

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

  /** Snapshot of the last loaded/saved values; per-field Save is disabled until the field differs. */
  private readonly initial = signal(this.form.getRawValue());
  /** Live form value, mirrored into a signal so the dirty computeds recompute reactively. */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly dirtyName = computed(() => this.value().name !== this.initial().name);
  protected readonly dirtyLanguage = computed(
    () => this.value().meetingLanguage !== this.initial().meetingLanguage,
  );
  protected readonly dirtyRetention = computed(
    () => this.value().audioRetentionDays !== this.initial().audioRetentionDays,
  );

  constructor() {
    // Focus the member search field when the transfer picker opens.
    effect(() => {
      if (this.pickerOpen()) {
        queueMicrotask(() => this.memberSearch()?.nativeElement.focus());
      }
    });

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
        this.initial.set(this.form.getRawValue());
        // Non-owners may VIEW the org settings but not edit them: lock the fields.
        if (!this.isOwner()) this.form.disable({ emitEvent: false });
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
        // Re-baseline just this field so its Save disables again until it changes once more.
        this.initial.update((prev) => ({ ...prev, [field]: value[field] }));
        if (field === 'name') this.orgName.set(value.name);
        this.toast.success(this.transloco.translate('orgSettings.saved'));
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(null);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
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
        this.errorMessage.set(messageForError(err, this.transloco));
      },
    });
  }

  protected openTransfer(): void {
    this.newOwnerId.set('');
    this.memberQuery.set('');
    this.pickerOpen.set(false);
    this.transferOpen.set(true);
  }

  protected openDelete(): void {
    this.deleteConfirmName.set('');
    this.deleteConfirmPhrase.set('');
    this.deleteOpen.set(true);
  }

  protected togglePicker(): void {
    this.pickerOpen.update((v) => !v);
    if (this.pickerOpen()) this.memberQuery.set('');
  }

  protected pickMember(id: string): void {
    this.newOwnerId.set(id);
    this.pickerOpen.set(false);
  }

  protected onPickerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.pickerOpen.set(false);
    }
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
        this.transferOpen.set(false);
        this.workspace.loadOrganizations();
        this.toast.success(this.transloco.translate('toast.ownershipTransferred'));
      },
      error: (err) => {
        this.transferring.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  protected deleteOrg(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.deleting()) return;
    this.deleting.set(true);
    this.errorMessage.set(null);
    this.api.deleteOrganization(orgId).subscribe({
      next: () => {
        this.toast.success(this.transloco.translate('toast.orgDeleted'));
        this.leaveToLaunch();
      },
      error: (err) => {
        this.deleting.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  protected leaveOrg(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.leaving()) return;
    this.leaving.set(true);
    this.errorMessage.set(null);
    this.api.leaveOrganization(orgId).subscribe({
      next: () => {
        this.toast.success(this.transloco.translate('toast.orgLeft'));
        this.leaveToLaunch();
      },
      error: (err) => {
        this.leaving.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
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
