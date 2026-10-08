import { OrgRole } from '../../core/authz/permissions.models';
import {
  ACCOUNT_NAV,
  NavAccess,
  NavSeg,
  ORG_SETTINGS_NAV,
  PROJECT_ROOT_NAV,
  PROJECT_SETTINGS_NAV,
  visibleNavSegs,
} from './shell-nav';

/** A caller with `role` and the given project permissions. */
function access(role: OrgRole, permissions: readonly string[] = []): NavAccess {
  const ownerOrAdmin = role === 'OWNER' || role === 'ADMIN';
  return {
    isOrgOwner: () => role === 'OWNER',
    isOrgOwnerOrAdmin: () => ownerOrAdmin,
    has: (p) => ownerOrAdmin || permissions.includes(p),
  };
}

const segs = (list: NavSeg[]) => list.map((s) => s.seg);

describe('visibleNavSegs', () => {
  it('applies the role gate', () => {
    const items: NavSeg[] = [{ seg: 'general' }, { seg: 'billing', role: 'OWNER' }];
    expect(segs(visibleNavSegs(items, access('ADMIN')))).toEqual(['general']);
    expect(segs(visibleNavSegs(items, access('OWNER')))).toEqual(['general', 'billing']);
  });

  it('applies the permission gate', () => {
    const items: NavSeg[] = [{ seg: 'members', permission: 'MEMBER_READ' }];
    expect(visibleNavSegs(items, access('MEMBER'))).toEqual([]);
    expect(segs(visibleNavSegs(items, access('MEMBER', ['MEMBER_READ'])))).toEqual(['members']);
  });

  it('shows the owner the full org settings nav', () => {
    expect(segs(visibleNavSegs(ORG_SETTINGS_NAV, access('OWNER')))).toEqual([
      'general',
      'members',
      'billing',
      'integrations',
      'usage',
    ]);
  });

  it('shows an admin the members and integrations settings only', () => {
    expect(segs(visibleNavSegs(ORG_SETTINGS_NAV, access('ADMIN')))).toEqual([
      'members',
      'integrations',
    ]);
  });

  it('shows the owner the full project settings nav', () => {
    expect(segs(visibleNavSegs(PROJECT_SETTINGS_NAV, access('OWNER')))).toEqual([
      'general',
      'roles',
      'members',
      'integrations',
      'danger',
    ]);
  });

  it('shows a member only the project settings their permissions allow', () => {
    expect(
      segs(visibleNavSegs(PROJECT_SETTINGS_NAV, access('MEMBER', ['MEMBER_READ', 'ROLE_READ']))),
    ).toEqual(['roles', 'members']);
  });

  it('shows the client documents page to callers who can read documents', () => {
    expect(segs(visibleNavSegs(PROJECT_ROOT_NAV, access('OWNER')))).toContain('documents');
    expect(segs(visibleNavSegs(PROJECT_ROOT_NAV, access('MEMBER', ['DOCUMENT_READ'])))).toContain(
      'documents',
    );
    expect(segs(visibleNavSegs(PROJECT_ROOT_NAV, access('MEMBER')))).not.toContain('documents');
  });

  it('lists the account pages', () => {
    expect(segs(visibleNavSegs(ACCOUNT_NAV, access('MEMBER')))).toEqual([
      'profile',
      'security',
      'appearance',
    ]);
  });
});
