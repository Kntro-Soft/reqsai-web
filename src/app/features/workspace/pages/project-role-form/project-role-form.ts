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
import { Router } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideChevronDown, lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { PERMISSION_GROUPS, Permission } from '../../data/workspace.models';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { Indeterminate } from '../../../../shared/directives/indeterminate';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';

/**
 * Create / edit a project role on its own page (extracted from the roles list). A role-name input plus
 * a searchable, collapsible permission matrix grouped by resource, each group with a tri-state
 * "select all" header checkbox (GitHub/Linear pattern). The permissions area scrolls internally so the
 * sticky Save / Cancel footer stays visible. Saves to createProjectRole / updateProjectRole and
 * navigates back to the roles list on success or cancel. Mirrors the org members page styling.
 */
@Component({
  selector: 'app-project-role-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Indeterminate,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideArrowLeft, lucideChevronDown, lucidePlus, lucideSearch })],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <button
          type="button"
          (click)="cancel()"
          class="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid="role-form-back"
        >
          <hlm-icon name="lucideArrowLeft" size="15px" />
          {{ 'projectRoleForm.back' | transloco }}
        </button>
        <div>
          <h1 class="text-2xl font-bold tracking-tight">
            {{ (editing() ? 'projectRoleForm.editTitle' : 'projectRoleForm.createTitle') | transloco }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ 'projectRoleForm.subtitle' | transloco }}
          </p>
        </div>
      </div>

      @if (state() === 'loading') {
        <section class="overflow-hidden rounded-2xl border border-border" data-testid="role-form-skeleton">
          <div class="flex flex-col gap-4 p-5">
            <hlm-skeleton class="h-10 w-full max-w-sm rounded-md" />
            <hlm-skeleton class="h-24 w-full rounded-md" />
            <hlm-skeleton class="h-24 w-full rounded-md" />
          </div>
        </section>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'projectRoleForm.loadError' | transloco }}</p>
      } @else {
        <section class="flex max-h-[calc(100vh-14rem)] flex-col overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-4 p-5 pb-4">
            <div class="flex flex-col gap-1.5 sm:max-w-sm">
              <label hlmLabel for="roleName">{{ 'projectRoleForm.roleName' | transloco }}</label>
              <input
                hlmInput
                id="roleName"
                [ngModel]="name()"
                name="roleName"
                (ngModelChange)="name.set($event)"
                [placeholder]="'projectRoleForm.roleNamePlaceholder' | transloco"
                autocomplete="off"
              />
            </div>

            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2">
                <span hlmLabel>{{ 'projectRoleForm.permissionsLabel' | transloco }}</span>
                <span class="text-xs text-muted-foreground" data-testid="role-selected-count">
                  {{ 'projectRoleForm.selectedCount' | transloco: { count: permissions().length } }}
                </span>
              </div>
              <!-- Search -->
              <div
                class="flex items-center gap-2 rounded-md border border-input bg-background px-3"
              >
                <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  [value]="query()"
                  (input)="query.set($any($event.target).value)"
                  [placeholder]="'projectRoleForm.searchPlaceholder' | transloco"
                  class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  autocomplete="off"
                  spellcheck="false"
                  data-testid="perm-search"
                />
              </div>
              <div class="flex justify-end">
                <button
                  type="button"
                  (click)="toggleAll()"
                  class="cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  data-testid="perm-toggle-all"
                >
                  {{
                    (allCollapsed() ? 'projectRoleForm.expandAll' : 'projectRoleForm.collapseAll')
                      | transloco
                  }}
                </button>
              </div>
            </div>
          </div>

          <!-- Permission matrix (scrolls internally) -->
          <div class="min-h-0 flex-1 overflow-y-auto border-t border-border px-5 py-4">
            <div class="flex flex-col gap-3">
              @for (group of visibleGroups(); track group.resourceKey) {
                <div class="overflow-hidden rounded-lg border border-border">
                  <div
                    class="flex items-center gap-2 bg-muted/30 px-3 py-2.5"
                  >
                    <label class="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        [checked]="group.checked"
                        [appIndeterminate]="group.indeterminate"
                        (change)="toggleGroup(group.resourceKey)"
                        [attr.aria-label]="'projectRoleForm.selectAllGroup' | transloco"
                        [attr.data-testid]="'perm-group-all-' + group.resourceKey"
                      />
                      <span class="flex min-w-0 flex-col gap-0.5">
                        <span class="text-xs font-semibold tracking-wide text-foreground uppercase">
                          {{ 'projectRoles.resource.' + group.resourceKey | transloco }}
                        </span>
                        <span class="text-xs font-normal normal-case text-muted-foreground">
                          {{ group.description }}
                        </span>
                      </span>
                    </label>
                    <div class="flex shrink-0 items-center gap-1 self-start">
                      <span class="text-xs tabular-nums text-muted-foreground">
                        {{ group.selectedCount }}/{{ group.total }}
                      </span>
                      <button
                        type="button"
                        (click)="toggleCollapsed(group.resourceKey)"
                        [attr.aria-expanded]="!group.collapsed"
                        [attr.aria-label]="'projectRoleForm.toggleGroup' | transloco"
                        [attr.data-testid]="'perm-group-toggle-' + group.resourceKey"
                        class="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <hlm-icon
                          name="lucideChevronDown"
                          size="15px"
                          class="transition-transform"
                          [class.-rotate-90]="group.collapsed"
                        />
                      </button>
                    </div>
                  </div>
                  @if (!group.collapsed) {
                    <div class="grid gap-2 p-3 sm:grid-cols-2">
                      @for (perm of group.permissions; track perm.value) {
                        <label
                          class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background p-3 text-sm transition-colors hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                            [checked]="perm.selected"
                            (change)="togglePermission(perm.value)"
                            [attr.data-testid]="'perm-' + perm.value"
                          />
                          <span class="flex min-w-0 flex-col gap-0.5">
                            <span class="font-medium">{{ perm.label }}</span>
                            <span class="text-xs text-muted-foreground">{{ perm.description }}</span>
                          </span>
                        </label>
                      }
                    </div>
                  }
                </div>
              } @empty {
                <p
                  class="py-8 text-center text-sm text-muted-foreground"
                  data-testid="perm-search-empty"
                >
                  {{ 'projectRoleForm.searchEmpty' | transloco }}
                </p>
              }
            </div>
          </div>

          @if (formError()) {
            <p class="border-t border-border px-5 pt-3 text-sm text-destructive" data-testid="role-error">
              {{ formError() }}
            </p>
          }

          <!-- Sticky footer -->
          <div
            class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
          >
            <button hlmBtn size="sm" variant="ghost" type="button" (click)="cancel()">
              {{ 'projectRoleForm.cancel' | transloco }}
            </button>
            <button
              hlmBtn
              size="sm"
              type="button"
              (click)="save()"
              [disabled]="!canSave() || saving()"
              data-testid="role-form-save"
            >
              @if (saving()) {
                <hlm-spinner class="h-4 w-4" />
              } @else if (!editing()) {
                <hlm-icon name="lucidePlus" size="15px" />
              }
              {{ (editing() ? 'projectRoleForm.save' : 'projectRoleForm.create') | transloco }}
            </button>
          </div>
        </section>
      }
    </div>
  `,
})
export class ProjectRoleForm implements OnInit {
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  /** Both bound from the route via withComponentInputBinding() (projectId inherited from the parent). */
  readonly projectId = input.required<string>();
  readonly roleId = input<string>();

  protected readonly editing = computed(() => !!this.roleId());
  protected readonly state = signal<'loading' | 'ready' | 'error'>('ready');
  protected readonly name = signal('');
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  // Permission-editor UI state. Groups start collapsed (progressive disclosure over 20 permissions).
  protected readonly query = signal('');
  private readonly collapsed = signal<Set<string>>(
    new Set(PERMISSION_GROUPS.map((g) => g.resourceKey)),
  );

  private readonly translate = translateFn(this.transloco);

  /** Save requires a non-empty name AND at least one selected permission. */
  protected readonly canSave = computed(
    () => !!this.name().trim() && this.permissions().length > 0,
  );

  /** True when every group is collapsed — drives the expand-all / collapse-all toggle label. */
  protected readonly allCollapsed = computed(
    () => this.collapsed().size >= PERMISSION_GROUPS.length,
  );

  /**
   * The permission groups decorated for the template: per-permission selected flag + translated
   * label (filtered by the search query), and per-group selected/indeterminate/count state. Groups
   * with zero permissions matching an active filter are dropped.
   */
  protected readonly visibleGroups = computed(() => {
    const t = this.translate();
    if (!t) return [];
    const selected = new Set(this.permissions());
    const collapsed = this.collapsed();
    const q = this.query().trim().toLowerCase();
    return PERMISSION_GROUPS.map((group) => {
      const perms = group.permissions.map((value) => ({
        value,
        label: t('projectRoles.perm.' + value),
        description: t('projectRoles.permDesc.' + value),
        selected: selected.has(value),
      }));
      const matching = q
        ? perms.filter(
            (p) =>
              p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
          )
        : perms;
      const total = group.permissions.length;
      const selectedCount = group.permissions.filter((p) => selected.has(p)).length;
      return {
        resourceKey: group.resourceKey,
        description: t('projectRoles.groupDesc.' + group.resourceKey),
        permissions: matching,
        total,
        selectedCount,
        checked: selectedCount === total,
        indeterminate: selectedCount > 0 && selectedCount < total,
        collapsed: q ? false : collapsed.has(group.resourceKey),
      };
    }).filter((g) => g.permissions.length > 0);
  });

  ngOnInit(): void {
    const roleId = this.roleId();
    if (!roleId) return;
    // Editing: load the existing role to seed the form.
    const orgId = this.store.organizationId();
    if (!orgId) {
      this.state.set('error');
      return;
    }
    this.state.set('loading');
    this.api.listProjectRoles(orgId, this.projectId()).subscribe({
      next: (roles) => {
        const role = roles.find((r) => r.id === roleId);
        if (!role) {
          this.state.set('error');
          return;
        }
        this.name.set(role.name);
        this.permissions.set([...role.permissions]);
        // Editing: expand groups that already have permissions so the user sees what's assigned.
        const assigned = new Set(role.permissions);
        this.collapsed.set(
          new Set(
            PERMISSION_GROUPS.filter((g) => !g.permissions.some((p) => assigned.has(p))).map(
              (g) => g.resourceKey,
            ),
          ),
        );
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected togglePermission(perm: Permission): void {
    this.permissions.update((list) =>
      list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm],
    );
  }

  /** Expand every group, or collapse every group, depending on the current state. */
  protected toggleAll(): void {
    this.collapsed.set(
      this.allCollapsed() ? new Set() : new Set(PERMISSION_GROUPS.map((g) => g.resourceKey)),
    );
  }

  /** Collapse / expand a resource group's permission list. */
  protected toggleCollapsed(resourceKey: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(resourceKey)) next.delete(resourceKey);
      else next.add(resourceKey);
      return next;
    });
  }

  /**
   * Tri-state "select all in group": if every permission in the group is already selected, clear
   * them all; otherwise select them all. Acts on the FULL group regardless of any active filter.
   */
  protected toggleGroup(resourceKey: string): void {
    const group = PERMISSION_GROUPS.find((g) => g.resourceKey === resourceKey);
    if (!group) return;
    const groupPerms = group.permissions;
    const selected = new Set(this.permissions());
    const allSelected = groupPerms.every((p) => selected.has(p));
    if (allSelected) {
      groupPerms.forEach((p) => selected.delete(p));
    } else {
      groupPerms.forEach((p) => selected.add(p));
    }
    this.permissions.set([...selected]);
  }

  protected save(): void {
    const orgId = this.store.organizationId();
    if (!orgId || !this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.formError.set(null);
    const roleId = this.roleId();
    const payload = { name: this.name().trim(), permissions: this.permissions() };
    const req = roleId
      ? this.api.updateProjectRole(orgId, this.projectId(), roleId, payload)
      : this.api.createProjectRole(orgId, this.projectId(), payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.transloco.translate('projectRoles.saved'));
        this.cancel();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const message = messageForError(err, this.transloco);
        this.formError.set(message);
        this.toast.error(message);
      },
    });
  }

  /** Navigate back to the roles list (parent settings/roles route). */
  protected cancel(): void {
    void this.router.navigate(['/projects', this.projectId(), 'settings', 'roles']);
  }
}
