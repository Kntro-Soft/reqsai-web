import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { MemberResponse } from '../../data/workspace.models';
import { InlineEntity } from '../../../../shared/components/inline-entity/inline-entity';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmButton, HlmInput, HlmLabel, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';

/**
 * Project danger zone (Vercel-style, mirrors the org danger zone): archive (reversible, plain confirm),
 * restore (shown only when the project is ARCHIVED), and delete (type-to-confirm: the project name plus
 * a literal phrase). Only org owners/admins may act; on success we navigate back to /projects. The
 * backend additionally enforces the PROJECT_* permissions per request.
 */
@Component({
  selector: 'app-project-danger',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InlineEntity, Modal, HlmButton, HlmInput, HlmLabel, HlmSkeleton, HlmSpinner, TranslocoPipe],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'projectDanger.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'projectDanger.subtitle' | transloco }}</p>
      </div>

      @if (state() === 'loading') {
        <div class="flex flex-col gap-6" data-testid="project-danger-skeleton">
          @for (i of [0, 1]; track i) {
            <section class="overflow-hidden rounded-2xl border border-border">
              <div class="flex flex-col gap-3 p-5">
                <hlm-skeleton class="h-5 w-40" />
                <hlm-skeleton class="h-3 w-72 max-w-full" />
              </div>
              <div class="flex justify-end border-t border-border bg-muted/30 px-5 py-3">
                <hlm-skeleton class="h-8 w-28 rounded-md" />
              </div>
            </section>
          }
        </div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'projectDanger.errorGeneric' | transloco }}</p>
      } @else if (canManage()) {
        <!-- Archive / restore -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold">
              {{ (archived() ? 'projectDanger.restore' : 'projectDanger.archive') | transloco }}
            </h2>
            <p class="text-sm text-muted-foreground">
              {{ (archived() ? 'projectDanger.restoreDesc' : 'projectDanger.archiveDesc') | transloco }}
            </p>
          </div>
          <div
            class="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3"
          >
            <span class="text-xs text-muted-foreground">
              {{ (archived() ? 'projectDanger.restoreHint' : 'projectDanger.archiveHint') | transloco }}
            </span>
            @if (archived()) {
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="restore()"
                [disabled]="restoring()"
                data-testid="project-restore"
              >
                @if (restoring()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'projectDanger.restore' | transloco }}
              </button>
            } @else {
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="archiveOpen.set(true)"
                data-testid="project-archive"
              >
                {{ 'projectDanger.archive' | transloco }}
              </button>
            }
          </div>
        </section>

        <!-- Delete -->
        <section class="overflow-hidden rounded-2xl border border-destructive/40">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold text-destructive">
              {{ 'projectDanger.delete' | transloco }}
            </h2>
            <p class="text-sm text-muted-foreground">{{ 'projectDanger.deleteDesc' | transloco }}</p>
          </div>
          <div
            class="flex items-center justify-between gap-2 border-t border-destructive/30 bg-destructive/5 px-5 py-3"
          >
            <span class="text-xs text-muted-foreground">
              {{ 'projectDanger.deleteHint' | transloco }}
            </span>
            <button
              hlmBtn
              size="sm"
              variant="destructive"
              type="button"
              (click)="openDelete()"
              data-testid="project-delete"
            >
              {{ 'projectDanger.delete' | transloco }}
            </button>
          </div>
        </section>
      } @else {
        <p
          class="rounded-2xl border border-border py-10 text-center text-sm text-muted-foreground"
          data-testid="project-danger-readonly"
        >
          {{ 'projectDanger.readonly' | transloco }}
        </p>
      }

      <!-- Archive confirmation (plain confirm) -->
      <app-modal [(open)]="archiveOpen">
        <span modalTitle>{{ 'projectDanger.archiveTitle' | transloco }}</span>
        <p>
          {{ 'projectDanger.archiveBefore' | transloco }}
          <app-inline-entity [name]="projectName()" [seed]="projectId()" [imageUrl]="avatarUrl()" />
          {{ 'projectDanger.archiveAfter' | transloco }}
        </p>
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="archiveOpen.set(false)"
        >
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          modalFooter
          hlmBtn
          size="sm"
          type="button"
          (click)="archive()"
          [disabled]="archiving()"
        >
          @if (archiving()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'projectDanger.archive' | transloco }}
        </button>
      </app-modal>

      <!-- Delete confirmation (type-to-confirm: name + literal phrase) -->
      <app-modal [(open)]="deleteOpen">
        <span modalTitle>{{ 'projectDanger.deleteModalTitle' | transloco }}</span>
        <div class="flex flex-col gap-4">
          <p>
            {{ 'projectDanger.deleteModalBodyBefore' | transloco }}
            <app-inline-entity [name]="projectName()" [seed]="projectId()" [imageUrl]="avatarUrl()" />
            {{ 'projectDanger.deleteModalBodyAfter' | transloco }}
          </p>
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="project-delete-confirm-name">
              {{ 'projectDanger.deleteConfirmName' | transloco: { project: projectName() } }}
            </label>
            <input
              hlmInput
              id="project-delete-confirm-name"
              autocomplete="off"
              spellcheck="false"
              [value]="deleteConfirmName()"
              (input)="deleteConfirmName.set($any($event.target).value)"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="project-delete-confirm-phrase">
              <span
                [innerHTML]="
                  'projectDanger.deleteConfirmPhrase' | transloco: { phrase: deletePhraseHtml() }
                "
              ></span>
            </label>
            <input
              hlmInput
              id="project-delete-confirm-phrase"
              autocomplete="off"
              spellcheck="false"
              [value]="deleteConfirmPhrase()"
              (input)="deleteConfirmPhrase.set($any($event.target).value)"
            />
          </div>
          <div
            class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {{ 'projectDanger.deleteWarning' | transloco: { project: projectName() } }}
          </div>
        </div>
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="deleteOpen.set(false)"
        >
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="destructive"
          type="button"
          (click)="deleteProject()"
          [disabled]="!canDelete() || deleting()"
        >
          @if (deleting()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'projectDanger.delete' | transloco }}
        </button>
      </app-modal>
    </div>
  `,
})
export class ProjectDanger implements OnInit {
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly projectName = signal('');
  protected readonly avatarUrl = signal<string | null>(null);
  protected readonly status = signal<string>('ACTIVE');
  private readonly orgMembers = signal<MemberResponse[]>([]);

  protected readonly archived = computed(() => this.status() === 'ARCHIVED');

  protected readonly archiving = signal(false);
  protected readonly restoring = signal(false);
  protected readonly deleting = signal(false);
  protected readonly archiveOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteConfirmName = signal('');
  protected readonly deleteConfirmPhrase = signal('');

  /** The literal delete phrase for the active language (e.g. "delete this project"). */
  private readonly deletePhrase = computed(() =>
    this.transloco.translate('projectDanger.deletePhrase'),
  );
  /** Deletion is enabled only when BOTH inputs match exactly (name + literal phrase). */
  protected readonly canDelete = computed(
    () =>
      this.deleteConfirmName() === this.projectName() &&
      this.deleteConfirmPhrase() === this.deletePhrase(),
  );
  /** The delete phrase, escaped and bolded, for the confirm-phrase label. */
  protected readonly deletePhraseHtml = computed(() => this.bold(this.deletePhrase()));

  private bold(text: string): string {
    const escaped = text.replace(
      /[&<>"']/g,
      (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );
    return `<strong>${escaped}</strong>`;
  }

  /** Owner or admin of the active org may act; everyone else gets a read-only notice. */
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
    this.api.getProject(orgId, this.projectId()).subscribe({
      next: (project) => {
        this.projectName.set(project.name);
        this.avatarUrl.set(project.avatarUrl);
        this.status.set(project.status);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
    this.api.listMembers(orgId).subscribe({
      next: (members) => this.orgMembers.set(members),
    });
  }

  protected archive(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.archiving()) return;
    this.archiving.set(true);
    this.api.archiveProject(orgId, this.projectId()).subscribe({
      next: () => {
        this.archiving.set(false);
        this.archiveOpen.set(false);
        this.toast.success(this.transloco.translate('toast.projectArchived'));
        this.leaveToProjects();
      },
      error: () => {
        this.archiving.set(false);
        this.toast.error(this.transloco.translate('projectDanger.errorGeneric'));
      },
    });
  }

  protected restore(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.restoring()) return;
    this.restoring.set(true);
    this.api.restoreProject(orgId, this.projectId()).subscribe({
      next: (project) => {
        this.restoring.set(false);
        this.status.set(project.status);
        this.toast.success(this.transloco.translate('toast.projectRestored'));
        if (orgId) this.workspace.loadProjects(orgId);
      },
      error: () => {
        this.restoring.set(false);
        this.toast.error(this.transloco.translate('projectDanger.errorGeneric'));
      },
    });
  }

  protected openDelete(): void {
    this.deleteConfirmName.set('');
    this.deleteConfirmPhrase.set('');
    this.deleteOpen.set(true);
  }

  protected deleteProject(): void {
    const orgId = this.store.organizationId();
    if (!orgId || !this.canDelete() || this.deleting()) return;
    this.deleting.set(true);
    this.api.deleteProject(orgId, this.projectId()).subscribe({
      next: () => {
        this.toast.success(this.transloco.translate('toast.projectDeleted'));
        this.leaveToProjects();
      },
      error: () => {
        this.deleting.set(false);
        this.toast.error(this.transloco.translate('projectDanger.errorGeneric'));
      },
    });
  }

  /** After archiving/deleting, refresh the project list and return to /projects. */
  private leaveToProjects(): void {
    const orgId = this.store.organizationId();
    if (orgId) this.workspace.loadProjects(orgId);
    void this.router.navigate(['/projects']);
  }
}
