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
import { lucideArrowLeft, lucidePlus } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { PERMISSION_GROUPS, Permission } from '../../data/workspace.models';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';

/**
 * Create / edit a project role on its own page (extracted from the roles list). A role-name input plus
 * a permission checkbox grid grouped by resource, saving to createProjectRole / updateProjectRole and
 * navigating back to the roles list on success or cancel. Mirrors the org members page styling.
 */
@Component({
  selector: 'app-project-role-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideArrowLeft, lucidePlus })],
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
        <section class="overflow-hidden rounded-2xl border border-border">
          <form
            (ngSubmit)="save()"
            class="flex flex-col gap-4 p-5"
            data-testid="role-form"
          >
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
              <span hlmLabel>{{ 'projectRoleForm.permissionsLabel' | transloco }}</span>
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
          </form>
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

  protected readonly permissionGroups = PERMISSION_GROUPS;

  protected readonly editing = computed(() => !!this.roleId());
  protected readonly state = signal<'loading' | 'ready' | 'error'>('ready');
  protected readonly name = signal('');
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly canSave = computed(() => !!this.name().trim());

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
        const message = this.transloco.translate(
          err.status === 409 ? 'projectRoles.errorNameInUse' : 'projectRoles.errorSave',
        );
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
