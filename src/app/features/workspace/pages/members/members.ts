import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import {
  lucideEllipsis,
  lucideMailCheck,
  lucidePlus,
  lucideSearch,
  lucideTrash2,
  lucideUserCheck,
  lucideUserPlus,
  lucideUserX,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsApiService } from '../../../../core/authz/permissions-api.service';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { BasePermission } from '../../../../core/authz/permissions.models';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { CreateMemberRequest, MemberResponse } from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { InlineEntity } from '../../../../shared/components/inline-entity/inline-entity';
import { Modal } from '../../../../shared/components/modal/modal';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { translateFn } from '../../../../core/i18n/translate-fn';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

type MemberTab = 'active' | 'pending' | 'inactive';

const MENU_POS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

/** Organization members (Vercel-style): an always-visible invite card that can queue several
 * invitations at once, Active / Pending tabs, filter + role + sort controls, and a compact
 * single-column member table with an inline styled role select and a per-row actions menu. */
@Component({
  selector: 'app-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    OverlayModule,
    Avatar,
    InlineEntity,
    Modal,
    Select,
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
      lucideEllipsis,
      lucideMailCheck,
      lucidePlus,
      lucideSearch,
      lucideTrash2,
      lucideUserCheck,
      lucideUserPlus,
      lucideUserX,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'members.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'members.subtitle' | transloco }}</p>
      </div>

      <!-- Invite (owner/admin only) -->
      @if (canManage()) {
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold">{{ 'members.inviteTitle' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'members.inviteDesc' | transloco }}</p>
          </div>
          <form
            [formGroup]="form"
            (ngSubmit)="invite()"
            class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5"
          >
            <div formArrayName="invites" class="flex flex-col gap-3">
              @for (row of invites.controls; track row; let i = $index) {
                <div [formGroupName]="i" class="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div class="flex flex-1 flex-col gap-1.5">
                    @if (i === 0) {
                      <label hlmLabel [for]="'email' + i">{{
                        'members.fieldEmail' | transloco
                      }}</label>
                    }
                    <input
                      hlmInput
                      [id]="'email' + i"
                      type="email"
                      formControlName="email"
                      [placeholder]="'members.placeholderEmail' | transloco"
                    />
                    @if (row.controls.email.errors?.['selfInvite'] && row.controls.email.touched) {
                      <p class="text-xs text-destructive" data-testid="invite-self-error">
                        {{ 'members.errorSelfInvite' | transloco }}
                      </p>
                    }
                  </div>
                  <div class="flex flex-1 flex-col gap-1.5">
                    @if (i === 0) {
                      <label hlmLabel [for]="'displayName' + i">
                        {{ 'members.fieldName' | transloco }}
                      </label>
                    }
                    <input
                      hlmInput
                      [id]="'displayName' + i"
                      formControlName="displayName"
                      [placeholder]="'members.placeholderName' | transloco"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    @if (i === 0) {
                      <span hlmLabel>{{ 'members.fieldRole' | transloco }}</span>
                    }
                    <app-select
                      [options]="roleOptions()"
                      [value]="row.controls.role.value"
                      (valueChange)="row.controls.role.setValue($any($event))"
                      [ariaLabel]="'members.fieldRole' | transloco"
                    />
                  </div>
                  <button
                    type="button"
                    (click)="removeInvite(i)"
                    [disabled]="invites.length === 1"
                    [attr.aria-label]="'members.removeInviteAria' | transloco"
                    class="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <hlm-icon name="lucideTrash2" size="16px" />
                  </button>
                </div>
              }
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                (click)="addInvite()"
                class="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                data-testid="invite-add-more"
              >
                <hlm-icon name="lucidePlus" size="15px" />
                {{ 'members.addMore' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                type="submit"
                [disabled]="form.invalid || submitting()"
                data-testid="invite-submit"
              >
                @if (submitting()) {
                  <hlm-spinner class="h-4 w-4" />
                } @else {
                  <hlm-icon name="lucideUserPlus" size="15px" />
                }
                {{ 'members.inviteSubmit' | transloco }}
              </button>
            </div>
            @if (errorMessage()) {
              <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
            }
          </form>
        </section>

        <!-- Member base permission (GitHub-style floor): compact card, choice in a modal. -->
        <section
          class="flex items-center justify-between gap-4 rounded-2xl border border-border p-5"
          data-testid="base-permission-card"
        >
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="text-base font-semibold">{{ 'authz.basePermission.title' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">
              {{ 'authz.basePermission.desc' | transloco }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-3">
            @if (basePermission(); as value) {
              <span
                class="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium"
                data-testid="base-permission-value"
              >
                {{ 'authz.basePermission.' + (value === 'READ' ? 'read' : 'none') | transloco }}
              </span>
            } @else {
              <hlm-spinner class="h-4 w-4" />
            }
            <button
              hlmBtn
              size="sm"
              variant="outline"
              type="button"
              (click)="openBasePermission()"
              [disabled]="basePermission() === null"
              data-testid="base-permission-change"
            >
              {{ 'authz.basePermission.change' | transloco }}
            </button>
          </div>
        </section>

        <!-- Base-permission chooser (None / Read) -->
        <app-modal [(open)]="basePermissionOpen">
          <span modalTitle>{{ 'authz.basePermission.title' | transloco }}</span>
          <div class="flex flex-col gap-2" role="radiogroup">
            @for (opt of basePermissionOptions; track opt.value) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="basePermissionDraft() === opt.value"
                (click)="basePermissionDraft.set(opt.value)"
                class="flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
                [class]="
                  basePermissionDraft() === opt.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent'
                "
                [attr.data-testid]="'base-permission-option-' + opt.value"
              >
                <span
                  class="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                  [class]="
                    basePermissionDraft() === opt.value
                      ? 'border-primary'
                      : 'border-muted-foreground/50'
                  "
                >
                  @if (basePermissionDraft() === opt.value) {
                    <span class="h-2 w-2 rounded-full bg-primary"></span>
                  }
                </span>
                <span class="flex flex-col gap-0.5">
                  <span class="text-sm font-medium">{{ opt.labelKey | transloco }}</span>
                  <span class="text-xs text-muted-foreground">{{ opt.descKey | transloco }}</span>
                </span>
              </button>
            }
          </div>
          <button
            modalFooter
            hlmBtn
            size="sm"
            variant="ghost"
            type="button"
            (click)="basePermissionOpen.set(false)"
          >
            {{ 'common.cancel' | transloco }}
          </button>
          <button
            modalFooter
            hlmBtn
            size="sm"
            type="button"
            (click)="saveBasePermission()"
            [disabled]="
              basePermissionSaving() !== null || basePermissionDraft() === basePermission()
            "
            data-testid="base-permission-save"
          >
            @if (basePermissionSaving() !== null) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'authz.basePermission.save' | transloco }}
          </button>
        </app-modal>
      }

      <!-- Tabs -->
      <div class="flex gap-4 border-b border-border text-sm">
        @for (t of tabs; track t.value) {
          <button
            type="button"
            (click)="tab.set(t.value)"
            class="-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 px-1 pb-2.5 font-medium transition-colors"
            [class]="
              tab() === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
          >
            {{ t.labelKey | transloco }}
            <span class="rounded-full bg-secondary px-1.5 text-xs text-muted-foreground">
              {{ tabCount(t.value) }}
            </span>
          </button>
        }
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2">
        <div
          class="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3"
        >
          <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
          <input
            type="text"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            [placeholder]="'members.filterPlaceholder' | transloco"
            class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autocomplete="off"
            spellcheck="false"
            data-testid="members-filter"
          />
        </div>
        <app-select
          [options]="roleFilterOptions()"
          [value]="roleFilter()"
          (valueChange)="roleFilter.set($event)"
          [ariaLabel]="'members.filterRoleAria' | transloco"
        />
        <app-select
          [options]="sortOptions()"
          [value]="sort()"
          (valueChange)="sort.set($event)"
          [ariaLabel]="'members.sortAria' | transloco"
        />
      </div>

      @if (state() === 'loading') {
        <div
          class="overflow-hidden rounded-2xl border border-border"
          data-testid="members-skeleton"
        >
          @for (i of skeletonRows; track i) {
            <div class="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <hlm-skeleton class="h-[34px] w-[34px] shrink-0 rounded-full" />
              <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                <hlm-skeleton class="h-4 w-40" />
                <hlm-skeleton class="h-3 w-56 max-w-full" />
              </div>
              <hlm-skeleton class="h-7 w-24 shrink-0 rounded-md" />
            </div>
          }
        </div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'members.loadError' | transloco }}</p>
      } @else if (rows().length === 0) {
        <p class="rounded-2xl border border-border py-10 text-center text-sm text-muted-foreground">
          {{
            (tab() === 'active'
              ? 'members.emptyBody'
              : tab() === 'pending'
                ? 'members.emptyPending'
                : 'members.emptyInactive'
            ) | transloco
          }}
        </p>
      } @else {
        <div class="overflow-hidden rounded-2xl border border-border">
          <table class="w-full text-sm">
            <tbody>
              @for (m of rows(); track m.id) {
                <tr class="border-b border-border last:border-0" data-testid="member-row">
                  <td class="py-3 pr-3 pl-4">
                    <div class="flex min-w-0 items-center gap-3">
                      <app-avatar
                        [name]="m.displayName || m.email"
                        [seed]="m.id"
                        [imageUrl]="m.avatarUrl"
                        [size]="34"
                        [circle]="true"
                      />
                      <div class="min-w-0">
                        <p class="flex items-center gap-2 truncate font-medium">
                          {{ m.displayName || m.email }}
                          @if (m.isSelf) {
                            <span
                              class="rounded bg-secondary px-1.5 text-[11px] text-muted-foreground"
                            >
                              {{ 'members.you' | transloco }}
                            </span>
                          }
                        </p>
                        <p class="truncate text-xs text-muted-foreground">{{ m.email }}</p>
                      </div>
                    </div>
                  </td>
                  @if (tab() === 'pending') {
                    <td class="px-3 text-right whitespace-nowrap">
                      <span
                        class="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600"
                      >
                        {{ 'members.status.PENDING' | transloco }}
                      </span>
                    </td>
                  } @else if (tab() === 'inactive') {
                    <td class="px-3 text-right whitespace-nowrap">
                      <span
                        class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {{ 'members.status.INACTIVE' | transloco }}
                      </span>
                    </td>
                  }
                  <td class="px-3 text-right whitespace-nowrap">
                    @if (m.role === 'OWNER' || tab() !== 'active' || !canManage() || m.isSelf) {
                      <span
                        class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {{ 'members.role.' + m.role | transloco }}
                      </span>
                    } @else {
                      <div class="flex justify-end">
                        <app-select
                          size="sm"
                          [options]="roleOptions()"
                          [value]="m.role"
                          (valueChange)="changeRole(m, $any($event))"
                          [ariaLabel]="'members.fieldRole' | transloco"
                        />
                      </div>
                    }
                  </td>
                  <td class="w-12 py-3 pr-3 pl-1 text-right">
                    @if (!m.isSelf && m.role !== 'OWNER' && canManage()) {
                      <button
                        type="button"
                        cdkOverlayOrigin
                        #menuOrigin="cdkOverlayOrigin"
                        (click)="menuFor.set(menuFor() === m.id ? null : m.id)"
                        [attr.aria-label]="'members.menuAria' | transloco"
                        class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <hlm-icon name="lucideEllipsis" size="16px" />
                      </button>
                      <ng-template
                        cdkConnectedOverlay
                        [cdkConnectedOverlayOrigin]="menuOrigin"
                        [cdkConnectedOverlayOpen]="menuFor() === m.id"
                        [cdkConnectedOverlayPositions]="menuPositions"
                        (overlayOutsideClick)="menuFor.set(null)"
                        (detach)="menuFor.set(null)"
                      >
                        <div
                          role="menu"
                          class="w-max min-w-48 overflow-hidden rounded-lg border border-border bg-popover p-1 whitespace-nowrap text-popover-foreground shadow-xl"
                        >
                          @if (tab() === 'pending') {
                            <button
                              role="menuitem"
                              type="button"
                              (click)="resend(m); menuFor.set(null)"
                              class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <hlm-icon name="lucideMailCheck" size="15px" />
                              {{ 'members.resendInvite' | transloco }}
                            </button>
                          }
                          @if (tab() === 'active') {
                            <button
                              role="menuitem"
                              type="button"
                              (click)="askStatus(m, 'INACTIVE'); menuFor.set(null)"
                              class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <hlm-icon name="lucideUserX" size="15px" />
                              {{ 'members.deactivate' | transloco }}
                            </button>
                          }
                          @if (tab() === 'inactive') {
                            <button
                              role="menuitem"
                              type="button"
                              (click)="askStatus(m, 'ACTIVE'); menuFor.set(null)"
                              class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <hlm-icon name="lucideUserCheck" size="15px" />
                              {{ 'members.reactivate' | transloco }}
                            </button>
                          }
                          <button
                            role="menuitem"
                            type="button"
                            (click)="askRemove(m); menuFor.set(null)"
                            class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <hlm-icon name="lucideTrash2" size="15px" />
                            {{ 'members.removeFromOrg' | transloco }}
                          </button>
                        </div>
                      </ng-template>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Deactivate / reactivate confirmation (plain confirm, no typing) -->
      <app-modal [(open)]="statusOpen">
        <span modalTitle>{{
          (statusIsDeactivate() ? 'members.deactivateTitle' : 'members.reactivateTitle') | transloco
        }}</span>
        @if (statusTarget(); as t) {
          <p>
            {{
              (statusIsDeactivate() ? 'members.deactivateBefore' : 'members.reactivateBefore')
                | transloco
            }}
            <app-inline-entity [name]="t.name" [seed]="t.id" [imageUrl]="t.avatarUrl" />{{
              (statusIsDeactivate() ? 'members.deactivateAfter' : 'members.reactivateAfter')
                | transloco
            }}
          </p>
        }
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="statusOpen.set(false)"
        >
          {{ 'common.cancel' | transloco }}
        </button>
        @if (statusIsDeactivate()) {
          <button
            modalFooter
            hlmBtn
            size="sm"
            variant="destructive"
            type="button"
            (click)="confirmStatus()"
            [disabled]="actioning()"
          >
            @if (actioning()) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'members.deactivate' | transloco }}
          </button>
        } @else {
          <button
            modalFooter
            hlmBtn
            size="sm"
            type="button"
            (click)="confirmStatus()"
            [disabled]="actioning()"
          >
            @if (actioning()) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'members.reactivate' | transloco }}
          </button>
        }
      </app-modal>

      <!-- Remove from organization (type-to-confirm, like delete organization) -->
      <app-modal [(open)]="removeOpen">
        <span modalTitle>{{ 'members.removeTitle' | transloco }}</span>
        @if (removeTarget(); as t) {
          <div class="flex flex-col gap-4">
            <p>
              {{ 'members.removeBefore' | transloco }}
              <app-inline-entity [name]="t.name" [seed]="t.id" [imageUrl]="t.avatarUrl" />
              {{ 'members.removeAfter' | transloco }}
            </p>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="remove-confirm-name">{{
                'members.removeConfirmName' | transloco: { name: t.name }
              }}</label>
              <input
                hlmInput
                id="remove-confirm-name"
                autocomplete="off"
                spellcheck="false"
                [value]="removeName()"
                (input)="removeName.set($any($event.target).value)"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="remove-confirm-phrase">
                <span
                  [innerHTML]="
                    'members.removeConfirmPhrase' | transloco: { phrase: removePhraseHtml() }
                  "
                ></span>
              </label>
              <input
                hlmInput
                id="remove-confirm-phrase"
                autocomplete="off"
                spellcheck="false"
                [value]="removePhrase()"
                (input)="removePhrase.set($any($event.target).value)"
              />
            </div>
            <div
              class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {{ 'members.removeWarning' | transloco: { name: t.name } }}
            </div>
          </div>
        }
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="removeOpen.set(false)"
        >
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="destructive"
          type="button"
          (click)="confirmRemove()"
          [disabled]="!canRemove() || actioning()"
        >
          @if (actioning()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'members.removeFromOrg' | transloco }}
        </button>
      </app-modal>
    </div>
  `,
})
export class Members {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly permissionsApi = inject(PermissionsApiService);
  private readonly permissions = inject(PermissionsStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);

  // Member base permission (GitHub-style floor). `null` until loaded — the compact card
  // shows the current value + a Change button that opens a modal; the modal holds a draft
  // choice until Save. `basePermissionSaving` holds the option mid-PUT for its spinner.
  protected readonly basePermission = signal<BasePermission | null>(null);
  protected readonly basePermissionSaving = signal<BasePermission | null>(null);
  protected readonly basePermissionOpen = signal(false);
  protected readonly basePermissionDraft = signal<BasePermission | null>(null);
  protected readonly basePermissionOptions: readonly {
    value: BasePermission;
    labelKey: string;
    descKey: string;
  }[] = [
    {
      value: 'NONE',
      labelKey: 'authz.basePermission.none',
      descKey: 'authz.basePermission.noneDesc',
    },
    {
      value: 'READ',
      labelKey: 'authz.basePermission.read',
      descKey: 'authz.basePermission.readDesc',
    },
  ];

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly tabs: readonly { value: MemberTab; labelKey: string }[] = [
    { value: 'active', labelKey: 'members.tabActive' },
    { value: 'pending', labelKey: 'members.tabPending' },
    { value: 'inactive', labelKey: 'members.tabInactive' },
  ];
  protected readonly tab = signal<MemberTab>('active');
  protected readonly members = signal<MemberResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly menuFor = signal<string | null>(null);
  protected readonly menuPositions = MENU_POS;

  // Filters.
  protected readonly query = signal('');
  protected readonly roleFilter = signal('all');
  protected readonly sort = signal('recent');

  // Confirmation modals: deactivate/reactivate ask for a plain confirm; remove is a
  // type-to-confirm (member name + a literal phrase), mirroring the delete-organization modal.
  protected readonly actioning = signal(false);
  protected readonly statusOpen = signal(false);
  protected readonly statusTarget = signal<{
    id: string;
    name: string;
    avatarUrl: string | null;
    next: 'ACTIVE' | 'INACTIVE';
  } | null>(null);
  protected readonly statusIsDeactivate = computed(() => this.statusTarget()?.next === 'INACTIVE');
  protected readonly removeOpen = signal(false);
  protected readonly removeTarget = signal<{
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null>(null);
  protected readonly removeName = signal('');
  protected readonly removePhrase = signal('');
  private readonly removePhraseText = computed(() =>
    this.transloco.translate('members.removePhrase'),
  );
  protected readonly removePhraseHtml = computed(() => this.bold(this.removePhraseText()));
  /** Removal is enabled only when BOTH inputs match: the member's name and the literal phrase. */
  protected readonly canRemove = computed(() => {
    const t = this.removeTarget();
    return !!t && this.removeName() === t.name && this.removePhrase() === this.removePhraseText();
  });

  private bold(text: string): string {
    const escaped = text.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );
    return `<strong>${escaped}</strong>`;
  }

  private readonly translate = translateFn(this.transloco);
  protected readonly roleOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return [
      { value: 'MEMBER', label: t('members.role.MEMBER') },
      { value: 'ADMIN', label: t('members.role.ADMIN') },
    ];
  });
  protected readonly roleFilterOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return [
      { value: 'all', label: t('members.filterAllRoles') },
      { value: 'ADMIN', label: t('members.role.ADMIN') },
      { value: 'MEMBER', label: t('members.role.MEMBER') },
    ];
  });
  protected readonly sortOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return [
      { value: 'recent', label: t('members.sortRecent') },
      { value: 'name', label: t('members.sortName') },
    ];
  });

  /** Owner or admin of the active org may manage members; everyone else gets a read-only roster. */
  protected readonly canManage = computed(() => {
    const user = this.store.user();
    if (!user) return false;
    const orgId = this.store.organizationId();
    const org = this.workspace.organizations().find((o) => o.id === orgId);
    if (org?.ownerId === user.id) return true;
    const me = this.members().find((m) => m.userId === user.id && m.status === 'ACTIVE');
    return me?.role === 'ADMIN' || me?.role === 'OWNER';
  });

  /** The user's public avatar endpoint, when the member is linked to a user account (falls back to a
   * monogram for pending invites, which have no user yet, or users without an uploaded image). */
  private memberAvatar(userId: string | null): string | null {
    return userId ? `/api/users/${userId}/avatar` : null;
  }

  /** Decorates a backend member row with the "this is you" flag and its resolved avatar URL. The owner
   * now comes from the backend roster (as an OWNER row), so no client-side synthesis is needed. */
  private toRow(m: MemberResponse) {
    return {
      ...m,
      isSelf: !!m.userId && m.userId === this.store.user()?.id,
      avatarUrl: this.memberAvatar(m.userId),
    };
  }

  protected readonly activeRows = computed(() =>
    this.members()
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => this.toRow(m)),
  );
  protected readonly pending = computed(() =>
    this.members()
      .filter((m) => m.status === 'PENDING')
      .map((m) => this.toRow(m)),
  );
  protected readonly inactive = computed(() =>
    this.members()
      .filter((m) => m.status === 'INACTIVE')
      .map((m) => this.toRow(m)),
  );

  protected tabCount(t: MemberTab): number {
    return t === 'active'
      ? this.activeRows().length
      : t === 'pending'
        ? this.pending().length
        : this.inactive().length;
  }

  /** The current tab's rows after the filter / role / sort controls are applied. */
  protected readonly rows = computed(() => {
    const base =
      this.tab() === 'active'
        ? this.activeRows()
        : this.tab() === 'pending'
          ? this.pending()
          : this.inactive();
    const q = this.query().trim().toLowerCase();
    const role = this.roleFilter();
    let list = base.filter((m) => {
      const matchesQuery =
        !q ||
        (m.displayName?.toLowerCase().includes(q) ?? false) ||
        m.email.toLowerCase().includes(q);
      const matchesRole = role === 'all' || m.role === role;
      return matchesQuery && matchesRole;
    });
    if (this.sort() === 'name') {
      list = [...list].sort((a, b) =>
        (a.displayName || a.email).localeCompare(b.displayName || b.email),
      );
    }
    return list;
  });

  /** Rejects an invite email that matches the signed-in user's own address (case-insensitive).
   * Declared before `form` because the field initializer below builds an invite group that
   * references it — class fields initialize top-to-bottom, so it must exist first. */
  private readonly selfInviteValidator = (control: AbstractControl): ValidationErrors | null => {
    const own = this.store.user()?.email?.trim().toLowerCase();
    const value = (control.value as string)?.trim().toLowerCase();
    return own && value && value === own ? { selfInvite: true } : null;
  };

  protected readonly form = this.fb.group({
    invites: this.fb.array([this.newInviteGroup()]),
  });

  get invites() {
    return this.form.controls.invites;
  }

  private newInviteGroup() {
    return this.fb.nonNullable.group({
      email: ['', [Validators.required, Validators.email, this.selfInviteValidator]],
      displayName: ['', [Validators.required, Validators.maxLength(150)]],
      role: ['MEMBER' as 'ADMIN' | 'MEMBER', [Validators.required]],
    });
  }

  constructor() {
    this.load();
  }

  private load(): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.state.set('loading');
    this.api.listMembers(orgId).subscribe({
      next: (members) => {
        this.members.set(members);
        this.state.set('ready');
        // Only owner/admin may read/write the base permission — fetch it once the roster
        // has resolved the caller's role, so we don't fire an endpoint that would 403.
        if (this.canManage()) this.loadBasePermission(orgId);
      },
      error: () => this.state.set('error'),
    });
  }

  private loadBasePermission(orgId: string): void {
    this.permissionsApi.getBasePermission(orgId).subscribe({
      next: (res) => this.basePermission.set(res.basePermission),
      // Silent: a failure just leaves the card in its disabled/unknown state.
      error: () => void 0,
    });
  }

  /** Opens the chooser modal, seeding the draft with the current value. */
  protected openBasePermission(): void {
    if (this.basePermission() === null) return;
    this.basePermissionDraft.set(this.basePermission());
    this.basePermissionOpen.set(true);
  }

  /** PUTs the drafted base permission; on success closes the modal and mirrors it into the store. */
  protected saveBasePermission(): void {
    const orgId = this.store.organizationId();
    const value = this.basePermissionDraft();
    if (!orgId || !value || this.basePermissionSaving() || value === this.basePermission()) return;
    this.basePermissionSaving.set(value);
    this.permissionsApi.updateBasePermission(orgId, value).subscribe({
      next: (res) => {
        this.basePermission.set(res.basePermission);
        this.permissions.setMemberBasePermission(res.basePermission);
        this.basePermissionSaving.set(null);
        this.basePermissionOpen.set(false);
        this.toast.success(this.transloco.translate('authz.basePermission.saved'));
      },
      error: (err: HttpErrorResponse) => {
        this.basePermissionSaving.set(null);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  protected addInvite(): void {
    this.invites.push(this.newInviteGroup());
  }

  protected removeInvite(index: number): void {
    if (this.invites.length > 1) this.invites.removeAt(index);
  }

  protected invite(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set(null);
    const invitations = this.invites.getRawValue() as CreateMemberRequest[];
    this.api.batchInviteMembers(orgId, invitations).subscribe({
      next: (created) => {
        this.members.update((list) => [...created, ...list]);
        this.submitting.set(false);
        this.tab.set(created.some((m) => m.status === 'PENDING') ? 'pending' : 'active');
        this.form.setControl('invites', this.fb.array([this.newInviteGroup()]));
        this.toast.success(this.transloco.translate('toast.invitesSent'));
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  protected changeRole(member: { id: string; role: string }, role: 'ADMIN' | 'MEMBER'): void {
    const orgId = this.store.organizationId();
    if (!orgId || role === member.role) return;
    this.api.changeMemberRole(orgId, member.id, role).subscribe({
      next: (updated) =>
        this.members.update((list) => list.map((m) => (m.id === updated.id ? updated : m))),
      error: (err) => this.toast.error(messageForError(err, this.transloco)),
    });
  }

  protected resend(member: { id: string }): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.api.resendInvitation(orgId, member.id).subscribe({
      next: (updated) => {
        this.members.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
        this.toast.success(this.transloco.translate('toast.invitationResent'));
      },
      error: (err) => this.toast.error(messageForError(err, this.transloco)),
    });
  }

  protected askStatus(
    member: { id: string; displayName: string; email: string; avatarUrl: string | null },
    next: 'ACTIVE' | 'INACTIVE',
  ): void {
    this.statusTarget.set({
      id: member.id,
      name: member.displayName || member.email,
      avatarUrl: member.avatarUrl,
      next,
    });
    this.statusOpen.set(true);
  }

  protected confirmStatus(): void {
    const orgId = this.store.organizationId();
    const target = this.statusTarget();
    if (!orgId || !target || this.actioning()) return;
    this.actioning.set(true);
    this.api.changeMemberStatus(orgId, target.id, target.next).subscribe({
      next: (updated) => {
        this.members.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
        this.actioning.set(false);
        this.statusOpen.set(false);
        this.toast.success(
          this.transloco.translate(
            target.next === 'ACTIVE' ? 'toast.memberReactivated' : 'toast.memberDeactivated',
          ),
        );
      },
      error: (err) => {
        this.actioning.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  protected askRemove(member: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  }): void {
    this.removeTarget.set({
      id: member.id,
      name: member.displayName || member.email,
      avatarUrl: member.avatarUrl,
    });
    this.removeName.set('');
    this.removePhrase.set('');
    this.removeOpen.set(true);
  }

  protected confirmRemove(): void {
    const orgId = this.store.organizationId();
    const target = this.removeTarget();
    if (!orgId || !target || !this.canRemove() || this.actioning()) return;
    this.actioning.set(true);
    this.api.removeMember(orgId, target.id).subscribe({
      next: () => {
        this.members.update((list) => list.filter((m) => m.id !== target.id));
        this.actioning.set(false);
        this.removeOpen.set(false);
        this.toast.success(this.transloco.translate('toast.memberRemoved'));
      },
      error: (err) => {
        this.actioning.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }
}
