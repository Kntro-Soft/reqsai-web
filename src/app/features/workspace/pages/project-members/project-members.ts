import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { OverlayModule } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import {
  lucideChevronsUpDown,
  lucideMailPlus,
  lucidePlus,
  lucideSearch,
  lucideTrash2,
  lucideUserPlus,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import {
  MemberResponse,
  ProjectInvitation,
  ProjectMemberResponse,
  ProjectRoleResponse,
} from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { InlineEntity } from '../../../../shared/components/inline-entity/inline-entity';
import { Modal } from '../../../../shared/components/modal/modal';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { BELOW_START } from '../../../../shared/components/popover/popover-positions';
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

/** A single "add member" row: an empty draft, a picked existing org member, or a new email invite. */
interface AddRow {
  key: number;
  /** 'draft' = still typing/searching; 'member' = an existing org member is fixed; 'email' = new invite. */
  kind: 'draft' | 'member' | 'email';
  /** Free-text search box value (also the captured email for an 'email' row). */
  search: string;
  memberId: string;
  email: string;
  displayName: string;
  roleId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Project members (Vercel-style, mirrors the org members page). Owner/admins get ONE unified "add
 * people" card: each row is a searchable combobox over the org's active members (excluding the current
 * user and anyone already assigned). Picking an existing member fixes the row to that member; typing an
 * unknown email offers an "invite as new" option that turns the row into a displayName + role invite.
 * On submit, existing-member rows call assignProjectMember and new-email rows are batched into a single
 * inviteProjectMembers call. A filter bar (search + role filter + sort) narrows the roster below, a
 * compact table shows each assignment with an inline role select and a remove action (behind a
 * confirmation modal). Only org owners/admins may manage; everyone else gets a read-only roster.
 */
@Component({
  selector: 'app-project-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
      lucideChevronsUpDown,
      lucideMailPlus,
      lucidePlus,
      lucideSearch,
      lucideTrash2,
      lucideUserPlus,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'projectMembers.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'projectMembers.subtitle' | transloco }}
        </p>
      </div>

      <!-- Add people (owner/admin only) — unified batch rows -->
      @if (canManage()) {
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold">{{ 'projectMembers.addTitle' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'projectMembers.addDesc' | transloco }}</p>
          </div>
          <div class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5">
            @for (row of rows_add(); track row.key; let i = $index) {
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div class="flex flex-1 flex-col gap-1.5">
                  @if (i === 0) {
                    <span hlmLabel>{{ 'projectMembers.selectMember' | transloco }}</span>
                  }
                  @if (row.kind === 'member') {
                    <!-- Fixed to an existing member -->
                    <div
                      class="flex h-10 items-center gap-2.5 rounded-md border border-input bg-background px-3 text-sm"
                      [attr.data-testid]="'add-row-member-' + i"
                    >
                      <app-avatar
                        [name]="memberName(row.memberId)"
                        [seed]="row.memberId"
                        [imageUrl]="memberAvatar(row.memberId)"
                        [size]="24"
                        [circle]="true"
                      />
                      <span class="min-w-0 flex-1 truncate font-medium">{{
                        memberName(row.memberId)
                      }}</span>
                      <button
                        type="button"
                        (click)="resetRow(i)"
                        class="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {{ 'projectMembers.change' | transloco }}
                      </button>
                    </div>
                  } @else if (row.kind === 'email') {
                    <!-- Fixed to a new email invite -->
                    <div
                      class="flex h-10 items-center gap-2.5 rounded-md border border-input bg-background px-3 text-sm"
                      [attr.data-testid]="'add-row-email-' + i"
                    >
                      <span
                        class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"
                      >
                        <hlm-icon name="lucideMailPlus" size="13px" />
                      </span>
                      <span class="min-w-0 flex-1 truncate font-medium">{{ row.email }}</span>
                      <button
                        type="button"
                        (click)="resetRow(i)"
                        class="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {{ 'projectMembers.change' | transloco }}
                      </button>
                    </div>
                  } @else {
                    <!-- Searchable combobox -->
                    <button
                      type="button"
                      cdkOverlayOrigin
                      #pickerOrigin="cdkOverlayOrigin"
                      (click)="openPicker(i)"
                      [attr.aria-expanded]="openPickerIndex() === i"
                      aria-haspopup="listbox"
                      [attr.aria-label]="'projectMembers.selectMember' | transloco"
                      [attr.data-testid]="'add-row-picker-' + i"
                      class="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <hlm-icon
                        name="lucideSearch"
                        size="15px"
                        class="shrink-0 text-muted-foreground"
                      />
                      <span class="min-w-0 flex-1 truncate text-left text-muted-foreground">
                        {{ 'projectMembers.pickerPlaceholder' | transloco }}
                      </span>
                      <hlm-icon
                        name="lucideChevronsUpDown"
                        size="14px"
                        class="shrink-0 text-muted-foreground"
                      />
                    </button>

                    <ng-template
                      cdkConnectedOverlay
                      [cdkConnectedOverlayOrigin]="pickerOrigin"
                      [cdkConnectedOverlayOpen]="openPickerIndex() === i"
                      [cdkConnectedOverlayPositions]="pickerPositions"
                      [cdkConnectedOverlayWidth]="pickerOrigin.elementRef.nativeElement.offsetWidth"
                      (overlayOutsideClick)="closePicker()"
                      (overlayKeydown)="onPickerKeydown($event)"
                      (detach)="closePicker()"
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
                            #pickerSearch
                            type="text"
                            [value]="row.search"
                            (input)="setSearch(i, $any($event.target).value)"
                            [placeholder]="'projectMembers.pickerPlaceholder' | transloco"
                            class="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            autocomplete="off"
                            spellcheck="false"
                          />
                        </div>
                        <div class="max-h-64 overflow-y-auto p-1">
                          @for (m of pickerResults(i); track m.id) {
                            <button
                              type="button"
                              role="option"
                              [attr.aria-selected]="false"
                              (click)="pickMember(i, m.id)"
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
                            </button>
                          }
                          @if (canInviteTyped(i); as email) {
                            <button
                              type="button"
                              (click)="pickEmail(i, email)"
                              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                              [attr.data-testid]="'add-row-invite-option-' + i"
                            >
                              <span
                                class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground"
                              >
                                <hlm-icon name="lucideMailPlus" size="14px" />
                              </span>
                              <span class="min-w-0 flex-1 truncate">
                                {{ 'projectMembers.inviteAsNew' | transloco: { email: email } }}
                              </span>
                            </button>
                          }
                          @if (!pickerResults(i).length && !canInviteTyped(i)) {
                            <p class="px-2.5 py-6 text-center text-sm text-muted-foreground">
                              {{ 'projectMembers.pickerEmpty' | transloco }}
                            </p>
                          }
                        </div>
                      </div>
                    </ng-template>
                  }
                </div>

                <!-- New-invite rows need a display name -->
                @if (row.kind === 'email') {
                  <div class="flex flex-1 flex-col gap-1.5">
                    @if (i === 0) {
                      <label hlmLabel [for]="'add-name-' + i">
                        {{ 'projectMembers.fieldName' | transloco }}
                      </label>
                    }
                    <input
                      hlmInput
                      [id]="'add-name-' + i"
                      [value]="row.displayName"
                      (input)="setDisplayName(i, $any($event.target).value)"
                      [placeholder]="'projectMembers.placeholderName' | transloco"
                      autocomplete="off"
                    />
                  </div>
                }

                <div class="flex flex-col gap-1.5">
                  @if (i === 0) {
                    <span hlmLabel>{{ 'projectMembers.selectRole' | transloco }}</span>
                  }
                  <app-select
                    [options]="roleOptions()"
                    [value]="row.roleId"
                    (valueChange)="setRole(i, $event)"
                    [ariaLabel]="'projectMembers.selectRole' | transloco"
                  />
                </div>
                <button
                  type="button"
                  (click)="removeRow(i)"
                  [disabled]="rows_add().length === 1"
                  [attr.aria-label]="'projectMembers.removeRowAria' | transloco"
                  class="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <hlm-icon name="lucideTrash2" size="16px" />
                </button>
              </div>
            }
            <div class="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                (click)="addRow()"
                class="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                data-testid="add-more"
              >
                <hlm-icon name="lucidePlus" size="15px" />
                {{ 'projectMembers.addMore' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="submit()"
                [disabled]="!canSubmit() || submitting()"
                data-testid="add-submit"
              >
                @if (submitting()) {
                  <hlm-spinner class="h-4 w-4" />
                } @else {
                  <hlm-icon name="lucideUserPlus" size="15px" />
                }
                {{ 'projectMembers.add' | transloco }}
              </button>
            </div>
            @if (addError()) {
              <p class="text-sm text-destructive" data-testid="add-error">{{ addError() }}</p>
            }
          </div>
        </section>
      }

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
            [placeholder]="'projectMembers.filterPlaceholder' | transloco"
            class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autocomplete="off"
            spellcheck="false"
            data-testid="project-members-filter"
          />
        </div>
        <app-select
          [options]="roleFilterOptions()"
          [value]="roleFilter()"
          (valueChange)="roleFilter.set($event)"
          [ariaLabel]="'projectMembers.filterRoleAria' | transloco"
        />
        <app-select
          [options]="sortOptions()"
          [value]="sort()"
          (valueChange)="sort.set($event)"
          [ariaLabel]="'projectMembers.sortAria' | transloco"
        />
      </div>

      @if (state() === 'loading') {
        <div
          class="overflow-hidden rounded-2xl border border-border"
          data-testid="project-members-skeleton"
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
        <p class="text-sm text-destructive">{{ 'projectMembers.loadError' | transloco }}</p>
      } @else if (rows().length === 0) {
        <p
          class="rounded-2xl border border-border py-10 text-center text-sm text-muted-foreground"
          data-testid="project-members-empty"
        >
          {{
            (assignments().length === 0 ? 'projectMembers.empty' : 'projectMembers.filterEmpty')
              | transloco
          }}
        </p>
      } @else {
        <div class="overflow-hidden rounded-2xl border border-border">
          <table class="w-full text-sm">
            <tbody>
              @for (a of rows(); track a.id) {
                <tr class="border-b border-border last:border-0" data-testid="project-member-row">
                  <td class="py-3 pr-3 pl-4">
                    <div class="flex min-w-0 items-center gap-3">
                      <app-avatar
                        [name]="a.name"
                        [seed]="a.memberId"
                        [imageUrl]="a.avatarUrl"
                        [size]="34"
                        [circle]="true"
                      />
                      <div class="min-w-0">
                        <p class="truncate font-medium">{{ a.name }}</p>
                        <p class="truncate text-xs text-muted-foreground">{{ a.email }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-3 text-right whitespace-nowrap">
                    @if (canManage()) {
                      <div class="flex justify-end">
                        <app-select
                          size="sm"
                          [options]="roleOptions()"
                          [value]="a.roleId"
                          (valueChange)="changeRole(a, $event)"
                          [ariaLabel]="'projectMembers.selectRole' | transloco"
                        />
                      </div>
                    } @else {
                      <span
                        class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {{ a.roleName }}
                      </span>
                    }
                  </td>
                  <td class="w-12 py-3 pr-3 pl-1 text-right">
                    @if (canManage()) {
                      <button
                        type="button"
                        (click)="askRemove(a)"
                        [attr.aria-label]="'projectMembers.remove' | transloco"
                        class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <hlm-icon name="lucideTrash2" size="16px" />
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Remove confirmation -->
      <app-modal [(open)]="removeOpen">
        <span modalTitle>{{ 'projectMembers.removeTitle' | transloco }}</span>
        @if (removeTarget(); as t) {
          <p>
            {{ 'projectMembers.removeBefore' | transloco }}
            <app-inline-entity [name]="t.name" [seed]="t.memberId" [imageUrl]="t.avatarUrl" />
            {{ 'projectMembers.removeAfter' | transloco }}
          </p>
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
          [disabled]="removing()"
        >
          @if (removing()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'projectMembers.remove' | transloco }}
        </button>
      </app-modal>
    </div>
  `,
})
export class ProjectMembers implements OnInit {
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();
  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly pickerPositions = BELOW_START;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly roles = signal<ProjectRoleResponse[]>([]);
  protected readonly assignments = signal<ProjectMemberResponse[]>([]);
  private readonly orgMembers = signal<MemberResponse[]>([]);

  // Filters.
  protected readonly query = signal('');
  protected readonly roleFilter = signal('all');
  protected readonly sort = signal('recent');

  // Add batch rows (unified: existing member OR new email invite).
  private nextRowKey = 1;
  protected readonly rows_add = signal<AddRow[]>([this.blankRow(0)]);
  protected readonly submitting = signal(false);
  protected readonly addError = signal<string | null>(null);

  // Combobox overlay: which row's picker is open, and its focusable search input(s).
  protected readonly openPickerIndex = signal<number | null>(null);
  private readonly pickerSearch = viewChildren<ElementRef<HTMLInputElement>>('pickerSearch');

  // Remove confirmation modal.
  protected readonly removeOpen = signal(false);
  protected readonly removeTarget = signal<{
    id: string;
    memberId: string;
    name: string;
    avatarUrl: string | null;
  } | null>(null);
  protected readonly removing = signal(false);

  private readonly memberById = computed(
    () => new Map(this.orgMembers().map((m) => [m.id, m] as const)),
  );
  private readonly roleById = computed(() => new Map(this.roles().map((r) => [r.id, r] as const)));

  private readonly translate = translateFn(this.transloco);

  protected readonly roleOptions = computed<SelectOption[]>(() =>
    this.roles().map((r) => ({ value: r.id, label: r.name })),
  );

  protected readonly roleFilterOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    const all = t ? t('projectMembers.filterAllRoles') : '';
    return [
      { value: 'all', label: all },
      ...this.roles().map((r) => ({ value: r.id, label: r.name })),
    ];
  });

  protected readonly sortOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return [
      { value: 'recent', label: t('projectMembers.sortRecent') },
      { value: 'name', label: t('projectMembers.sortName') },
    ];
  });

  constructor() {
    // Focus the picker's search field when its overlay opens.
    effect(() => {
      const i = this.openPickerIndex();
      if (i === null) return;
      queueMicrotask(() => this.pickerSearch()[0]?.nativeElement.focus());
    });
  }

  private blankRow(key: number): AddRow {
    return { key, kind: 'draft', search: '', memberId: '', email: '', displayName: '', roleId: '' };
  }

  /** The org's active members, excluding the current user and anyone already assigned. */
  private readonly assignableMembers = computed(() => {
    const selfUserId = this.store.user()?.id;
    const taken = new Set(this.assignments().map((a) => a.memberId));
    return this.orgMembers().filter(
      (m) => m.status === 'ACTIVE' && !taken.has(m.id) && m.userId !== selfUserId,
    );
  });

  protected memberName(memberId: string): string {
    const m = this.memberById().get(memberId);
    return m?.displayName || m?.email || '';
  }

  protected memberAvatar(memberId: string): string | null {
    const m = this.memberById().get(memberId);
    return m?.userId ? `/api/users/${m.userId}/avatar` : null;
  }

  /** Search results for a row's combobox: assignable members, minus any already chosen in other rows,
   * minus emails already captured in other rows, filtered by the row's search text. */
  protected pickerResults(index: number): MemberResponse[] {
    const rows = this.rows_add();
    const row = rows[index];
    if (!row) return [];
    const chosenMembers = new Set(
      rows
        .filter((_, i) => i !== index)
        .map((r) => r.memberId)
        .filter(Boolean),
    );
    const q = row.search.trim().toLowerCase();
    return this.assignableMembers()
      .filter((m) => !chosenMembers.has(m.id))
      .filter(
        (m) =>
          !q ||
          (m.displayName?.toLowerCase().includes(q) ?? false) ||
          m.email.toLowerCase().includes(q),
      );
  }

  /** When the typed text is a valid email that matches NO assignable member and isn't already
   * captured by another row, returns it so the "invite as new" option can be offered; else null. */
  protected canInviteTyped(index: number): string | null {
    const rows = this.rows_add();
    const row = rows[index];
    if (!row) return null;
    const value = row.search.trim();
    if (!EMAIL_RE.test(value)) return null;
    const lower = value.toLowerCase();
    // An existing assignable member already owns this email → prefer picking them, not inviting.
    if (this.assignableMembers().some((m) => m.email.toLowerCase() === lower)) return null;
    // The current user's own email can't be invited.
    if (this.store.user()?.email?.trim().toLowerCase() === lower) return null;
    // Already captured (as a member email or an email row) elsewhere.
    const takenEmails = new Set(
      rows
        .filter((_, i) => i !== index)
        .flatMap((r) => [r.email.toLowerCase(), this.memberEmail(r.memberId)])
        .filter(Boolean),
    );
    if (takenEmails.has(lower)) return null;
    return value;
  }

  private memberEmail(memberId: string): string {
    return this.memberById().get(memberId)?.email.toLowerCase() ?? '';
  }

  /** At least one complete row (a member+role, or an email+name+role) is required to submit. */
  protected readonly canSubmit = computed(() =>
    this.rows_add().some(
      (r) =>
        (r.kind === 'member' && !!r.memberId && !!r.roleId) ||
        (r.kind === 'email' && !!r.email && !!r.displayName.trim() && !!r.roleId),
    ),
  );

  /** Owner or admin of the active org may manage members; everyone else gets a read-only roster. */
  protected readonly canManage = computed(() => {
    const user = this.store.user();
    if (!user) return false;
    const orgId = this.store.organizationId();
    const org = this.workspace.organizations().find((o) => o.id === orgId);
    if (org?.ownerId === user.id) return true;
    const me = this.orgMembers().find((m) => m.userId === user.id && m.status === 'ACTIVE');
    return me?.role === 'ADMIN' || me?.role === 'OWNER';
  });

  /** Assignment rows decorated with resolved display name, email, avatar and role name, then filtered/sorted. */
  protected readonly rows = computed(() => {
    const t = this.translate();
    const fallback = t ? t('projectMembers.fallbackName') : '';
    let rows = this.assignments().map((a) => {
      const member = this.memberById().get(a.memberId);
      return {
        ...a,
        name: member?.displayName || member?.email || fallback,
        email: member?.email ?? '',
        avatarUrl: member?.userId ? `/api/users/${member.userId}/avatar` : null,
        roleName: a.roleName ?? this.roleById().get(a.roleId)?.name ?? '',
      };
    });
    const q = this.query().trim().toLowerCase();
    const role = this.roleFilter();
    rows = rows.filter((r) => {
      const matchesQuery =
        !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
      const matchesRole = role === 'all' || r.roleId === role;
      return matchesQuery && matchesRole;
    });
    if (this.sort() === 'name') {
      rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  });

  ngOnInit(): void {
    const orgId = this.store.organizationId();
    if (!orgId) {
      this.state.set('error');
      return;
    }
    // Only the assignments list (MEMBER_READ) is required to render the roster. Roles need
    // ROLE_READ — a plain viewer can't read them, so skip that call when they lack it (the
    // role NAMES arrive embedded in each assignment); the roles list only feeds the manager's
    // filter/picker. Org members (orgMember-scoped) resolve names/avatars; both degrade to
    // empty rather than failing the whole page.
    const canReadRoles = this.permissions.isOrgOwnerOrAdmin() || this.permissions.has('ROLE_READ');
    forkJoin({
      roles: canReadRoles
        ? this.api
            .listProjectRoles(orgId, this.projectId())
            .pipe(catchError(() => of([] as ProjectRoleResponse[])))
        : of([] as ProjectRoleResponse[]),
      assignments: this.api.listProjectMembers(orgId, this.projectId()),
      members: this.api.listMembers(orgId).pipe(catchError(() => of([] as MemberResponse[]))),
    }).subscribe({
      next: ({ roles, assignments, members }) => {
        this.roles.set(roles);
        this.assignments.set(assignments);
        this.orgMembers.set(members);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  // --- Combobox overlay ---

  protected openPicker(index: number): void {
    this.openPickerIndex.set(index);
  }

  protected closePicker(): void {
    this.openPickerIndex.set(null);
  }

  protected onPickerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closePicker();
    }
  }

  // --- Add batch rows ---

  protected addRow(): void {
    this.rows_add.update((rows) => [...rows, this.blankRow(this.nextRowKey++)]);
  }

  protected removeRow(index: number): void {
    this.rows_add.update((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
    if (this.openPickerIndex() === index) this.closePicker();
  }

  private patchRow(index: number, patch: Partial<AddRow>): void {
    this.rows_add.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  protected setSearch(index: number, search: string): void {
    this.patchRow(index, { search });
  }

  protected setRole(index: number, roleId: string): void {
    this.patchRow(index, { roleId });
  }

  protected setDisplayName(index: number, displayName: string): void {
    this.patchRow(index, { displayName });
  }

  protected pickMember(index: number, memberId: string): void {
    this.patchRow(index, { kind: 'member', memberId, email: '', displayName: '', search: '' });
    this.closePicker();
  }

  protected pickEmail(index: number, email: string): void {
    this.patchRow(index, { kind: 'email', email, memberId: '', search: email });
    this.closePicker();
  }

  /** Return a fixed member/email row to the searchable draft state. */
  protected resetRow(index: number): void {
    this.patchRow(index, { kind: 'draft', memberId: '', email: '', displayName: '', search: '' });
  }

  protected submit(): void {
    const orgId = this.store.organizationId();
    if (!orgId || !this.canSubmit() || this.submitting()) return;
    const rows = this.rows_add();
    const memberRows = rows.filter((r) => r.kind === 'member' && r.memberId && r.roleId);
    const emailRows = rows.filter(
      (r) => r.kind === 'email' && r.email && r.displayName.trim() && r.roleId,
    );
    if (!memberRows.length && !emailRows.length) return;

    this.submitting.set(true);
    this.addError.set(null);

    // Existing members → one assignProjectMember each; new emails → a single batched invite call.
    const assignCalls: Observable<ProjectMemberResponse>[] = memberRows.map((r) =>
      this.api.assignProjectMember(orgId, this.projectId(), {
        memberId: r.memberId,
        roleId: r.roleId,
      }),
    );
    const invitations: ProjectInvitation[] = emailRows.map((r) => ({
      email: r.email,
      displayName: r.displayName.trim(),
      roleId: r.roleId,
    }));
    const inviteCall: Observable<ProjectMemberResponse[]> = invitations.length
      ? this.api.inviteProjectMembers(orgId, this.projectId(), { invitations })
      : of([]);

    forkJoin({
      assigned: assignCalls.length ? forkJoin(assignCalls) : of([] as ProjectMemberResponse[]),
      invited: inviteCall,
    }).subscribe({
      next: ({ assigned, invited }) => {
        this.assignments.update((list) => [...list, ...assigned, ...invited]);
        this.submitting.set(false);
        this.rows_add.set([this.blankRow(this.nextRowKey++)]);
        this.toast.success(this.transloco.translate('projectMembers.added'));
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const message = messageForError(err, this.transloco);
        this.addError.set(message);
        this.toast.error(message);
      },
    });
  }

  // --- Roster row actions ---

  protected changeRole(assignment: ProjectMemberResponse, roleId: string): void {
    const orgId = this.store.organizationId();
    if (!orgId || roleId === assignment.roleId) return;
    this.api.updateProjectMemberRole(orgId, this.projectId(), assignment.id, { roleId }).subscribe({
      next: (updated) =>
        this.assignments.update((list) => list.map((a) => (a.id === updated.id ? updated : a))),
      error: (err) => this.toast.error(messageForError(err, this.transloco)),
    });
  }

  protected askRemove(row: {
    id: string;
    memberId: string;
    name: string;
    avatarUrl: string | null;
  }): void {
    this.removeTarget.set({
      id: row.id,
      memberId: row.memberId,
      name: row.name,
      avatarUrl: row.avatarUrl,
    });
    this.removeOpen.set(true);
  }

  protected confirmRemove(): void {
    const orgId = this.store.organizationId();
    const target = this.removeTarget();
    if (!orgId || !target || this.removing()) return;
    this.removing.set(true);
    this.api.removeProjectMember(orgId, this.projectId(), target.id).subscribe({
      next: () => {
        this.assignments.update((list) => list.filter((a) => a.id !== target.id));
        this.removing.set(false);
        this.removeOpen.set(false);
        this.toast.success(this.transloco.translate('projectMembers.removed'));
      },
      error: (err) => {
        this.removing.set(false);
        this.removeOpen.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }
}
