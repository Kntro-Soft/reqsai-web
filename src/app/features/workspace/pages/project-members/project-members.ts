import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { forkJoin } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import { lucideTrash2, lucideUserPlus } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import {
  MemberResponse,
  ProjectMemberResponse,
  ProjectRoleResponse,
} from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { InlineEntity } from '../../../../shared/components/inline-entity/inline-entity';
import { Modal } from '../../../../shared/components/modal/modal';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import { translateFn } from '../../../../core/i18n/translate-fn';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

/**
 * Project members (Vercel-style, mirrors the org members page): an assign card mapping an
 * organization member to a project role, a name filter, and a compact single-column member
 * table with an inline role select and a remove action (behind a confirmation modal). Display
 * names are resolved client-side from the org member list; roles come from the project roles.
 * Only org owners/admins may manage; everyone else gets a read-only roster (the backend
 * additionally enforces the MEMBER_* permissions per request).
 */
@Component({
  selector: 'app-project-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Avatar,
    InlineEntity,
    Modal,
    Select,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideTrash2, lucideUserPlus })],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'projectMembers.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'projectMembers.subtitle' | transloco }}</p>
      </div>

      <!-- Assign (owner/admin only) -->
      @if (canManage()) {
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold">{{ 'projectMembers.assignTitle' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'projectMembers.assignDesc' | transloco }}</p>
          </div>
          <div
            class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5 sm:flex-row sm:items-end"
          >
            <div class="flex flex-1 flex-col gap-1.5">
              <span hlmLabel>{{ 'projectMembers.selectMember' | transloco }}</span>
              <app-select
                [options]="assignableMemberOptions()"
                [value]="newMemberId()"
                (valueChange)="newMemberId.set($event)"
                [ariaLabel]="'projectMembers.selectMember' | transloco"
              />
            </div>
            <div class="flex flex-1 flex-col gap-1.5">
              <span hlmLabel>{{ 'projectMembers.selectRole' | transloco }}</span>
              <app-select
                [options]="roleOptions()"
                [value]="newRoleId()"
                (valueChange)="newRoleId.set($event)"
                [ariaLabel]="'projectMembers.selectRole' | transloco"
              />
            </div>
            <button
              hlmBtn
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
            <p class="px-5 pb-4 text-sm text-destructive" data-testid="assign-error">
              {{ assignError() }}
            </p>
          }
        </section>
      }

      <!-- Filter -->
      <div class="flex flex-wrap items-center gap-2">
        <input
          hlmInput
          type="text"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          [placeholder]="'projectMembers.filterPlaceholder' | transloco"
          class="min-w-0 flex-1"
          data-testid="project-members-filter"
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
          {{ 'projectMembers.empty' | transloco }}
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
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly roles = signal<ProjectRoleResponse[]>([]);
  protected readonly assignments = signal<ProjectMemberResponse[]>([]);
  private readonly orgMembers = signal<MemberResponse[]>([]);

  // Filter.
  protected readonly query = signal('');

  // Assign bar state.
  protected readonly newMemberId = signal('');
  protected readonly newRoleId = signal('');
  protected readonly assigning = signal(false);
  protected readonly assignError = signal<string | null>(null);

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

  /** Org members not already assigned to this project. */
  protected readonly assignableMemberOptions = computed<SelectOption[]>(() => {
    const taken = new Set(this.assignments().map((a) => a.memberId));
    return this.orgMembers()
      .filter((m) => m.status === 'ACTIVE' && !taken.has(m.id))
      .map((m) => ({ value: m.id, label: m.displayName || m.email }));
  });

  protected readonly canAssign = computed(() => !!this.newMemberId() && !!this.newRoleId());

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

  /** Assignment rows decorated with resolved display name, email, avatar and role name. */
  protected readonly rows = computed(() => {
    const t = this.translate();
    const fallback = t ? t('projectMembers.fallbackName') : '';
    const rows = this.assignments().map((a) => {
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
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
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

  protected assign(): void {
    const orgId = this.store.organizationId();
    if (!orgId || !this.canAssign() || this.assigning()) return;
    this.assigning.set(true);
    this.assignError.set(null);
    this.api
      .assignProjectMember(orgId, this.projectId(), {
        memberId: this.newMemberId(),
        roleId: this.newRoleId(),
      })
      .subscribe({
        next: (assignment) => {
          this.assignments.update((list) => [...list, assignment]);
          this.assigning.set(false);
          this.newMemberId.set('');
          this.newRoleId.set('');
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

  protected changeRole(assignment: ProjectMemberResponse, roleId: string): void {
    const orgId = this.store.organizationId();
    if (!orgId || roleId === assignment.roleId) return;
    this.api
      .updateProjectMemberRole(orgId, this.projectId(), assignment.id, { roleId })
      .subscribe({
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
