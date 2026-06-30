import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OverlayModule } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronsUpDown, lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../features/workspace/data/workspace.store';
import { OrganizationResponse } from '../../../features/workspace/data/workspace.models';
import { Avatar } from '../avatar/avatar';
import { ABOVE_START } from '../popover/popover-positions';
import { HlmIcon } from '../../ui';

/**
 * Sidebar-top organization switcher (Vercel "team" switcher). A full-width pill
 * showing the active org; clicking opens a searchable popover (rendered through
 * a CDK overlay so it escapes the sidebar's clipping) listing the user's orgs
 * with the active one checked, plus a create action. Closes on outside click or
 * Escape.
 */
@Component({
  selector: 'app-org-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule, FormsModule, Avatar, HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideChevronsUpDown, lucideCheck, lucidePlus, lucideSearch })],
  template: `
    <!-- Split control (Vercel): the name navigates to projects; only the chevron opens the menu. -->
    <div cdkOverlayOrigin #origin="cdkOverlayOrigin" class="flex w-full items-center gap-0.5">
      <button
        type="button"
        (click)="goToProjects()"
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <app-avatar
          [name]="activeName()"
          [seed]="store.organizationId() ?? ''"
          [imageUrl]="activeOrg()?.avatarUrl ?? null"
          [size]="22"
        />
        <span class="min-w-0 flex-1 truncate">{{
          activeName() || ('orgSwitcher.fallbackName' | transloco)
        }}</span>
      </button>
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-expanded]="open()"
        aria-haspopup="dialog"
        [attr.aria-label]="'orgSwitcher.ariaLabel' | transloco"
        data-testid="org-switcher"
        class="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <hlm-icon name="lucideChevronsUpDown" size="14px" />
      </button>
    </div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      (overlayOutsideClick)="close()"
      (overlayKeydown)="onKeydown($event)"
      (detach)="close()"
    >
      <div
        role="dialog"
        class="w-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
      >
        <div class="flex items-center gap-2 border-b border-border px-3">
          <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
          <input
            type="text"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            [placeholder]="'orgSwitcher.search' | transloco"
            class="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            data-testid="org-search"
          />
          <kbd
            class="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
            aria-hidden="true"
            >Esc</kbd
          >
        </div>

        <div class="max-h-64 overflow-y-auto p-1">
          @for (org of filtered(); track org.id) {
            <button
              role="menuitemradio"
              type="button"
              data-testid="org-option"
              [attr.aria-checked]="org.id === store.organizationId()"
              (click)="select(org)"
              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <app-avatar [name]="org.name" [seed]="org.id" [imageUrl]="org.avatarUrl" [size]="22" />
              <span class="min-w-0 flex-1 truncate">{{ org.name }}</span>
              @if (org.id === store.organizationId()) {
                <hlm-icon name="lucideCheck" size="16px" class="shrink-0 text-primary" />
              }
            </button>
          } @empty {
            <p class="px-2.5 py-6 text-center text-sm text-muted-foreground">
              {{ 'orgSwitcher.empty' | transloco }}
            </p>
          }
        </div>

        <div class="border-t border-border p-1">
          <button
            type="button"
            data-testid="create-org"
            (click)="create()"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <hlm-icon name="lucidePlus" size="16px" />
            {{ 'orgSwitcher.createOrganization' | transloco }}
          </button>
        </div>
      </div>
    </ng-template>
  `,
})
export class OrgSwitcher {
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly positions = ABOVE_START;
  protected readonly open = signal(false);
  protected readonly query = signal('');

  protected readonly activeOrg = computed(() => {
    const id = this.store.organizationId();
    return this.workspace.organizations().find((o) => o.id === id) ?? null;
  });
  protected readonly activeName = computed(() => this.activeOrg()?.name ?? '');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const orgs = this.workspace.organizations();
    return q ? orgs.filter((o) => o.name.toLowerCase().includes(q)) : orgs;
  });

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) this.query.set('');
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  protected select(org: OrganizationResponse): void {
    this.close();
    if (org.id === this.store.organizationId()) return;
    this.auth.switchOrganization(org.id).subscribe(() => {
      this.workspace.loadProjects(org.id);
      void this.router.navigate(['/projects']);
    });
  }

  protected create(): void {
    this.close();
    void this.router.navigate(['/onboarding']);
  }

  protected goToProjects(): void {
    this.close();
    void this.router.navigate(['/projects']);
  }
}
