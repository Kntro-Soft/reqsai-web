import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse } from '../../data/workspace.models';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

type MemberTab = 'active' | 'pending';

/** Organization members (Vercel-style): an always-visible invite card, Active / Pending tabs and a
 * compact member table with a styled inline role select (PATCH) and remove. */
@Component({
  selector: 'app-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Avatar,
    Select,
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
            <span hlmLabel>{{ 'members.fieldRole' | transloco }}</span>
            <app-select
              [options]="roleOptions()"
              [value]="form.controls.role.value"
              (valueChange)="form.controls.role.setValue($any($event))"
              [ariaLabel]="'members.fieldRole' | transloco"
            />
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

      @if (state() === 'loading') {
        <div class="flex justify-center py-10"><hlm-spinner class="h-6 w-6" /></div>
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
                  <td class="py-3 pl-4 pr-3">
                    <div class="flex min-w-0 items-center gap-3">
                      <app-avatar [name]="m.displayName || m.email" [seed]="m.id" [size]="34" [circle]="true" />
                      <div class="min-w-0">
                        <p class="flex items-center gap-2 truncate font-medium">
                          {{ m.displayName || m.email }}
                          @if (m.isOwnerSelf) {
                            <span class="rounded bg-secondary px-1.5 text-[11px] text-muted-foreground">
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
                      <span class="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                        {{ 'members.status.PENDING' | transloco }}
                      </span>
                    </td>
                  }
                  <td class="px-3 text-right whitespace-nowrap">
                    @if (m.role === 'OWNER' || tab() === 'pending') {
                      <span class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
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
                  <td class="w-12 py-3 pl-1 pr-3 text-right">
                    @if (!m.isOwnerSelf) {
                      <button
                        type="button"
                        (click)="remove(m)"
                        [attr.aria-label]="'members.removeAria' | transloco"
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

  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  protected readonly roleOptions = computed<SelectOption[]>(() => {
    this.activeLang();
    return [
      { value: 'MEMBER', label: this.transloco.translate('members.role.MEMBER') },
      { value: 'ADMIN', label: this.transloco.translate('members.role.ADMIN') },
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
