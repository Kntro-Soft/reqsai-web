import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucidePencil, lucidePlus, lucideSearch, lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse, ProjectRoleResponse } from '../../data/workspace.models';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmButton, HlmIcon, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';

/**
 * Project roles (Vercel-style, mirrors the org members page): a header with a "New role" button that
 * routes to the standalone role form, a filter bar, and a compact single-column roles table with
 * permission chips and edit/delete actions. Editing routes to the same form; deletion is behind a
 * confirmation modal. Only org owners/admins may manage; everyone else gets a read-only list (the
 * backend additionally enforces the ROLE_* permissions per request).
 */
@Component({
  selector: 'app-project-roles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Modal,
    HlmButton,
    HlmIcon,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucidePlus, lucidePencil, lucideSearch, lucideTrash2 })],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ 'projectRoles.title' | transloco }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ 'projectRoles.subtitle' | transloco }}</p>
        </div>
        @if (canManage()) {
          <a hlmBtn size="sm" routerLink="new" data-testid="new-role">
            <hlm-icon name="lucidePlus" size="15px" />
            {{ 'projectRoles.newRole' | transloco }}
          </a>
        }
      </div>

      <!-- Filter -->
      <div class="flex flex-wrap items-center gap-2">
        <div
          class="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-background px-3"
        >
          <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
          <input
            type="text"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            [placeholder]="'projectRoles.filterPlaceholder' | transloco"
            class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autocomplete="off"
            spellcheck="false"
            data-testid="roles-filter"
          />
        </div>
      </div>

      @if (state() === 'loading') {
        <div class="overflow-hidden rounded-2xl border border-border" data-testid="roles-skeleton">
          @for (i of skeletonRows; track i) {
            <div class="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
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
      } @else if (rows().length === 0) {
        <p
          class="rounded-2xl border border-border py-10 text-center text-sm text-muted-foreground"
          data-testid="roles-empty"
        >
          {{ (roles().length === 0 ? 'projectRoles.empty' : 'projectRoles.filterEmpty') | transloco }}
        </p>
      } @else {
        <div class="overflow-hidden rounded-2xl border border-border">
          <table class="w-full text-sm">
            <tbody>
              @for (role of rows(); track role.id) {
                <tr class="border-b border-border last:border-0" data-testid="role-row">
                  <td class="py-3 pr-3 pl-4 align-top">
                    <span class="font-medium">{{ role.name }}</span>
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
                        <a
                          [routerLink]="[role.id, 'edit']"
                          [attr.aria-label]="'projectRoles.edit' | transloco"
                          class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <hlm-icon name="lucidePencil" size="15px" />
                        </a>
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
            <strong class="font-semibold text-foreground">{{ t.name }}</strong>
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

  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly roles = signal<ProjectRoleResponse[]>([]);
  private readonly orgMembers = signal<MemberResponse[]>([]);

  // Filter.
  protected readonly query = signal('');

  // Delete confirmation modal.
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<{ id: string; name: string } | null>(null);
  protected readonly deleting = signal(false);

  /** Roles after the name filter is applied. */
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.roles();
    if (!q) return list;
    return list.filter((r) => r.name.toLowerCase().includes(q));
  });

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
