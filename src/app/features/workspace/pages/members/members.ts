import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse } from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

type MemberTab = 'active' | 'pending';

/** Organization members (Vercel-style): an always-visible invite card, Active / Pending tabs and a
 * single-column member table with inline role change (PATCH) and remove. */
@Component({
  selector: 'app-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    Avatar,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideTrash2 })],
  template: `
    <div class="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'members.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'members.subtitle' | transloco }}</p>
      </div>

      <!-- Invite (always visible) -->
      <section class="overflow-hidden rounded-2xl border border-border">
        <div class="flex flex-col gap-1 p-5">
          <h2 class="text-base font-semibold">{{ 'members.inviteTitle' | transloco }}</h2>
          <p class="text-sm text-muted-foreground">{{ 'members.inviteDesc' | transloco }}</p>
        </div>
        <form
          [formGroup]="form"
          (ngSubmit)="invite()"
          class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5 sm:flex-row sm:items-end"
        >
          <div class="flex flex-1 flex-col gap-1.5">
            <label hlmLabel for="email">{{ 'members.fieldEmail' | transloco }}</label>
            <input
              hlmInput
              id="email"
              type="email"
              formControlName="email"
              [placeholder]="'members.placeholderEmail' | transloco"
            />
          </div>
          <div class="flex flex-1 flex-col gap-1.5">
            <label hlmLabel for="displayName">{{ 'members.fieldName' | transloco }}</label>
            <input
              hlmInput
              id="displayName"
              formControlName="displayName"
              [placeholder]="'members.placeholderName' | transloco"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="role">{{ 'members.fieldRole' | transloco }}</label>
            <select
              id="role"
              formControlName="role"
              class="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="MEMBER">{{ 'members.role.MEMBER' | transloco }}</option>
              <option value="ADMIN">{{ 'members.role.ADMIN' | transloco }}</option>
            </select>
          </div>
          <button hlmBtn type="submit" [disabled]="form.invalid || submitting()" data-testid="invite-submit">
            @if (submitting()) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'members.inviteSubmit' | transloco }}
          </button>
        </form>
        @if (errorMessage()) {
          <p class="px-5 pb-4 text-sm text-destructive" data-testid="form-error">
            {{ errorMessage() }}
          </p>
        }
      </section>

      <!-- Tabs -->
      <div class="flex gap-4 border-b border-border text-sm">
        @for (t of tabs; track t) {
          <button
            type="button"
            (click)="tab.set(t)"
            class="-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2.5 font-medium transition-colors"
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

      @if (state() === 'loading') {
        <div class="flex justify-center py-10"><hlm-spinner class="h-6 w-6" /></div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'members.loadError' | transloco }}</p>
      } @else {
        <div class="overflow-hidden rounded-2xl border border-border">
          @for (m of rows(); track m.id) {
            <div
              class="flex items-center gap-3 border-b border-border p-4 last:border-0"
              data-testid="member-row"
            >
              <app-avatar [name]="m.displayName || m.email" [seed]="m.id" [size]="36" [circle]="true" />
              <div class="min-w-0 flex-1">
                <p class="flex items-center gap-2 truncate text-sm font-medium">
                  {{ m.displayName || m.email }}
                  @if (m.isOwnerSelf) {
                    <span class="rounded bg-secondary px-1.5 text-[11px] text-muted-foreground">
                      {{ 'members.you' | transloco }}
                    </span>
                  }
                </p>
                <p class="truncate text-xs text-muted-foreground">{{ m.email }}</p>
              </div>

              @if (tab() === 'pending') {
                <span class="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                  {{ 'members.status.PENDING' | transloco }}
                </span>
              }

              @if (m.role === 'OWNER' || tab() === 'pending') {
                <span
                  class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                >
                  {{ 'members.role.' + m.role | transloco }}
                </span>
              } @else {
                <select
                  [ngModel]="m.role"
                  (ngModelChange)="changeRole(m, $event)"
                  [attr.aria-label]="'members.fieldRole' | transloco"
                  class="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="MEMBER">{{ 'members.role.MEMBER' | transloco }}</option>
                  <option value="ADMIN">{{ 'members.role.ADMIN' | transloco }}</option>
                </select>
              }

              @if (!m.isOwnerSelf) {
                <button
                  type="button"
                  (click)="remove(m)"
                  [attr.aria-label]="'members.removeAria' | transloco"
                  class="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <hlm-icon name="lucideTrash2" size="16px" />
                </button>
              } @else {
                <span class="w-8 shrink-0"></span>
              }
            </div>
          } @empty {
            <p class="p-8 text-center text-sm text-muted-foreground">
              {{ (tab() === 'active' ? 'members.emptyBody' : 'members.emptyPending') | transloco }}
            </p>
          }
        </div>
      }
    </div>
  `,
})
export class Members {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly transloco = inject(TranslocoService);
  protected readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);

  protected readonly tabs: readonly MemberTab[] = ['active', 'pending'];
  protected readonly tab = signal<MemberTab>('active');
  protected readonly members = signal<MemberResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

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

  /** Active tab rows = the owner (if me) followed by ACTIVE members. */
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
  protected readonly rows = computed(() =>
    this.tab() === 'active' ? this.activeRows() : this.pending(),
  );

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    displayName: ['', [Validators.required, Validators.maxLength(150)]],
    role: ['MEMBER' as 'ADMIN' | 'MEMBER', [Validators.required]],
  });

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

  protected invite(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.api.inviteMember(orgId, this.form.getRawValue()).subscribe({
      next: (member) => {
        this.members.update((list) => [member, ...list]);
        this.submitting.set(false);
        this.tab.set(member.status === 'PENDING' ? 'pending' : 'active');
        this.form.reset({ email: '', displayName: '', role: 'MEMBER' });
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(
          this.transloco.translate(
            err.status === 409 ? 'members.errorAlreadyInvited' : 'members.errorInvite',
          ),
        );
      },
    });
  }

  protected changeRole(member: { id: string; role: string }, role: 'ADMIN' | 'MEMBER'): void {
    const orgId = this.store.organizationId();
    if (!orgId || role === member.role) return;
    this.api.changeMemberRole(orgId, member.id, role).subscribe({
      next: (updated) =>
        this.members.update((list) => list.map((m) => (m.id === updated.id ? updated : m))),
      error: () => this.errorMessage.set(this.transloco.translate('members.errorInvite')),
    });
  }

  protected remove(member: { id: string }): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.api.removeMember(orgId, member.id).subscribe({
      next: () => this.members.update((list) => list.filter((m) => m.id !== member.id)),
    });
  }
}
