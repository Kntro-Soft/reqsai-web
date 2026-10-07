import { OrgRole } from '../../core/authz/permissions.models';
import { FeatureKey } from '../../core/features/feature-flags';
import {
  ACCOUNT_NAV,
  NavAccess,
  NavSeg,
  ORG_SETTINGS_NAV,
  PROJECT_SETTINGS_NAV,
  visibleNavSegs,
} from './shell-nav';

/** A caller with `role`, the given project permissions and the given features switched on. */
function access(
  role: OrgRole,
  features: readonly FeatureKey[] = [],
  permissions: readonly string[] = [],
): NavAccess {
  const ownerOrAdmin = role === 'OWNER' || role === 'ADMIN';
  return {
    isOrgOwner: () => role === 'OWNER',
    isOrgOwnerOrAdmin: () => ownerOrAdmin,
    has: (p) => ownerOrAdmin || permissions.includes(p),
    isEnabled: (f) => features.includes(f),
  };
}

const ALL_FEATURES: readonly FeatureKey[] = [
  'billing',
  'usage',
  'integrations',
  'members',
  'customRoles',
  'notifications',
  'tokens',
];

const segs = (list: NavSeg[]) => list.map((s) => s.seg);

describe('visibleNavSegs', () => {
  it('hides an item whose feature is off, even for the owner', () => {
    const items: NavSeg[] = [{ seg: 'general' }, { seg: 'billing', feature: 'billing' }];
    expect(segs(visibleNavSegs(items, access('OWNER')))).toEqual(['general']);
  });

  it('shows an item whose feature is on', () => {
    const items: NavSeg[] = [{ seg: 'general' }, { seg: 'billing', feature: 'billing' }];
    expect(segs(visibleNavSegs(items, access('OWNER', ['billing'])))).toEqual([
      'general',
      'billing',
    ]);
  });

  it('still applies the role gate when the feature is on', () => {
    const items: NavSeg[] = [{ seg: 'billing', role: 'OWNER', feature: 'billing' }];
    expect(visibleNavSegs(items, access('ADMIN', ['billing']))).toEqual([]);
  });

  it('still applies the permission gate when the feature is on', () => {
    const items: NavSeg[] = [{ seg: 'members', permission: 'MEMBER_READ', feature: 'members' }];
    expect(visibleNavSegs(items, access('MEMBER', ['members']))).toEqual([]);
    expect(segs(visibleNavSegs(items, access('MEMBER', ['members'], ['MEMBER_READ'])))).toEqual([
      'members',
    ]);
  });

  describe('with the MVP flags (everything off)', () => {
    it('leaves only General in the org settings nav', () => {
      expect(segs(visibleNavSegs(ORG_SETTINGS_NAV, access('OWNER')))).toEqual(['general']);
    });

    it('leaves an admin no org settings page at all', () => {
      expect(visibleNavSegs(ORG_SETTINGS_NAV, access('ADMIN'))).toEqual([]);
    });

    it('leaves General and Danger in the project settings nav', () => {
      expect(segs(visibleNavSegs(PROJECT_SETTINGS_NAV, access('OWNER')))).toEqual([
        'general',
        'danger',
      ]);
    });

    it('drops the "soon" notifications and tokens entries from the account nav', () => {
      expect(segs(visibleNavSegs(ACCOUNT_NAV, access('MEMBER')))).toEqual([
        'profile',
        'security',
        'appearance',
      ]);
    });
  });

  describe('with every flag on', () => {
    it('restores the full org settings nav', () => {
      expect(segs(visibleNavSegs(ORG_SETTINGS_NAV, access('OWNER', ALL_FEATURES)))).toEqual([
        'general',
        'members',
        'billing',
        'integrations',
        'usage',
      ]);
    });

    it('restores the full project settings nav', () => {
      expect(segs(visibleNavSegs(PROJECT_SETTINGS_NAV, access('OWNER', ALL_FEATURES)))).toEqual([
        'general',
        'roles',
        'members',
        'integrations',
        'danger',
      ]);
    });

    it('restores the account placeholders', () => {
      expect(segs(visibleNavSegs(ACCOUNT_NAV, access('MEMBER', ALL_FEATURES)))).toEqual([
        'profile',
        'security',
        'appearance',
        'notifications',
        'tokens',
      ]);
    });
  });
});
