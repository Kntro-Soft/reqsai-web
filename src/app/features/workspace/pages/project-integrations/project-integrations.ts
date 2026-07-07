import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import {
  IntegrationConnectionResponse,
  JiraIssueTypeResponse,
  JiraProjectResponse,
  ProjectJiraTargetResponse,
} from '../../data/integrations.models';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { HlmButton, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';

/**
 * Project Integrations mapping page — maps this project to a Jira project + issue
 * type so stories can be pushed as issues. Picks the org Jira connection, loads its
 * Jira projects into a select, then the chosen project's issue types into a second
 * select, and saves the mapping (PUT target). Shows the current target when set and
 * allows clearing it (DELETE). Mirrors the settings-card layout.
 */
@Component({
  selector: 'app-project-integrations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Select, Modal, HlmButton, HlmSkeleton, HlmSpinner, TranslocoPipe],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'integrations.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'integrations.project.subtitle' | transloco }}
        </p>
      </div>

      @if (state() === 'loading') {
        <section class="overflow-hidden rounded-2xl border border-border" data-testid="project-integrations-skeleton">
          <div class="flex flex-col gap-3 p-5">
            <hlm-skeleton class="h-5 w-40" />
            <hlm-skeleton class="h-10 w-full max-w-xs rounded-md" />
            <hlm-skeleton class="h-10 w-full max-w-xs rounded-md" />
          </div>
          <div class="flex justify-end border-t border-border bg-muted/30 px-5 py-3">
            <hlm-skeleton class="h-8 w-28 rounded-md" />
          </div>
        </section>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'integrations.loadError' | transloco }}</p>
      } @else if (connections().length === 0) {
        <!-- No org connection: point the user at org settings to add one first. -->
        <section
          class="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-6"
          data-testid="project-integrations-no-connection"
        >
          <p class="text-sm text-muted-foreground">
            {{ 'integrations.project.noConnection' | transloco }}
          </p>
          <a hlmBtn size="sm" variant="outline" [routerLink]="['/settings', 'integrations']">
            {{ 'integrations.project.goToOrg' | transloco }}
          </a>
        </section>
      } @else {
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-4 p-5">
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-semibold">{{ 'integrations.jira.title' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">
                {{ 'integrations.project.mappingDescription' | transloco }}
              </p>
            </div>

            @if (connections().length > 1) {
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-medium leading-none">{{ 'integrations.project.connection' | transloco }}</span>
                <app-select
                  class="max-w-xs"
                  [options]="connectionOptions()"
                  [value]="connectionId()"
                  (valueChange)="onConnectionChange($event)"
                  [ariaLabel]="'integrations.project.connection' | transloco"
                />
              </div>
            }

            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-medium leading-none">{{ 'integrations.jira.projectKey' | transloco }}</span>
              @if (loadingProjects()) {
                <hlm-skeleton class="h-10 w-full max-w-xs rounded-md" />
              } @else {
                <app-select
                  class="max-w-xs"
                  [options]="projectOptions()"
                  [value]="jiraProjectKey()"
                  (valueChange)="onProjectChange($event)"
                  [searchable]="true"
                  [ariaLabel]="'integrations.jira.projectKey' | transloco"
                  [emptyText]="'integrations.project.noProjects' | transloco"
                />
              }
            </div>

            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-medium leading-none">{{ 'integrations.jira.issueType' | transloco }}</span>
              @if (loadingIssueTypes()) {
                <hlm-skeleton class="h-10 w-full max-w-xs rounded-md" />
              } @else {
                <!-- Cascade: disabled until a Jira project is chosen (its types load first). -->
                <app-select
                  class="max-w-xs"
                  [options]="issueTypeOptions()"
                  [value]="issueTypeId()"
                  (valueChange)="issueTypeId.set($event)"
                  [disabled]="!hasProject()"
                  [disabledLabel]="'integrations.project.selectProjectFirst' | transloco"
                  [ariaLabel]="'integrations.jira.issueType' | transloco"
                  [emptyText]="'integrations.project.noIssueTypes' | transloco"
                />
                @if (!hasProject()) {
                  <p class="text-xs text-muted-foreground" data-testid="issue-type-cascade-hint">
                    {{ 'integrations.project.selectProjectFirst' | transloco }}
                  </p>
                }
              }
            </div>

            @if (errorMessage()) {
              <p class="text-sm text-destructive" data-testid="project-integrations-error">
                {{ errorMessage() }}
              </p>
            }
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            @if (target()) {
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="clearOpen.set(true)"
                data-testid="jira-target-clear"
              >
                {{ 'integrations.project.clear' | transloco }}
              </button>
            }
            <button
              hlmBtn
              size="sm"
              type="button"
              (click)="save()"
              [disabled]="!canSave() || saving()"
              data-testid="jira-target-save"
            >
              @if (saving()) {
                <hlm-spinner class="h-4 w-4" />
              }
              {{ 'integrations.project.save' | transloco }}
            </button>
          </div>
        </section>

        <!-- Clear-mapping confirm modal -->
        <app-modal [(open)]="clearOpen">
          <span modalTitle>{{ 'integrations.project.clearTitle' | transloco }}</span>
          <p>{{ 'integrations.project.clearBody' | transloco }}</p>
          <button
            modalFooter
            hlmBtn
            size="sm"
            variant="ghost"
            type="button"
            (click)="clearOpen.set(false)"
          >
            {{ 'common.cancel' | transloco }}
          </button>
          <button
            modalFooter
            hlmBtn
            size="sm"
            variant="destructive"
            type="button"
            (click)="clearTarget()"
            [disabled]="clearing()"
            data-testid="jira-target-clear-confirm"
          >
            @if (clearing()) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'integrations.project.clear' | transloco }}
          </button>
        </app-modal>
      }
    </div>
  `,
})
export class ProjectIntegrations implements OnInit {
  private readonly api = inject(IntegrationsApiService);
  private readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly clearing = signal(false);
  protected readonly clearOpen = signal(false);
  protected readonly loadingProjects = signal(false);
  protected readonly loadingIssueTypes = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly connections = signal<IntegrationConnectionResponse[]>([]);
  protected readonly jiraProjects = signal<JiraProjectResponse[]>([]);
  protected readonly issueTypes = signal<JiraIssueTypeResponse[]>([]);
  protected readonly target = signal<ProjectJiraTargetResponse | null>(null);

  protected readonly connectionId = signal('');
  protected readonly jiraProjectKey = signal('');
  /**
   * The chosen issue type's Jira id — the select's bound value. Ids are unique per
   * project, so binding on the id (not the name) avoids duplicate-key clashes when
   * Jira returns several types sharing a display name. The saved target still stores
   * the NAME, resolved from this id via {@link issueTypeName}.
   */
  protected readonly issueTypeId = signal('');

  protected readonly connectionOptions = computed<SelectOption[]>(() =>
    this.connections().map((c) => ({ value: c.id, label: c.siteUrl })),
  );
  protected readonly projectOptions = computed<SelectOption[]>(() =>
    this.jiraProjects().map((p) => ({ value: p.key, label: `${p.name} (${p.key})` })),
  );
  /**
   * Issue-type options keyed by unique id (value) with the name as the label.
   * Deduped defensively by name so a backend that repeats a type still yields a
   * single option — and, with the id as the value, no duplicate select keys (NG0955).
   */
  protected readonly issueTypeOptions = computed<SelectOption[]>(() => {
    const seen = new Set<string>();
    const options: SelectOption[] = [];
    for (const t of this.issueTypes()) {
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      options.push({ value: t.id, label: t.name });
    }
    return options;
  });

  /** The chosen issue type's NAME (what the target stores), resolved from the id. */
  protected readonly issueTypeName = computed(
    () => this.issueTypes().find((t) => t.id === this.issueTypeId())?.name ?? '',
  );

  /** Whether a Jira project is selected — gates the issue-type select's cascade. */
  protected readonly hasProject = computed(() => !!this.jiraProjectKey());

  /** Save is enabled once a connection, a Jira project and an issue type are all chosen. */
  protected readonly canSave = computed(
    () => !!this.connectionId() && !!this.jiraProjectKey() && !!this.issueTypeName(),
  );

  ngOnInit(): void {
    const orgId = this.store.organizationId();
    if (!orgId) {
      this.state.set('error');
      return;
    }
    this.api.listConnections(orgId).subscribe({
      next: (connections) => {
        const jira = connections.filter((c) => c.provider === 'JIRA');
        this.connections.set(jira);
        if (jira.length === 0) {
          this.state.set('ready');
          return;
        }
        this.loadTarget(orgId, jira);
      },
      error: () => this.state.set('error'),
    });
  }

  /** Load the existing target (if any) and prime the selects from it. */
  private loadTarget(orgId: string, connections: IntegrationConnectionResponse[]): void {
    this.api.getProjectTarget(this.projectId()).subscribe({
      next: (target) => {
        this.target.set(target);
        this.connectionId.set(target.connectionId);
        this.jiraProjectKey.set(target.jiraProjectKey);
        this.state.set('ready');
        this.loadProjects(orgId, target.connectionId);
        // The target stores the issue-type NAME; once the types load, map it to the id.
        this.loadIssueTypes(orgId, target.connectionId, target.jiraProjectKey, target.issueTypeName);
      },
      // 404 is EXPECTED when no target is configured yet — handle it silently as the
      // "no target" state (no toast, no error UI); only real failures set 'error'.
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          const first = connections[0];
          this.connectionId.set(first.id);
          this.state.set('ready');
          this.loadProjects(orgId, first.id);
        } else {
          this.state.set('error');
        }
      },
    });
  }

  protected onConnectionChange(connectionId: string): void {
    const orgId = this.store.organizationId();
    if (!orgId || connectionId === this.connectionId()) return;
    this.connectionId.set(connectionId);
    // A different connection invalidates the project/issue-type selection.
    this.jiraProjectKey.set('');
    this.issueTypeId.set('');
    this.jiraProjects.set([]);
    this.issueTypes.set([]);
    this.loadProjects(orgId, connectionId);
  }

  protected onProjectChange(projectKey: string): void {
    const orgId = this.store.organizationId();
    if (!orgId || projectKey === this.jiraProjectKey()) return;
    this.jiraProjectKey.set(projectKey);
    // Changing the Jira project invalidates the previously chosen issue type.
    this.issueTypeId.set('');
    this.issueTypes.set([]);
    this.loadIssueTypes(orgId, this.connectionId(), projectKey);
  }

  private loadProjects(orgId: string, connectionId: string): void {
    this.loadingProjects.set(true);
    this.api.listJiraProjects(orgId, connectionId).subscribe({
      next: (projects) => {
        this.jiraProjects.set(projects);
        this.loadingProjects.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingProjects.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  /**
   * Loads the issue types for a Jira project. Only runs when a project is chosen —
   * the cascade guarantee behind the disabled issue-type select. When {@link selectName}
   * is given (priming from an existing target, which stores the name), the matching
   * type's id is selected once the list arrives.
   */
  private loadIssueTypes(
    orgId: string,
    connectionId: string,
    projectKey: string,
    selectName?: string,
  ): void {
    if (!projectKey) return;
    this.loadingIssueTypes.set(true);
    this.api.listJiraIssueTypes(orgId, connectionId, projectKey).subscribe({
      next: (types) => {
        this.issueTypes.set(types);
        if (selectName) {
          const match = types.find((t) => t.name === selectName);
          if (match) this.issueTypeId.set(match.id);
        }
        this.loadingIssueTypes.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loadingIssueTypes.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  protected save(): void {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.api
      .upsertProjectTarget(this.projectId(), {
        connectionId: this.connectionId(),
        jiraProjectKey: this.jiraProjectKey(),
        issueTypeName: this.issueTypeName(),
      })
      .subscribe({
        next: (target) => {
          this.saving.set(false);
          this.target.set(target);
          this.toast.success(this.transloco.translate('integrations.project.saved'));
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          const message = messageForError(err, this.transloco);
          this.errorMessage.set(message);
          this.toast.error(message);
        },
      });
  }

  protected clearTarget(): void {
    if (this.clearing()) return;
    this.clearing.set(true);
    this.errorMessage.set(null);
    this.api.deleteProjectTarget(this.projectId()).subscribe({
      next: () => {
        this.clearing.set(false);
        this.clearOpen.set(false);
        this.target.set(null);
        this.jiraProjectKey.set('');
        this.issueTypeId.set('');
        this.toast.success(this.transloco.translate('integrations.project.cleared'));
      },
      error: (err: HttpErrorResponse) => {
        this.clearing.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }
}
