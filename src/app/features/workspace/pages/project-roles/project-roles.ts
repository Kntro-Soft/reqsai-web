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
import { provideIcons } from '@ng-icons/core';
import { lucidePencil, lucidePlus, lucideShield, lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import {
  MemberResponse,
  PERMISSION_GROUPS,
  Permission,
  ProjectRoleResponse,
} from '../../data/workspace.models';
import { InlineEntity } from '../../../../shared/components/inline-entity/inline-entity';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

/**
 * Project roles (Vercel-style, mirrors the org members page): a create/edit card with a
 * permission checkbox grid grouped by resource, and a compact single-column roles table
 * with permission chips and edit/delete actions. Deletion is behind a confirmation modal.
 * Only org owners/admins may manage; everyone else gets a read-only list (the backend
 * additionally enforces the ROLE_* permissions per request).
 */
@Component({
  selector: 'app-project-roles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    InlineEntity,
    Modal,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucidePlus, lucidePencil, lucideTrash2, lucideShield })],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'projectRoles.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'projectRoles.subtitle' | transloco }}</p>
      </div>

      <!-- Create / edit role (owner/admin only) -->
      @if (canManage()) {
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex items-start justify-between gap-3 p-5">
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-semibold">
                {{
                  (editingId() ? 'projectRoles.editTitle' : 'projectRoles.createTitle') | transloco
                }}
              </h2>
              <p class="text-sm text-muted-foreground">{{ 'projectRoles.createDesc' | transloco }}</p>
            </div>
          </div>
          <form
            (ngSubmit)="saveRole()"
            class="flex flex-col gap-4 border-t border-border bg-muted/30 p-5"
            data-testid="role-form"
          >
            <div class="flex flex-col gap-1.5 sm:max-w-sm">
              <label hlmLabel for="roleName">{{ 'projectRoles.roleName' | transloco }}</label>
              <input
                hlmInput
                id="roleName"
                [ngModel]="name()"
                name="roleName"
                (ngModelChange)="name.set($event)"
                [placeholder]="'projectRoles.roleNamePlaceholder' | transloco"
                autocomplete="off"
              />
            </div>

            <div class="flex flex-col gap-2">
              <span hlmLabel>{{ 'projectRoles.permissionsLabel' | transloco }}</span>
              <div class="flex flex-col gap-4">
                @for (group of permissionGroups; track group.resourceKey) {
                  <div class="flex flex-col gap-2">
                    <span class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {{ 'projectRoles.resource.' + group.resourceKey | transloco }}
                    </span>
                    <div class="grid gap-2 sm:grid-cols-2">
                      @for (perm of group.permissions; track perm) {
                        <label
                          class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background p-3 text-sm transition-colors hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            class="h-4 w-4 shrink-0 accent-primary"
                            [checked]="permissions().includes(perm)"
                            (change)="togglePermission(perm)"
                          />
                          <span class="min-w-0 font-medium">{{
                            'projectRoles.perm.' + perm | transloco
                          }}</span>
                        </label>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>

            @if (formError()) {
              <p class="text-sm text-destructive" data-testid="role-error">{{ formError() }}</p>
            }

            <div class="flex items-center gap-2">
              <button hlmBtn size="sm" type="submit" [disabled]="!canSave() || saving()">
                @if (saving()) {
                  <hlm-spinner class="h-4 w-4" />
                } @else if (!editingId()) {
                  <hlm-icon name="lucidePlus" size="15px" />
                }
                {{ (editingId() ? 'projectRoles.save' : 'projectRoles.create') | transloco }}
              </button>
              @if (editingId()) {
                <button hlmBtn size="sm" variant="ghost" type="button" (click)="cancelEdit()">
                  {{ 'projectRoles.cancel' | transloco }}
                </button>
              }
            </div>
          </form>
        </section>
      }

      @if (state() === 'loading') {
        <div class="overflow-hidden rounded-2xl border border-border" data-testid="roles-skeleton">
          @for (i of skeletonRows; track i) {
            <div class="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <hlm-skeleton class="h-8 w-8 shrink-0 rounded-lg" />
              <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                <hlm-skeleton class="h-4 w-40" />
                <hlm-skeleton class="h-3 w-56 max-w-full" />
              </div>
              <hlm-skeleton class="h-7 w-16 shrink-0 rounded-md" />
            </div>
          }
        </div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'projectRoles.loadError' | transloco }}</p>
      } @else if (roles().length === 0) {
        <p
          class="rounded-2xl border border-border py-10 text-center text-sm text-muted-foreground"
          data-testid="roles-empty"
        >
          {{ 'projectRoles.empty' | transloco }}
        </p>
      } @else {
        <div class="overflow-hidden rounded-2xl border border-border">
          <table class="w-full text-sm">
            <tbody>
              @for (role of roles(); track role.id) {
                <tr class="border-b border-border last:border-0" data-testid="role-row">
                  <td class="py-3 pr-3 pl-4 align-top">
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
                          {{ 'projectRoles.perm.' + perm | transloco }}
                        </span>
                      } @empty {
                        <span class="text-xs text-muted-foreground">{{
                          'projectRoles.noPermissions' | transloco
                        }}</span>
                      }
                    </div>
                  </td>
                  <td class="w-20 py-3 pr-4 pl-1 text-right align-top">
                    @if (canManage()) {
                      <div class="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          (click)="editRole(role)"
                          [attr.aria-label]="'projectRoles.edit' | transloco"
                          class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <hlm-icon name="lucidePencil" size="15px" />
                        </button>
                        <button
                          type="button"
                          (click)="askDelete(role)"
                          [attr.aria-label]="'projectRoles.delete' | transloco"
                          class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <hlm-icon name="lucideTrash2" size="15px" />
                        </button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Delete confirmation -->
      <app-modal [(open)]="deleteOpen">
        <span modalTitle>{{ 'projectRoles.deleteTitle' | transloco }}</span>
        @if (deleteTarget(); as t) {
          <p>
            {{ 'projectRoles.deleteBefore' | transloco }}
            <app-inline-entity [name]="t.name" [seed]="t.id" />
            {{ 'projectRoles.deleteAfter' | transloco }}
          </p>
        }
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="deleteOpen.set(false)"
        >
          {{ 'projectRoles.cancel' | transloco }}
        </button>
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="destructive"
          type="button"
          (click)="confirmDelete()"
          [disabled]="deleting()"
        >
          @if (deleting()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'projectRoles.delete' | transloco }}
        </button>
      </app-modal>
    </div>
  `,
})
export class ProjectRoles implements OnInit {
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly permissionGroups = PERMISSION_GROUPS;
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly roles = signal<ProjectRoleResponse[]>([]);
  private readonly orgMembers = signal<MemberResponse[]>([]);

  // Create / edit form state. `editingId` is null while creating.
  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  // Delete confirmation modal.
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<{ id: string; name: string } | null>(null);
  protected readonly deleting = signal(false);

  protected readonly canSave = computed(() => !!this.name().trim());

  /** Owner or admin of the active org may manage roles; everyone else gets a read-only list. */
  protected readonly canManage = computed(() => {
    const user = this.store.user();
    if (!user) return false;
    const orgId = this.store.organizationId();
    const org = this.workspace.organizations().find((o) => o.id === orgId);
    if (org?.ownerId === user.id) return true;
    const me = this.orgMembers().find((m) => m.userId === user.id && m.status === 'ACTIVE');
    return me?.role === 'ADMIN' || me?.role === 'OWNER';
  });

  ngOnInit(): void {
    const orgId = this.store.organizationId();
    if (!orgId) {
      this.state.set('error');
      return;
    }
    this.state.set('loading');
    // Roles power the table; the org member list only feeds the manage gate.
    this.api.listProjectRoles(orgId, this.projectId()).subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
    this.api.listMembers(orgId).subscribe({
      next: (members) => this.orgMembers.set(members),
    });
  }

  protected togglePermission(perm: Permission): void {
    this.permissions.update((list) =>
      list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm],
    );
  }

  protected editRole(role: ProjectRoleResponse): void {
    this.formError.set(null);
    this.editingId.set(role.id);
    this.name.set(role.name);
    this.permissions.set([...role.permissions]);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.name.set('');
    this.permissions.set([]);
    this.formError.set(null);
  }

  protected saveRole(): void {
    const orgId = this.store.organizationId();
    if (!orgId || !this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.formError.set(null);
    const editingId = this.editingId();
    const payload = { name: this.name().trim(), permissions: this.permissions() };
    const req = editingId
      ? this.api.updateProjectRole(orgId, this.projectId(), editingId, payload)
      : this.api.createProjectRole(orgId, this.projectId(), payload);
    req.subscribe({
      next: (role) => {
        this.roles.update((list) =>
          editingId ? list.map((r) => (r.id === role.id ? role : r)) : [...list, role],
        );
        this.saving.set(false);
        this.cancelEdit();
        this.toast.success(this.transloco.translate('projectRoles.saved'));
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = this.transloco.translate(
          err.status === 409 ? 'projectRoles.errorNameInUse' : 'projectRoles.errorSave',
        );
        this.formError.set(message);
        this.toast.error(message);
      },
    });
  }

  protected askDelete(role: ProjectRoleResponse): void {
    this.deleteTarget.set({ id: role.id, name: role.name });
    this.deleteOpen.set(true);
  }

  protected confirmDelete(): void {
    const orgId = this.store.organizationId();
    const target = this.deleteTarget();
    if (!orgId || !target || this.deleting()) return;
    this.deleting.set(true);
    this.api.deleteProjectRole(orgId, this.projectId(), target.id).subscribe({
      next: () => {
        this.roles.update((list) => list.filter((r) => r.id !== target.id));
        this.deleting.set(false);
        this.deleteOpen.set(false);
        if (this.editingId() === target.id) this.cancelEdit();
        this.toast.success(this.transloco.translate('projectRoles.deleted'));
      },
      error: (err: HttpErrorResponse) => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.toast.error(
          this.transloco.translate(
            err.status === 409 || err.status === 400
              ? 'projectRoles.errorInUse'
              : 'projectRoles.errorDelete',
          ),
        );
      },
    });
  }
}
