import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import { lucideEllipsis, lucidePlus, lucideTrash2, lucideUserPlus } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { CreateMemberRequest, MemberResponse } from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import { translateFn } from '../../../../core/i18n/translate-fn';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

type MemberTab = 'active' | 'pending';

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
    Select,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideEllipsis, lucidePlus, lucideTrash2, lucideUserPlus })],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'members.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'members.subtitle' | transloco }}</p>
      </div>

      <!-- Invite (always visible, supports several at once) -->
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
                    <label hlmLabel [for]="'email' + i">{{ 'members.fieldEmail' | transloco }}</label>
                  }
                  <input
                    hlmInput
                    [id]="'email' + i"
                    type="email"
                    formControlName="email"
                    [placeholder]="'members.placeholderEmail' | transloco"
                  />
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

      <!-- Tabs -->
      <div class="flex gap-4 border-b border-border text-sm">
        @for (t of tabs; track t) {
          <button
            type="button"
            (click)="tab.set(t)"
            class="-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 px-1 pb-2.5 font-medium transition-colors"
            [class]="
              tab() === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
          >
            {{ (t === 'active' ? 'members.tabActive' : 'members.tabPending') | transloco }}
            <span class="rounded-full bg-secondary px-1.5 text-xs text-muted-foreground">
              {{ t === 'active' ? activeRows().length : pending().length }}
            </span>
          </button>
        }
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2">
        <input
          hlmInput
          type="text"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          [placeholder]="'members.filterPlaceholder' | transloco"
          class="min-w-0 flex-1"
          data-testid="members-filter"
        />
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
        <div class="overflow-hidden rounded-2xl border border-border" data-testid="members-skeleton">
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
          {{ (tab() === 'active' ? 'members.emptyBody' : 'members.emptyPending') | transloco }}
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
                        [size]="34"
                        [circle]="true"
                      />
                      <div class="min-w-0">
                        <p class="flex items-center gap-2 truncate font-medium">
                          {{ m.displayName || m.email }}
                          @if (m.isOwnerSelf) {
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
                  }
                  <td class="px-3 text-right whitespace-nowrap">
                    @if (m.role === 'OWNER' || tab() === 'pending') {
                      <span
                        class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {{ 'members.role.' + m.role | transloco }}
                      </span>
                    } @else {
                      <app-select
                        size="sm"
                        [options]="roleOptions()"
                        [value]="m.role"
                        (valueChange)="changeRole(m, $any($event))"
                        [ariaLabel]="'members.fieldRole' | transloco"
                      />
                    }
                  </td>
                  <td class="w-12 py-3 pr-3 pl-1 text-right">
                    @if (!m.isOwnerSelf) {
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
                          class="w-48 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
                        >
                          <button
                            role="menuitem"
                            type="button"
                            (click)="remove(m); menuFor.set(null)"
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
    </div>
  `,
})
export class Members {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly tabs: readonly MemberTab[] = ['active', 'pending'];
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

  private readonly ownerRow = computed(() => {
    const orgId = this.store.organizationId();
    const org = this.workspace.organizations().find((o) => o.id === orgId);
    const user = this.store.user();
    if (!org || !user || org.ownerId !== user.id) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.fullName,
      role: 'OWNER' as const,
      status: 'ACTIVE',
      isOwnerSelf: true,
    };
  });

  protected readonly activeRows = computed(() => {
    const owner = this.ownerRow();
    const active = this.members()
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => ({ ...m, isOwnerSelf: false }));
    return owner ? [owner, ...active] : active;
  });
  protected readonly pending = computed(() =>
    this.members()
      .filter((m) => m.status === 'PENDING')
      .map((m) => ({ ...m, isOwnerSelf: false })),
  );

  /** The current tab's rows after the filter / role / sort controls are applied. */
  protected readonly rows = computed(() => {
    const base = this.tab() === 'active' ? this.activeRows() : this.pending();
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

  protected readonly form = this.fb.group({
    invites: this.fb.array([this.newInviteGroup()]),
  });

  get invites() {
    return this.form.controls.invites;
  }

  private newInviteGroup() {
    return this.fb.nonNullable.group({
      email: ['', [Validators.required, Validators.email]],
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
      },
      error: () => this.state.set('error'),
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
        const message = this.transloco.translate(
          err.status === 409 ? 'members.errorAlreadyInvited' : 'members.errorInvite',
        );
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
      error: () => this.toast.error(this.transloco.translate('members.errorInvite')),
    });
  }

  protected remove(member: { id: string }): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.api.removeMember(orgId, member.id).subscribe({
      next: () => {
        this.members.update((list) => list.filter((m) => m.id !== member.id));
        this.toast.success(this.transloco.translate('toast.memberRemoved'));
      },
      error: () => this.toast.error(this.transloco.translate('members.errorInvite')),
    });
  }
}
