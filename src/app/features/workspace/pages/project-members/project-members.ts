import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import { lucideMailPlus, lucidePlus, lucideSearch, lucideTrash2, lucideUserPlus } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
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
import { ToastService } from '../../../../shared/toast/toast.service';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';

/**
 * Project members (Vercel-style, mirrors the org members page). Owner/admins get a batch "assign
 * existing members" card (rows of member + role, "Add more", remove-row) and — org owner/admin only —
 * a batch "invite new people by email" card. A filter bar (search + role filter + sort) narrows the
 * roster, a compact single-column table shows each assignment with an inline role select and a remove
 * action (behind a confirmation modal). Names are resolved client-side from the org member list; the
 * current user and already-assigned members are excluded from the assign pickers. Only org owners/admins
 * may manage; everyone else gets a read-only roster (the backend enforces MEMBER_* per request).
 */
@Component({
  selector: 'app-project-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
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
    provideIcons({ lucideMailPlus, lucidePlus, lucideSearch, lucideTrash2, lucideUserPlus }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'projectMembers.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'projectMembers.subtitle' | transloco }}</p>
      </div>

      <!-- Assign existing members (owner/admin only) — batch rows -->
      @if (canManage()) {
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold">{{ 'projectMembers.assignTitle' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'projectMembers.assignDesc' | transloco }}</p>
          </div>
          <div class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5">
            @for (row of assignRows(); track row.key; let i = $index) {
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div class="flex flex-1 flex-col gap-1.5">
                  @if (i === 0) {
                    <span hlmLabel>{{ 'projectMembers.selectMember' | transloco }}</span>
                  }
                  <app-select
                    [options]="assignableOptionsFor(row.memberId)"
                    [value]="row.memberId"
                    (valueChange)="setAssignMember(i, $event)"
                    [ariaLabel]="'projectMembers.selectMember' | transloco"
                  />
                </div>
                <div class="flex flex-1 flex-col gap-1.5">
                  @if (i === 0) {
                    <span hlmLabel>{{ 'projectMembers.selectRole' | transloco }}</span>
                  }
                  <app-select
                    [options]="roleOptions()"
                    [value]="row.roleId"
                    (valueChange)="setAssignRole(i, $event)"
                    [ariaLabel]="'projectMembers.selectRole' | transloco"
                  />
                </div>
                <button
                  type="button"
                  (click)="removeAssignRow(i)"
                  [disabled]="assignRows().length === 1"
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
                (click)="addAssignRow()"
                class="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                data-testid="assign-add-more"
              >
                <hlm-icon name="lucidePlus" size="15px" />
                {{ 'projectMembers.addMore' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="assign()"
                [disabled]="!canAssign() || assigning()"
                data-testid="assign-submit"
              >
                @if (assigning()) {
                  <hlm-spinner class="h-4 w-4" />
                } @else {
                  <hlm-icon name="lucideUserPlus" size="15px" />
                }
                {{ 'projectMembers.assign' | transloco }}
              </button>
            </div>
            @if (assignError()) {
              <p class="text-sm text-destructive" data-testid="assign-error">{{ assignError() }}</p>
            }
          </div>
        </section>
      }

      <!-- Invite new people by email (org owner/admin only) — batch rows -->
      @if (canInvite()) {
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold">{{ 'projectMembers.inviteTitle' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'projectMembers.inviteDesc' | transloco }}</p>
          </div>
          <form
            [formGroup]="inviteForm"
            (ngSubmit)="invite()"
            class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5"
          >
            <div formArrayName="invites" class="flex flex-col gap-3">
              @for (grp of invites.controls; track grp; let i = $index) {
                <div [formGroupName]="i" class="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div class="flex flex-1 flex-col gap-1.5">
                    @if (i === 0) {
                      <label hlmLabel [for]="'invite-email' + i">
                        {{ 'projectMembers.fieldEmail' | transloco }}
                      </label>
                    }
                    <input
                      hlmInput
                      [id]="'invite-email' + i"
                      type="email"
                      formControlName="email"
                      [placeholder]="'projectMembers.placeholderEmail' | transloco"
                    />
                    @if (grp.controls.email.errors?.['selfInvite'] && grp.controls.email.touched) {
                      <p class="text-xs text-destructive" data-testid="invite-self-error">
                        {{ 'projectMembers.errorSelfInvite' | transloco }}
                      </p>
                    }
                  </div>
                  <div class="flex flex-1 flex-col gap-1.5">
                    @if (i === 0) {
                      <label hlmLabel [for]="'invite-name' + i">
                        {{ 'projectMembers.fieldName' | transloco }}
                      </label>
                    }
                    <input
                      hlmInput
                      [id]="'invite-name' + i"
                      formControlName="displayName"
                      [placeholder]="'projectMembers.placeholderName' | transloco"
                    />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    @if (i === 0) {
                      <span hlmLabel>{{ 'projectMembers.selectRole' | transloco }}</span>
                    }
                    <app-select
                      [options]="roleOptions()"
                      [value]="grp.controls.roleId.value"
                      (valueChange)="grp.controls.roleId.setValue($any($event))"
                      [ariaLabel]="'projectMembers.selectRole' | transloco"
                    />
                  </div>
                  <button
                    type="button"
                    (click)="removeInviteRow(i)"
                    [disabled]="invites.length === 1"
                    [attr.aria-label]="'projectMembers.removeRowAria' | transloco"
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
                (click)="addInviteRow()"
                class="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                data-testid="invite-add-more"
              >
                <hlm-icon name="lucidePlus" size="15px" />
                {{ 'projectMembers.addMore' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                type="submit"
                [disabled]="inviteForm.invalid || !roles().length || inviting()"
                data-testid="invite-submit"
              >
                @if (inviting()) {
                  <hlm-spinner class="h-4 w-4" />
                } @else {
                  <hlm-icon name="lucideMailPlus" size="15px" />
                }
                {{ 'projectMembers.inviteSubmit' | transloco }}
              </button>
            </div>
            @if (inviteError()) {
              <p class="text-sm text-destructive" data-testid="invite-error">{{ inviteError() }}</p>
            }
          </form>
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
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly roles = signal<ProjectRoleResponse[]>([]);
  protected readonly assignments = signal<ProjectMemberResponse[]>([]);
  private readonly orgMembers = signal<MemberResponse[]>([]);

  // Filters.
  protected readonly query = signal('');
  protected readonly roleFilter = signal('all');
  protected readonly sort = signal('recent');

  // Assign batch rows (member + role); `key` is a stable track id for the @for.
  private nextRowKey = 1;
  protected readonly assignRows = signal<{ key: number; memberId: string; roleId: string }[]>([
    { key: 0, memberId: '', roleId: '' },
  ]);
  protected readonly assigning = signal(false);
  protected readonly assignError = signal<string | null>(null);

  // Invite batch form.
  protected readonly inviteForm = this.fb.group({
    invites: this.fb.array([this.newInviteGroup()]),
  });
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);

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
    return [{ value: 'all', label: all }, ...this.roles().map((r) => ({ value: r.id, label: r.name }))];
  });

  protected readonly sortOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return [
      { value: 'recent', label: t('projectMembers.sortRecent') },
      { value: 'name', label: t('projectMembers.sortName') },
    ];
  });

  get invites() {
    return this.inviteForm.controls.invites;
  }

  /** Rejects an invite email matching the signed-in user's own address (case-insensitive). */
  private readonly selfInviteValidator = (control: AbstractControl): ValidationErrors | null => {
    const own = this.store.user()?.email?.trim().toLowerCase();
    const value = (control.value as string)?.trim().toLowerCase();
    return own && value && value === own ? { selfInvite: true } : null;
  };

  private newInviteGroup() {
    return this.fb.nonNullable.group({
      email: ['', [Validators.required, Validators.email, this.selfInviteValidator]],
      displayName: ['', [Validators.required, Validators.maxLength(150)]],
      roleId: ['', [Validators.required]],
    });
  }

  /** The org's active members, excluding the current user, that could be assigned. */
  private readonly assignableMembers = computed(() => {
    const selfUserId = this.store.user()?.id;
    const taken = new Set(this.assignments().map((a) => a.memberId));
    return this.orgMembers().filter(
      (m) => m.status === 'ACTIVE' && !taken.has(m.id) && m.userId !== selfUserId,
    );
  });

  /** Assignable member options for a given row, also excluding members picked in OTHER rows. */
  protected assignableOptionsFor(currentMemberId: string): SelectOption[] {
    const chosenElsewhere = new Set(
      this.assignRows()
        .map((r) => r.memberId)
        .filter((id) => id && id !== currentMemberId),
    );
    return this.assignableMembers()
      .filter((m) => !chosenElsewhere.has(m.id))
      .map((m) => ({ value: m.id, label: m.displayName || m.email }));
  }

  /** At least one complete row (member + role) is required to submit. */
  protected readonly canAssign = computed(() =>
    this.assignRows().some((r) => !!r.memberId && !!r.roleId),
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

  /** Inviting NEW people by email is limited to org owner/admin (same gate as managing). */
  protected readonly canInvite = this.canManage;

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
        roleName: this.roleById().get(a.roleId)?.name ?? '',
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
    forkJoin({
      roles: this.api.listProjectRoles(orgId, this.projectId()),
      assignments: this.api.listProjectMembers(orgId, this.projectId()),
      members: this.api.listMembers(orgId),
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

  // --- Assign batch rows ---

  protected addAssignRow(): void {
    this.assignRows.update((rows) => [...rows, { key: this.nextRowKey++, memberId: '', roleId: '' }]);
  }

  protected removeAssignRow(index: number): void {
    this.assignRows.update((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  }

  protected setAssignMember(index: number, memberId: string): void {
    this.assignRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, memberId } : r)));
  }

  protected setAssignRole(index: number, roleId: string): void {
    this.assignRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, roleId } : r)));
  }

  protected assign(): void {
    const orgId = this.store.organizationId();
    if (!orgId || !this.canAssign() || this.assigning()) return;
    const complete = this.assignRows().filter((r) => r.memberId && r.roleId);
    if (!complete.length) return;
    this.assigning.set(true);
    this.assignError.set(null);
    forkJoin(
      complete.map((r) =>
        this.api.assignProjectMember(orgId, this.projectId(), {
          memberId: r.memberId,
          roleId: r.roleId,
        }),
      ),
    ).subscribe({
      next: (created) => {
        this.assignments.update((list) => [...list, ...created]);
        this.assigning.set(false);
        this.assignRows.set([{ key: this.nextRowKey++, memberId: '', roleId: '' }]);
        this.toast.success(this.transloco.translate('projectMembers.assigned'));
      },
      error: () => {
        this.assigning.set(false);
        const message = this.transloco.translate('projectMembers.errorAssign');
        this.assignError.set(message);
        this.toast.error(message);
      },
    });
  }

  // --- Invite new people by email ---

  protected addInviteRow(): void {
    this.invites.push(this.newInviteGroup());
  }

  protected removeInviteRow(index: number): void {
    if (this.invites.length > 1) this.invites.removeAt(index);
  }

  protected invite(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.inviteForm.invalid || this.inviting()) return;
    this.inviting.set(true);
    this.inviteError.set(null);
    const invitations = this.invites.getRawValue() as ProjectInvitation[];
    this.api.inviteProjectMembers(orgId, this.projectId(), { invitations }).subscribe({
      next: (created) => {
        this.assignments.update((list) => [...list, ...created]);
        this.inviting.set(false);
        this.inviteForm.setControl('invites', this.fb.array([this.newInviteGroup()]));
        this.toast.success(this.transloco.translate('toast.invitesSent'));
      },
      error: (err: HttpErrorResponse) => {
        this.inviting.set(false);
        const message = this.transloco.translate(
          err.status === 409 ? 'projectMembers.errorAlreadyInvited' : 'projectMembers.errorInvite',
        );
        this.inviteError.set(message);
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
      error: () => this.toast.error(this.transloco.translate('projectMembers.errorAssign')),
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
      error: () => {
        this.removing.set(false);
        this.removeOpen.set(false);
        this.toast.error(this.transloco.translate('projectMembers.errorRemove'));
      },
    });
  }
}
