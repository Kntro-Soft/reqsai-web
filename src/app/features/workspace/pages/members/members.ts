import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse } from '../../data/workspace.models';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '../../../../shared/ui';

/** Organization members: the owner, plus invited people with their role and status. */
@Component({
  selector: 'app-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    HlmIcon,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideTrash2 })],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ 'members.title' | transloco }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ 'members.subtitle' | transloco }}</p>
        </div>
        <button hlmBtn type="button" (click)="toggleInvite()" data-testid="invite-toggle">
          {{ (showInvite() ? 'common.cancel' : 'members.invite') | transloco }}
        </button>
      </div>

      @if (showInvite()) {
        <div hlmCard>
          <div hlmCardContent class="pt-6">
            <form
              [formGroup]="form"
              (ngSubmit)="invite()"
              class="flex flex-col gap-4 sm:flex-row sm:items-end"
            >
              <div class="flex flex-1 flex-col gap-2">
                <label hlmLabel for="email">{{ 'members.fieldEmail' | transloco }}</label>
                <input
                  hlmInput
                  id="email"
                  type="email"
                  formControlName="email"
                  [placeholder]="'members.placeholderEmail' | transloco"
                />
              </div>
              <div class="flex flex-1 flex-col gap-2">
                <label hlmLabel for="displayName">{{ 'members.fieldName' | transloco }}</label>
                <input
                  hlmInput
                  id="displayName"
                  formControlName="displayName"
                  [placeholder]="'members.placeholderName' | transloco"
                />
              </div>
              <div class="flex flex-col gap-2">
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
              <button
                hlmBtn
                type="submit"
                [disabled]="form.invalid || submitting()"
                data-testid="invite-submit"
              >
                @if (submitting()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'members.inviteSubmit' | transloco }}
              </button>
            </form>
            @if (errorMessage()) {
              <p class="mt-3 text-sm text-destructive" data-testid="form-error">
                {{ errorMessage() }}
              </p>
            }
          </div>
        </div>
      }

      <div class="flex flex-col gap-2">
        @if (ownerIsMe()) {
          <div
            class="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            data-testid="member-row"
          >
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
            >
              {{ myInitials() }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ store.user()?.fullName }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ 'members.you' | transloco }}</p>
            </div>
            <span class="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
              {{ 'members.role.OWNER' | transloco }}
            </span>
          </div>
        }

        @for (m of members(); track m.id) {
          <div
            class="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            data-testid="member-row"
          >
            <span
              class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground"
            >
              {{ initials(m.displayName || m.email) }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ m.displayName || m.email }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ m.email }}</p>
            </div>
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-medium"
              [class]="statusClass(m.status)"
            >
              {{ 'members.status.' + m.status | transloco }}
            </span>
            <span
              class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {{ 'members.role.' + m.role | transloco }}
            </span>
            <button
              type="button"
              (click)="remove(m)"
              [attr.aria-label]="'members.removeAria' | transloco"
              class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <hlm-icon name="lucideTrash2" size="16px" />
            </button>
          </div>
        }

        @if (state() === 'ready' && members().length === 0) {
          <div
            class="rounded-xl border border-dashed border-border p-8 text-center"
            data-testid="members-empty"
          >
            <p class="text-sm font-medium">{{ 'members.emptyTitle' | transloco }}</p>
            <p class="mt-1 text-sm text-muted-foreground">{{ 'members.emptyBody' | transloco }}</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class Members {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly transloco = inject(TranslocoService);
  protected readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);

  protected readonly members = signal<MemberResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly showInvite = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly ownerIsMe = computed(() => {
    const orgId = this.store.organizationId();
    const org = this.workspace.organizations().find((o) => o.id === orgId);
    return !!org && org.ownerId === this.store.user()?.id;
  });
  protected readonly myInitials = computed(() => {
    const u = this.store.user();
    return u ? `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase() : '';
  });

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

  protected toggleInvite(): void {
    this.showInvite.update((v) => !v);
    this.errorMessage.set(null);
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
        this.showInvite.set(false);
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

  protected remove(member: MemberResponse): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.api.removeMember(orgId, member.id).subscribe({
      next: () => this.members.update((list) => list.filter((m) => m.id !== member.id)),
    });
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')).toUpperCase() || '?';
  }

  protected statusClass(status: string): string {
    const classes: Record<string, string> = {
      ACTIVE: 'bg-emerald-500/15 text-emerald-500',
      PENDING: 'bg-amber-500/15 text-amber-600',
      INACTIVE: 'bg-secondary text-muted-foreground',
    };
    return classes[status] ?? 'bg-secondary text-muted-foreground';
  }
}
