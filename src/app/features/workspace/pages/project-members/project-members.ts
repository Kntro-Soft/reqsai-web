import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { forkJoin } from 'rxjs';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse, ProjectMemberResponse } from '../../data/workspace.models';

/** Project members: who from the organization is assigned to this project. */
@Component({
  selector: 'app-project-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Miembros</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Quién de la organización trabaja en este proyecto.
        </p>
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="text-sm text-muted-foreground">Cargando…</p>
        }
        @case ('error') {
          <p class="text-sm text-destructive">No se pudieron cargar los miembros.</p>
        }
        @default {
          @if (assignments().length === 0) {
            <div
              class="rounded-2xl border border-dashed border-border p-12 text-center"
              data-testid="project-members-empty"
            >
              <p class="text-sm font-medium">Sin miembros asignados</p>
              <p class="mt-1 text-sm text-muted-foreground">
                Asigna personas de tu organización para que colaboren en este proyecto.
              </p>
            </div>
          } @else {
            <div class="flex flex-col gap-2">
              @for (assignment of assignments(); track assignment.id) {
                <div
                  class="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
                  data-testid="project-member-row"
                >
                  <span
                    class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground"
                  >
                    {{ initials(assignment.memberId) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">{{ name(assignment.memberId) }}</p>
                    <p class="truncate text-xs text-muted-foreground">
                      {{ email(assignment.memberId) }}
                    </p>
                  </div>
                </div>
              }
            </div>
          }
        }
      }
    </div>
  `,
})
export class ProjectMembers implements OnInit {
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);

  readonly projectId = input.required<string>();

  protected readonly assignments = signal<ProjectMemberResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly orgMembers = signal<MemberResponse[]>([]);
  private readonly byId = computed(() => new Map(this.orgMembers().map((m) => [m.id, m] as const)));

  ngOnInit(): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    forkJoin({
      assignments: this.api.listProjectMembers(orgId, this.projectId()),
      members: this.api.listMembers(orgId),
    }).subscribe({
      next: ({ assignments, members }) => {
        this.orgMembers.set(members);
        this.assignments.set(assignments);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected name(memberId: string): string {
    return this.byId().get(memberId)?.displayName ?? 'Miembro';
  }

  protected email(memberId: string): string {
    return this.byId().get(memberId)?.email ?? '';
  }

  protected initials(memberId: string): string {
    const name = this.byId().get(memberId)?.displayName ?? '';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')).toUpperCase() || 'M';
  }
}
