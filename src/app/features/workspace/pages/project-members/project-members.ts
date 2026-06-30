import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import { lucidePencil, lucidePlus, lucideShield, lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import {
  MemberResponse,
  PERMISSIONS,
  Permission,
  ProjectMemberResponse,
  ProjectRoleResponse,
} from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

/**
 * Project members & roles (Vercel-style). Two cards: dynamic project roles with a
 * permission grid (create / edit / delete) and the member assignments mapping org
 * members to a project role. Display names are resolved client-side from the org
 * member list and the role list (the assignment payload only carries ids).
 */
@Component({
  selector: 'app-project-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Avatar,
    Select,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucidePlus, lucidePencil, lucideTrash2, lucideShield })],
  template: `
    <div class="flex flex-col gap-8">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'projectMembers.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'projectMembers.subtitle' | transloco }}
        </p>
      </div>

      @if (state() === 'loading') {
        <div class="flex justify-center py-10"><hlm-spinner class="h-6 w-6" /></div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'projectMembers.loadError' | transloco }}</p>
      } @else {
        <!-- ROLES -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex items-start justify-between gap-3 p-5">
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-semibold">{{ 'projectMembers.rolesTitle' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">
                {{ 'projectMembers.rolesDesc' | transloco }}
              </p>
            </div>
            @if (!roleForm()) {
              <button hlmBtn size="sm" variant="outline" type="button" (click)="newRole()">
                <hlm-icon name="lucidePlus" size="16px" />
                {{ 'projectMembers.addRole' | transloco }}
              </button>
            }
          </div>

          @if (roleForm(); as f) {
            <form
              (ngSubmit)="saveRole()"
              class="flex flex-col gap-4 border-t border-border bg-muted/30 p-5"
              data-testid="role-form"
            >
              <div class="flex flex-col gap-1.5 sm:max-w-sm">
                <label hlmLabel for="roleName">{{ 'projectMembers.roleName' | transloco }}</label>
                <input
                  hlmInput
                  id="roleName"
                  [ngModel]="f.name"
                  name="roleName"
                  (ngModelChange)="setRoleName($event)"
                  [placeholder]="'projectMembers.roleNamePlaceholder' | transloco"
                  autocomplete="off"
                />
              </div>
              <div class="flex flex-col gap-2">
                <span hlmLabel>{{ 'projectMembers.permissionsLabel' | transloco }}</span>
                <div class="grid gap-2 sm:grid-cols-2">
                  @for (perm of allPermissions; track perm) {
                    <label
                      class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background p-3 text-sm transition-colors hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        [checked]="f.permissions.includes(perm)"
                        (change)="togglePermission(perm)"
                      />
                      <span class="min-w-0">
                        <span class="block font-medium">{{
                          'permissions.' + perm + '.label' | transloco
                        }}</span>
                        <span class="block text-xs text-muted-foreground">{{
                          'permissions.' + perm + '.desc' | transloco
                        }}</span>
                      </span>
                    </label>
                  }
                </div>
              </div>
              @if (roleError()) {
                <p class="text-sm text-destructive" data-testid="role-error">{{ roleError() }}</p>
              }
              <div class="flex items-center gap-2">
                <button hlmBtn size="sm" type="submit" [disabled]="!canSaveRole() || savingRole()">
                  @if (savingRole()) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'common.save' | transloco }}
                </button>
                <button
                  hlmBtn
                  size="sm"
                  variant="ghost"
                  type="button"
                  (click)="cancelRole()"
                >
                  {{ 'common.cancel' | transloco }}
                </button>
              </div>
            </form>
          }

          @if (roles().length === 0 && !roleForm()) {
            <p class="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
              {{ 'projectMembers.rolesEmpty' | transloco }}
            </p>
          } @else if (roles().length > 0) {
            <table class="w-full border-t border-border text-sm">
              <tbody>
                @for (role of roles(); track role.id) {
                  <tr class="border-b border-border last:border-0" data-testid="role-row">
                    <td class="py-3 pl-5 pr-3">
                      <div class="flex items-center gap-2.5">
                        <span
                          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"
                        >
                          <hlm-icon name="lucideShield" size="16px" />
                        </span>
                        <span class="font-medium">{{ role.name }}</span>
                      </div>
                    </td>
                    <td class="px-3 py-3">
                      <div class="flex flex-wrap gap-1">
                        @for (perm of role.permissions; track perm) {
                          <span
                            class="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          >
                            {{ 'permissions.' + perm + '.label' | transloco }}
                          </span>
                        } @empty {
                          <span class="text-xs text-muted-foreground">{{
                            'projectMembers.noPermissions' | transloco
                          }}</span>
                        }
                      </div>
                    </td>
                    <td class="w-20 py-3 pl-1 pr-4">
                      <div class="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          (click)="editRole(role)"
                          [attr.aria-label]="'projectMembers.editRoleAria' | transloco"
                          class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <hlm-icon name="lucidePencil" size="15px" />
                        </button>
                        <button
                          type="button"
                          (click)="deleteRole(role)"
                          [attr.aria-label]="'projectMembers.deleteRoleAria' | transloco"
                          class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <hlm-icon name="lucideTrash2" size="15px" />
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <!-- MEMBERS -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold">{{ 'projectMembers.assignTitle' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">
              {{ 'projectMembers.assignDesc' | transloco }}
            </p>
          </div>

          <div
            class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5 sm:flex-row sm:items-end"
          >
            <div class="flex flex-1 flex-col gap-1.5">
              <span hlmLabel>{{ 'projectMembers.fieldMember' | transloco }}</span>
              <app-select
                [options]="assignableMemberOptions()"
                [value]="newMemberId()"
                (valueChange)="newMemberId.set($event)"
                [ariaLabel]="'projectMembers.fieldMember' | transloco"
              />
            </div>
            <div class="flex flex-1 flex-col gap-1.5">
              <span hlmLabel>{{ 'projectMembers.fieldRole' | transloco }}</span>
              <app-select
                [options]="roleOptions()"
                [value]="newRoleId()"
                (valueChange)="newRoleId.set($event)"
                [ariaLabel]="'projectMembers.fieldRole' | transloco"
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
              }
              {{ 'projectMembers.assign' | transloco }}
            </button>
          </div>
          @if (assignError()) {
            <p class="px-5 pb-4 text-sm text-destructive" data-testid="assign-error">
              {{ assignError() }}
            </p>
          }

          @if (assignments().length === 0) {
            <p
              class="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground"
              data-testid="project-members-empty"
            >
              {{ 'projectMembers.emptyBody' | transloco }}
            </p>
          } @else {
            <table class="w-full border-t border-border text-sm">
              <tbody>
                @for (a of assignments(); track a.id) {
                  <tr class="border-b border-border last:border-0" data-testid="project-member-row">
                    <td class="py-3 pl-5 pr-3">
                      <div class="flex min-w-0 items-center gap-3">
                        <app-avatar
                          [name]="name(a.memberId)"
                          [seed]="a.memberId"
                          [size]="34"
                          [circle]="true"
                        />
                        <div class="min-w-0">
                          <p class="truncate font-medium">{{ name(a.memberId) }}</p>
                          <p class="truncate text-xs text-muted-foreground">{{ email(a.memberId) }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-3 text-right whitespace-nowrap">
                      <app-select
                        size="sm"
                        [options]="roleOptions()"
                        [value]="a.roleId"
                        (valueChange)="changeRole(a, $event)"
                        [ariaLabel]="'projectMembers.fieldRole' | transloco"
                      />
                    </td>
                    <td class="w-12 py-3 pl-1 pr-4 text-right">
                      <button
                        type="button"
                        (click)="removeAssignment(a)"
                        [attr.aria-label]="'projectMembers.removeAria' | transloco"
                        class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <hlm-icon name="lucideTrash2" size="16px" />
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      }
    </div>
  `,
})
export class ProjectMembers implements OnInit {
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();
  protected readonly allPermissions = PERMISSIONS;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly roles = signal<ProjectRoleResponse[]>([]);
  protected readonly assignments = signal<ProjectMemberResponse[]>([]);
  private readonly orgMembers = signal<MemberResponse[]>([]);

  // Role create/edit panel state (null = closed).
  protected readonly roleForm = signal<{
    id: string | null;
    name: string;
    permissions: Permission[];
  } | null>(null);
  protected readonly savingRole = signal(false);
  protected readonly roleError = signal<string | null>(null);

  // Assign bar state.
  protected readonly newMemberId = signal('');
  protected readonly newRoleId = signal('');
  protected readonly assigning = signal(false);
  protected readonly assignError = signal<string | null>(null);

  private readonly byId = computed(() => new Map(this.orgMembers().map((m) => [m.id, m] as const)));

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

  protected readonly canSaveRole = computed(() => !!this.roleForm()?.name.trim());

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

  // --- Display resolution ---

  protected name(memberId: string): string {
    return (
      this.byId().get(memberId)?.displayName ||
      this.byId().get(memberId)?.email ||
      this.transloco.translate('projectMembers.fallbackName')
    );
  }

  protected email(memberId: string): string {
    return this.byId().get(memberId)?.email ?? '';
  }

  // --- Roles ---

  protected newRole(): void {
    this.roleError.set(null);
    this.roleForm.set({ id: null, name: '', permissions: ['READ_PROJECT'] });
  }

  protected editRole(role: ProjectRoleResponse): void {
    this.roleError.set(null);
    this.roleForm.set({ id: role.id, name: role.name, permissions: [...role.permissions] });
  }

  protected cancelRole(): void {
    this.roleForm.set(null);
    this.roleError.set(null);
  }

  protected setRoleName(name: string): void {
    this.roleForm.update((f) => (f ? { ...f, name } : f));
  }

  protected togglePermission(perm: Permission): void {
    this.roleForm.update((f) => {
      if (!f) return f;
      const has = f.permissions.includes(perm);
      return {
        ...f,
        permissions: has ? f.permissions.filter((p) => p !== perm) : [...f.permissions, perm],
      };
    });
  }

  protected saveRole(): void {
    const orgId = this.store.organizationId();
    const f = this.roleForm();
    if (!orgId || !f || !f.name.trim() || this.savingRole()) return;
    this.savingRole.set(true);
    this.roleError.set(null);
    const payload = { name: f.name.trim(), permissions: f.permissions };
    const req = f.id
      ? this.api.updateProjectRole(orgId, this.projectId(), f.id, payload)
      : this.api.createProjectRole(orgId, this.projectId(), payload);
    req.subscribe({
      next: (role) => {
        this.roles.update((list) =>
          f.id ? list.map((r) => (r.id === role.id ? role : r)) : [...list, role],
        );
        this.savingRole.set(false);
        this.roleForm.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.savingRole.set(false);
        this.roleError.set(
          this.transloco.translate(
            err.status === 409 ? 'projectMembers.errorRoleNameInUse' : 'projectMembers.errorRoleSave',
          ),
        );
      },
    });
  }

  protected deleteRole(role: ProjectRoleResponse): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.roleError.set(null);
    this.api.deleteProjectRole(orgId, this.projectId(), role.id).subscribe({
      next: () => this.roles.update((list) => list.filter((r) => r.id !== role.id)),
      error: (err: HttpErrorResponse) =>
        this.roleError.set(
          this.transloco.translate(
            err.status === 409 || err.status === 400
              ? 'projectMembers.errorRoleInUse'
              : 'projectMembers.errorRoleDelete',
          ),
        ),
    });
  }

  // --- Member assignments ---

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
        },
        error: () => {
          this.assigning.set(false);
          this.assignError.set(this.transloco.translate('projectMembers.errorAssign'));
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
          this.assignments.update((list) =>
            list.map((a) => (a.id === updated.id ? updated : a)),
          ),
        error: () => this.assignError.set(this.transloco.translate('projectMembers.errorAssign')),
      });
  }

  protected removeAssignment(assignment: ProjectMemberResponse): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.api.removeProjectMember(orgId, this.projectId(), assignment.id).subscribe({
      next: () => this.assignments.update((list) => list.filter((a) => a.id !== assignment.id)),
    });
  }
}
