import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { provideIcons } from '@ng-icons/core';
import { lucideLayoutGrid, lucidePlus, lucideRows3, lucideSearch } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

type ProjectView = 'cards' | 'table';
const VIEW_KEY = 'projects.view';

/** Projects dashboard (Vercel-style): a toolbar (search + view toggle + Add New) over the org's
 * projects as cards or a single-column table. Creation lives on the dedicated /projects/new page. */
@Component({
  selector: 'app-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, Avatar, HlmButton, HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideSearch, lucidePlus, lucideLayoutGrid, lucideRows3 })],
  template: `
    <div class="flex flex-col gap-5">
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-2">
        <div
          class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3"
        >
          <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
          <input
            type="text"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            [placeholder]="'projects.searchPlaceholder' | transloco"
            class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            data-testid="projects-search"
          />
        </div>

        <div class="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
          <button
            type="button"
            (click)="setView('cards')"
            [attr.aria-pressed]="view() === 'cards'"
            [attr.aria-label]="'projects.viewCards' | transloco"
            class="grid h-8 w-8 cursor-pointer place-items-center rounded-md transition-colors"
            [class]="
              view() === 'cards'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            "
          >
            <hlm-icon name="lucideLayoutGrid" size="16px" />
          </button>
          <button
            type="button"
            (click)="setView('table')"
            [attr.aria-pressed]="view() === 'table'"
            [attr.aria-label]="'projects.viewTable' | transloco"
            class="grid h-8 w-8 cursor-pointer place-items-center rounded-md transition-colors"
            [class]="
              view() === 'table'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            "
          >
            <hlm-icon name="lucideRows3" size="16px" />
          </button>
        </div>

        <button hlmBtn type="button" routerLink="/projects/new" data-testid="add-project">
          <hlm-icon name="lucidePlus" size="16px" />
          {{ 'projects.addNew' | transloco }}
        </button>
      </div>

      @switch (store.projectsState()) {
        @case ('loading') {
          <div class="flex justify-center py-12"><hlm-spinner class="h-6 w-6" /></div>
        }
        @case ('error') {
          <p class="text-sm text-destructive">{{ 'projects.loadError' | transloco }}</p>
        }
        @default {
          @if (store.projects().length === 0) {
            <div
              class="flex flex-col items-center gap-3 rounded-2xl border border-border py-16 text-center"
              data-testid="projects-empty"
            >
              <span class="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <hlm-icon name="lucidePlus" size="22px" />
              </span>
              <div>
                <p class="font-medium">{{ 'projects.emptyTitle' | transloco }}</p>
                <p class="text-sm text-muted-foreground">{{ 'projects.emptyBody' | transloco }}</p>
              </div>
              <button hlmBtn size="sm" type="button" routerLink="/projects/new">
                {{ 'projects.createCta' | transloco }}
              </button>
            </div>
          } @else if (filtered().length === 0) {
            <p class="py-10 text-center text-sm text-muted-foreground">
              {{ 'projects.noMatches' | transloco }}
            </p>
          } @else if (view() === 'cards') {
            <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              @for (project of filtered(); track project.id) {
                <li>
                  <a
                    [routerLink]="['/projects', project.id]"
                    class="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                    data-testid="project-card"
                  >
                    <div class="flex items-center gap-3">
                      <app-avatar
                        [name]="project.name"
                        [seed]="project.id"
                        [imageUrl]="project.avatarUrl"
                        [size]="36"
                      />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">{{ project.name }}</span>
                        <span class="block truncate text-xs text-muted-foreground">
                          {{ project.domain || ('projects.noDomain' | transloco) }}
                        </span>
                      </span>
                    </div>
                    @if (project.description) {
                      <p class="line-clamp-2 text-sm text-muted-foreground">
                        {{ project.description }}
                      </p>
                    }
                    @if (project.programmingLanguages.length || project.frameworks.length) {
                      <div class="mt-auto flex flex-wrap gap-1.5 pt-1">
                        @for (tag of techTags(project); track tag) {
                          <span
                            class="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
                          >
                            {{ tag }}
                          </span>
                        }
                      </div>
                    }
                  </a>
                </li>
              }
            </ul>
          } @else {
            <div class="overflow-hidden rounded-2xl border border-border">
              <table class="w-full text-sm">
                <thead
                  class="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground"
                >
                  <tr>
                    <th class="px-4 py-2.5 font-medium">{{ 'projects.colName' | transloco }}</th>
                    <th class="hidden px-4 py-2.5 font-medium sm:table-cell">
                      {{ 'projects.colTech' | transloco }}
                    </th>
                    <th class="hidden px-4 py-2.5 font-medium md:table-cell">
                      {{ 'projects.colDomain' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (project of filtered(); track project.id) {
                    <tr
                      [routerLink]="['/projects', project.id]"
                      class="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-accent/40"
                      data-testid="project-row"
                    >
                      <td class="px-4 py-2.5">
                        <span class="flex items-center gap-2.5">
                          <app-avatar
                            [name]="project.name"
                            [seed]="project.id"
                            [imageUrl]="project.avatarUrl"
                            [size]="24"
                          />
                          <span class="truncate font-medium">{{ project.name }}</span>
                        </span>
                      </td>
                      <td class="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                        {{ project.architecture || '—' }}
                      </td>
                      <td class="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                        {{ project.domain || '—' }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      }
    </div>
  `,
})
export class Projects {
  private readonly authStore = inject(AuthStore);
  protected readonly store = inject(WorkspaceStore);

  protected readonly query = signal('');
  protected readonly view = signal<ProjectView>(
    (localStorage.getItem(VIEW_KEY) as ProjectView | null) ?? 'cards',
  );

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const projects = this.store.projects();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false),
    );
  });

  constructor() {
    effect(() => {
      const orgId = this.authStore.organizationId();
      if (orgId) this.store.loadProjects(orgId);
    });
  }

  protected setView(view: ProjectView): void {
    this.view.set(view);
    localStorage.setItem(VIEW_KEY, view);
  }

  protected techTags(project: { programmingLanguages: string[]; frameworks: string[] }): string[] {
    return [...project.programmingLanguages, ...project.frameworks].slice(0, 4);
  }
}
