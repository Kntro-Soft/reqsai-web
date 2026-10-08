import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideRotateCcw } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { messageForError } from '../../../../core/errors/error-message';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { WorkspaceStore } from '../../data/workspace.store';
import { ProjectResponse } from '../../data/workspace.models';

/**
 * "Restore demo data" action for the demo project: a button plus a confirmation modal. On confirm it
 * asks the backend to wipe the demo's sessions, stories, suggestions, glossary and constraints and seed
 * the original sample content again, refreshes the project in the workspace store, toasts and emits the
 * fresh project so the host page can reload what it shows. Hosts render it only for a demo project and a
 * caller allowed to change the project (the backend enforces PROJECT_UPDATE anyway).
 */
@Component({
  selector: 'app-demo-restore',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, HlmButton, HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideRotateCcw })],
  template: `
    <button
      hlmBtn
      size="sm"
      variant="outline"
      type="button"
      (click)="open.set(true)"
      data-testid="demo-restore"
    >
      <hlm-icon name="lucideRotateCcw" size="15px" />
      {{ 'demo.restore' | transloco }}
    </button>

    <app-modal [(open)]="open">
      <span modalTitle>{{ 'demo.restoreTitle' | transloco }}</span>
      <p>{{ 'demo.restoreBody' | transloco }}</p>
      <button modalFooter hlmBtn size="sm" variant="ghost" type="button" (click)="open.set(false)">
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="destructive"
        type="button"
        (click)="restore()"
        [disabled]="restoring()"
        data-testid="demo-restore-confirm"
      >
        @if (restoring()) {
          <hlm-spinner class="h-4 w-4" />
        }
        {{ 'demo.restoreConfirm' | transloco }}
      </button>
    </app-modal>
  `,
})
export class DemoRestore {
  private readonly api = inject(WorkspaceApiService);
  private readonly auth = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();
  /** Emits the restored project once the backend has re-seeded the sample content. */
  readonly restored = output<ProjectResponse>();

  protected readonly open = signal(false);
  protected readonly restoring = signal(false);

  protected restore(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.restoring()) return;
    this.restoring.set(true);
    this.api.restoreDemoProject(orgId, this.projectId()).subscribe({
      next: (project) => {
        this.restoring.set(false);
        this.open.set(false);
        this.workspace.replaceProject(project);
        this.toast.success(this.transloco.translate('toast.demoRestored'));
        this.restored.emit(project);
      },
      error: (err) => {
        this.restoring.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }
}
