import { OrgRole } from '../../core/authz/permissions.models';

/**
 * A sidebar nav item before its link is resolved. `seg` is the route segment, the i18n key
 * (`nav.<seg>`) and the nav-icon name. `permission` / `role` (when set) gate the item to
 * callers who hold that project permission / org role, so the aside never offers a dead end
 * (the guards + backend still enforce).
 */
export interface NavSeg {
  seg: string;
  permission?: string;
  role?: OrgRole;
}

/** What {@link visibleNavSegs} needs to decide: the caller's grants. */
export interface NavAccess {
  isOrgOwner(): boolean;
  isOrgOwnerOrAdmin(): boolean;
  has(permission: string): boolean;
}

// Nav item segments per sidebar context; the shell resolves their links once the active
// project id is known.
export const ORG_ROOT_NAV: readonly NavSeg[] = [{ seg: 'projects' }, { seg: 'settings' }];
export const ORG_SETTINGS_NAV: readonly NavSeg[] = [
  { seg: 'general', role: 'OWNER' },
  { seg: 'members', role: 'ADMIN' },
  { seg: 'billing', role: 'OWNER' },
  { seg: 'integrations', role: 'ADMIN' },
  { seg: 'usage', role: 'OWNER' },
];
export const PROJECT_ROOT_NAV: readonly NavSeg[] = [
  { seg: 'overview' },
  { seg: 'sessions', permission: 'SESSION_READ' },
  { seg: 'stories', permission: 'STORY_READ' },
  { seg: 'glossary', permission: 'GLOSSARY_READ' },
  { seg: 'constraints', permission: 'CONSTRAINT_READ' },
  { seg: 'settings' },
];
export const PROJECT_SETTINGS_NAV: readonly NavSeg[] = [
  { seg: 'general', permission: 'PROJECT_UPDATE' },
  { seg: 'roles', permission: 'ROLE_READ' },
  { seg: 'members', permission: 'MEMBER_READ' },
  { seg: 'integrations', permission: 'INTEGRATION_READ' },
  { seg: 'danger', permission: 'PROJECT_DELETE' },
];
export const ACCOUNT_NAV: readonly NavSeg[] = [
  { seg: 'profile' },
  { seg: 'security' },
  { seg: 'appearance' },
];

/**
 * Keeps only the nav segments the caller may reach: an item with a `role` needs that org role
 * (owner always passes; `'ADMIN'` admits owner + admin), and an item with a `permission` needs
 * that project permission (owner/admin bypass).
 * Ungated items always show. Pure, so the shell can call it inside a `computed` and re-render
 * when authorization arrives.
 */
export function visibleNavSegs(segs: readonly NavSeg[], access: NavAccess): NavSeg[] {
  return segs.filter((s) => {
    if (s.role) {
      const ok = s.role === 'OWNER' ? access.isOrgOwner() : access.isOrgOwnerOrAdmin();
      if (!ok) return false;
    }
    if (s.permission && !access.has(s.permission)) return false;
    return true;
  });
}
