import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse } from '../../data/workspace.models';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
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
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Miembros</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Gestiona quién tiene acceso a esta organización y con qué rol.
          </p>
        </div>
        <button hlmBtn type="button" (click)="toggleInvite()" data-testid="invite-toggle">
          {{ showInvite() ? 'Cancelar' : 'Invitar miembro' }}
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
                <label hlmLabel for="email">Correo</label>
                <input
                  hlmInput
                  id="email"
                  type="email"
                  formControlName="email"
                  placeholder="persona@empresa.com"
                />
              </div>
              <div class="flex flex-1 flex-col gap-2">
                <label hlmLabel for="displayName">Nombre</label>
                <input
                  hlmInput
                  id="displayName"
                  formControlName="displayName"
                  placeholder="Nombre visible"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="role">Rol</label>
                <select
                  id="role"
                  formControlName="role"
                  class="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="MEMBER">Miembro</option>
                  <option value="ADMIN">Administrador</option>
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
                Invitar
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
              <p class="truncate text-xs text-muted-foreground">Tú</p>
            </div>
            <span class="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
              Propietario
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
              {{ statusLabel(m.status) }}
            </span>
            <span
              class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {{ roleLabel(m.role) }}
            </span>
            <button
              type="button"
              (click)="remove(m)"
              aria-label="Quitar miembro"
              class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
                />
              </svg>
            </button>
          </div>
        }

        @if (state() === 'ready' && members().length === 0) {
          <div
            class="rounded-xl border border-dashed border-border p-8 text-center"
            data-testid="members-empty"
          >
            <p class="text-sm font-medium">Aún no has invitado a nadie</p>
            <p class="mt-1 text-sm text-muted-foreground">
              Invita a tu equipo para colaborar en esta organización.
            </p>
          </div>
        }
      </div>
    </div>
  `,
})
export class Members {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
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
          err.status === 409
            ? 'Esa persona ya está invitada.'
            : 'No se pudo enviar la invitación. Intenta de nuevo.',
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

  protected roleLabel(role: string): string {
    const labels: Record<string, string> = {
      OWNER: 'Propietario',
      ADMIN: 'Administrador',
      MEMBER: 'Miembro',
    };
    return labels[role] ?? role;
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      ACTIVE: 'Activo',
      PENDING: 'Pendiente',
      INACTIVE: 'Inactivo',
    };
    return labels[status] ?? status;
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
