import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideBuilding2,
  lucideFolder,
  lucidePlus,
  lucideSearch,
  lucideSettings,
  lucideSunMoon,
  lucideUser,
  lucideUsers,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { ThemeService } from '../../../core/theme/theme.service';
import { WorkspaceStore } from '../../../features/workspace/data/workspace.store';
import { Avatar } from '../avatar/avatar';
import { HlmIcon } from '../../ui';

interface PaletteItem {
  id: string;
  label: string;
  /** i18n key for the group/category hint shown on the right. */
  groupKey: string;
  /** lucide icon name, or null to render an avatar instead. */
  icon: string | null;
  /** Avatar seed/name when icon is null. */
  avatarName?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
  run: () => void;
}

/**
 * Global command palette (⌘K). A centered modal overlay (CDK global position +
 * dim backdrop) with a search input and a keyboard-navigable list of
 * organizations, projects of the active org, and static quick actions. Arrow
 * keys move the selection, Enter activates, Esc closes. Opened via `[(open)]`
 * which the shell toggles from a host keydown listener and the sidebar search.
 */
@Component({
  selector: 'app-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Avatar, HlmIcon, TranslocoPipe],
  viewProviders: [
    provideIcons({
      lucideSearch,
      lucideBuilding2,
      lucideFolder,
      lucidePlus,
      lucideUsers,
      lucideSettings,
      lucideUser,
      lucideSunMoon,
      lucideArrowRight,
    }),
  ],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50" data-testid="command-palette-backdrop">
        <button
          type="button"
          (click)="close()"
          [attr.aria-label]="'common.cancel' | transloco"
          class="absolute inset-0 h-full w-full cursor-default bg-black/50"
        ></button>
        <div
          role="dialog"
          aria-modal="true"
          (keydown)="onKeydown($event)"
          class="fixed left-1/2 top-[12vh] flex max-h-[60vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
          data-testid="command-palette"
        >
          <div class="flex items-center gap-2 border-b border-border px-3.5">
            <hlm-icon name="lucideSearch" size="16px" class="shrink-0 text-muted-foreground" />
            <input
              #search
              type="text"
              [ngModel]="query()"
              (ngModelChange)="onQuery($event)"
              [placeholder]="'commandPalette.placeholder' | transloco"
              class="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              data-testid="command-palette-input"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd
              class="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              aria-hidden="true"
              >Esc</kbd
            >
          </div>

          <div class="overflow-y-auto p-1.5" role="listbox">
            @for (item of items(); track item.id; let i = $index) {
              <button
                type="button"
                role="option"
                [attr.aria-selected]="i === selected()"
                (click)="activate(item)"
                (mouseenter)="selected.set(i)"
                class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
                [class]="
                  i === selected()
                    ? 'bg-accent text-foreground'
                    : 'text-foreground/90 hover:bg-accent'
                "
                data-testid="command-palette-item"
              >
                @if (item.icon; as icon) {
                  <span
                    class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground"
                  >
                    <hlm-icon [name]="icon" size="15px" />
                  </span>
                } @else {
                  <app-avatar
                    [name]="item.avatarName ?? ''"
                    [seed]="item.avatarSeed ?? ''"
                    [imageUrl]="item.avatarUrl ?? null"
                    [size]="28"
                  />
                }
                <span class="min-w-0 flex-1 truncate font-medium">{{ item.label }}</span>
                <span class="shrink-0 text-xs text-muted-foreground">{{
                  item.groupKey | transloco
                }}</span>
              </button>
            } @empty {
              <p class="px-2.5 py-8 text-center text-sm text-muted-foreground">
                {{ 'commandPalette.empty' | transloco }}
              </p>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CommandPalette {
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceStore);
  private readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);

  /** Two-way bound visibility — the shell flips this on ⌘K / search focus. */
  readonly open = model(false);

  protected readonly query = signal('');
  protected readonly selected = signal(0);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  /** Re-translate group hints / actions on language change. */
  private readonly lang = signal(this.transloco.getActiveLang());

  private readonly allItems = computed<PaletteItem[]>(() => {
    this.lang();
    const t = (k: string) => this.transloco.translate(k);
    const items: PaletteItem[] = [];

    // Quick actions.
    items.push(
      {
        id: 'action:new-project',
        label: t('commandPalette.actions.newProject'),
        groupKey: 'commandPalette.groups.actions',
        icon: 'lucidePlus',
        run: () => this.go(['/projects/new']),
      },
      {
        id: 'action:members',
        label: t('commandPalette.actions.members'),
        groupKey: 'commandPalette.groups.actions',
        icon: 'lucideUsers',
        run: () => this.go(['/members']),
      },
      {
        id: 'action:settings',
        label: t('commandPalette.actions.settings'),
        groupKey: 'commandPalette.groups.actions',
        icon: 'lucideSettings',
        run: () => this.go(['/settings']),
      },
      {
        id: 'action:account',
        label: t('commandPalette.actions.account'),
        groupKey: 'commandPalette.groups.actions',
        icon: 'lucideUser',
        run: () => this.go(['/account']),
      },
      {
        id: 'action:theme',
        label: t('commandPalette.actions.toggleTheme'),
        groupKey: 'commandPalette.groups.actions',
        icon: 'lucideSunMoon',
        run: () => {
          this.theme.toggle();
          this.close();
        },
      },
    );

    // Organizations.
    for (const org of this.workspace.organizations()) {
      items.push({
        id: 'org:' + org.id,
        label: org.name,
        groupKey: 'commandPalette.groups.organizations',
        icon: null,
        avatarName: org.name,
        avatarSeed: org.id,
        avatarUrl: org.avatarUrl,
        run: () => this.selectOrg(org.id),
      });
    }

    // Projects of the active org.
    for (const project of this.workspace.projects()) {
      items.push({
        id: 'project:' + project.id,
        label: project.name,
        groupKey: 'commandPalette.groups.projects',
        icon: null,
        avatarName: project.name,
        avatarSeed: project.id,
        avatarUrl: project.avatarUrl,
        run: () => this.go(['/projects', project.id]),
      });
    }

    return items;
  });

  protected readonly items = computed<PaletteItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.allItems();
    return this.allItems().filter((i) => i.label.toLowerCase().includes(q));
  });

  constructor() {
    this.transloco.langChanges$.subscribe((l) => this.lang.set(l));
    // On open: reset query/selection and focus the input.
    effect(() => {
      if (this.open()) {
        this.query.set('');
        this.selected.set(0);
        queueMicrotask(() => this.searchInput()?.nativeElement.focus());
      }
    });
    // Keep the selection in range as the filtered list shrinks.
    effect(() => {
      const len = this.items().length;
      if (this.selected() >= len) this.selected.set(Math.max(0, len - 1));
    });
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.selected.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Enter': {
        event.preventDefault();
        const item = this.items()[this.selected()];
        if (item) this.activate(item);
        break;
      }
    }
  }

  private move(delta: number): void {
    const len = this.items().length;
    if (len === 0) return;
    this.selected.update((i) => (i + delta + len) % len);
  }

  protected activate(item: PaletteItem): void {
    item.run();
  }

  protected close(): void {
    this.open.set(false);
  }

  private go(commands: unknown[]): void {
    this.close();
    void this.router.navigate(commands);
  }

  private selectOrg(orgId: string): void {
    this.close();
    if (orgId === this.store.organizationId()) {
      void this.router.navigate(['/projects']);
      return;
    }
    this.auth.switchOrganization(orgId).subscribe(() => {
      this.workspace.loadProjects(orgId);
      void this.router.navigate(['/projects']);
    });
  }
}
