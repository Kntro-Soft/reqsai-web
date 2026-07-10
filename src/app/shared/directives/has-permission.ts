import {
  Directive,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { PermissionsStore } from '../../core/authz/permissions.store';
import { OrgRole } from '../../core/authz/permissions.models';

/**
 * Structural directive that renders its content only when the {@link PermissionsStore}
 * grants access. Accepts EITHER a project permission (`*appHasPermission="'STORY_WRITE'"`)
 * OR a required org role (`*appHasPermission="null; role: 'ADMIN'"` — owner always passes,
 * `'ADMIN'` admits owner + admin, `'OWNER'` admits owner only).
 *
 * Reactive: it re-evaluates whenever the store's role/permission signals change, so a
 * late-arriving authorization fetch reveals the gated content without a manual refresh.
 *
 * Ergonomics only — the backend still enforces every action. Use it to hide nav items
 * and buttons the caller can't use; never as the security boundary.
 */
@Directive({ selector: '[appHasPermission]' })
export class HasPermission {
  private readonly store = inject(PermissionsStore);
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);

  /** The project permission to require, or null when gating purely by org role. */
  readonly appHasPermission = input<string | null>(null);
  /** The org role to require instead of (or in addition to) a permission. */
  readonly appHasPermissionRole = input<OrgRole | null>(null);

  private rendered = false;

  constructor() {
    effect(() => {
      const permission = this.appHasPermission();
      const role = this.appHasPermissionRole();

      let granted = true;
      if (role) {
        granted =
          role === 'OWNER' ? this.store.isOrgOwner() : this.store.isOrgOwnerOrAdmin();
      }
      if (granted && permission) {
        granted = this.store.has(permission);
      }

      if (granted && !this.rendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.rendered = true;
      } else if (!granted && this.rendered) {
        this.viewContainer.clear();
        this.rendered = false;
      }
    });
  }
}
