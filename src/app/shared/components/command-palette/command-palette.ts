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
import { CommandRegistry, SearchItem } from '../../search/command-registry';

/** localStorage key for the small most-recently-used list of activated item ids. */
const RECENT_KEY = 'commandPalette.recent';
/** How many recent items to remember / surface. */
const RECENT_MAX = 5;

/** A search item paired with its flat index across all visible groups (for keyboard nav). */
interface IndexedItem {
  item: SearchItem;
  index: number;
}

/** A rendered section: a translatable header key and its indexed items. */
interface PaletteGroup {
  key: string;
  items: IndexedItem[];
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

          <div #list class="overflow-y-auto p-1.5" role="listbox">
            @for (group of groups(); track group.key) {
              <div
                class="sticky top-0 z-10 bg-popover px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
              >
                {{ group.key | transloco }}
              </div>
              @for (entry of group.items; track entry.item.id) {
                <button
                  type="button"
                  role="option"
                  [attr.data-index]="entry.index"
                  [attr.aria-selected]="entry.index === selected()"
                  (click)="activate(entry.item)"
                  (mouseenter)="selected.set(entry.index)"
                  class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
                  [class]="
                    entry.index === selected()
                      ? 'bg-accent text-foreground'
                      : 'text-foreground/90 hover:bg-accent'
                  "
                  data-testid="command-palette-item"
                >
                  @if (entry.item.icon; as icon) {
                    <span
                      class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground"
                    >
                      <hlm-icon [name]="icon" size="15px" />
                    </span>
                  } @else {
                    <app-avatar
                      [name]="entry.item.avatarName ?? ''"
                      [seed]="entry.item.avatarSeed ?? ''"
                      [imageUrl]="entry.item.avatarUrl ?? null"
                      [size]="28"
                    />
                  }
                  <span class="min-w-0 flex-1 truncate font-medium">{{ entry.item.label }}</span>
                </button>
              }
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
  private readonly registry = inject(CommandRegistry);

  /** Two-way bound visibility — the shell flips this on ⌘K / search focus. */
  readonly open = model(false);

  protected readonly query = signal('');
  protected readonly selected = signal(0);

  /** Ids of recently activated items, most-recent first (persisted in localStorage). */
  private readonly recentIds = signal<string[]>(this.loadRecent());

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly listEl = viewChild<ElementRef<HTMLElement>>('list');

  /** Re-translate group hints / actions on language change. */
  private readonly lang = signal(this.transloco.getActiveLang());

  /** The app-specific search source: quick actions + organizations + projects. */
  private buildItems(): SearchItem[] {
    this.lang();
    const t = (k: string) => this.transloco.translate(k);
    const items: SearchItem[] = [];

    // Quick actions.
    items.push(
      {
        id: 'action:new-project',
        label: t('commandPalette.actions.newProject'),
        group: 'commandPalette.groups.actions',
        icon: 'lucidePlus',
        run: () => this.go(['/projects/new']),
      },
      {
        id: 'action:members',
        label: t('commandPalette.actions.members'),
        group: 'commandPalette.groups.actions',
        icon: 'lucideUsers',
        run: () => this.go(['/members']),
      },
      {
        id: 'action:settings',
        label: t('commandPalette.actions.settings'),
        group: 'commandPalette.groups.actions',
        icon: 'lucideSettings',
        run: () => this.go(['/settings']),
      },
      {
        id: 'action:account',
        label: t('commandPalette.actions.account'),
        group: 'commandPalette.groups.actions',
        icon: 'lucideUser',
        run: () => this.go(['/account']),
      },
      {
        id: 'action:theme',
        label: t('commandPalette.actions.toggleTheme'),
        group: 'commandPalette.groups.actions',
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
        group: 'commandPalette.groups.organizations',
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
        group: 'commandPalette.groups.projects',
        icon: null,
        avatarName: project.name,
        avatarSeed: project.id,
        avatarUrl: project.avatarUrl,
        run: () => this.go(['/projects', project.id]),
      });
    }

    return items;
  }

  /** The fuzzy-ranked results from every registered source for the current query. */
  private readonly results = computed<SearchItem[]>(() => this.registry.search(this.query()));

  /**
   * The visible sections. On a blank query a "Recent" group of the last-activated items is shown
   * first (when any exist), followed by every item grouped by its `group` key in first-seen order.
   * While filtering, results stay in fuzzy-rank order but are still bucketed by group for headers.
   * Each item carries a flat `index` so arrow-key navigation is a single running counter.
   */
  protected readonly groups = computed<PaletteGroup[]>(() => {
    const results = this.results();
    const blank = this.query().trim() === '';
    const groups: PaletteGroup[] = [];
    const byKey = new Map<string, IndexedItem[]>();
    let index = 0;

    const push = (key: string, item: SearchItem): void => {
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = [];
        byKey.set(key, bucket);
        groups.push({ key, items: bucket });
      }
      bucket.push({ item, index: index++ });
    };

    if (blank) {
      const recent = this.recentItems();
      for (const item of recent) push('commandPalette.recent', item);
    }
    for (const item of results) push(item.group, item);

    return groups;
  });

  /** The visible items in render order — the flat list keyboard nav walks. */
  protected readonly visibleItems = computed<SearchItem[]>(() =>
    this.groups().flatMap((g) => g.items.map((e) => e.item)),
  );

  /** Resolve the persisted recent ids against the current live items, dropping stale ones. */
  private readonly recentItems = computed<SearchItem[]>(() => {
    const all = this.registry.items();
    const byId = new Map(all.map((i) => [i.id, i]));
    return this.recentIds()
      .map((id) => byId.get(id))
      .filter((i): i is SearchItem => !!i)
      .slice(0, RECENT_MAX);
  });

  constructor() {
    this.registry.register(() => this.buildItems());
    this.transloco.langChanges$.subscribe((l) => this.lang.set(l));
    // On open: reset query/selection and focus the input.
    effect(() => {
      if (this.open()) {
        this.query.set('');
        this.selected.set(0);
        queueMicrotask(() => this.searchInput()?.nativeElement.focus());
      }
    });
    // Keep the selection in range as the visible list shrinks.
    effect(() => {
      const len = this.visibleItems().length;
      if (this.selected() >= len) this.selected.set(Math.max(0, len - 1));
    });
    // Scroll the selected row into view as it moves.
    effect(() => {
      const i = this.selected();
      const host = this.listEl()?.nativeElement;
      if (!host) return;
      queueMicrotask(() => {
        host
          .querySelector<HTMLElement>(`[data-index="${i}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      });
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
        const item = this.visibleItems()[this.selected()];
        if (item) this.activate(item);
        break;
      }
    }
  }

  private move(delta: number): void {
    const len = this.visibleItems().length;
    if (len === 0) return;
    this.selected.update((i) => (i + delta + len) % len);
  }

  protected activate(item: SearchItem): void {
    this.remember(item.id);
    item.run();
  }

  /** Record `id` at the head of the MRU list (deduped, capped) and persist it. */
  private remember(id: string): void {
    const next = [id, ...this.recentIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
    this.recentIds.set(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failures (private mode / quota) — recents are best-effort.
    }
  }

  private loadRecent(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
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
