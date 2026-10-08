import { describe, expect, it } from 'vitest';
import { shareLinkState, shareUrl } from './share-links';
import { ShareLinkResponse } from './share.models';

const link = (patch: Partial<ShareLinkResponse>): ShareLinkResponse => ({
  id: 'l1',
  projectId: 'p1',
  createdAt: '2026-10-01T00:00:00Z',
  expiresAt: '2026-10-15T00:00:00Z',
  revokedAt: null,
  active: true,
  token: null,
  ...patch,
});

describe('shareLinkState', () => {
  const now = Date.parse('2026-10-08T00:00:00Z');

  it('is active before expiry', () => {
    expect(shareLinkState(link({}), now)).toBe('active');
  });

  it('is expired once past expiry', () => {
    expect(shareLinkState(link({ expiresAt: '2026-10-07T00:00:00Z' }), now)).toBe('expired');
  });

  it('reports revoked first, whatever the expiry', () => {
    expect(shareLinkState(link({ revokedAt: '2026-10-02T00:00:00Z' }), now)).toBe('revoked');
  });
});

describe('shareUrl', () => {
  it('builds the public page URL without a double slash', () => {
    expect(shareUrl('abc', 'https://reqsai.tech/')).toBe('https://reqsai.tech/share/abc');
    expect(shareUrl('abc', 'http://localhost:4200')).toBe('http://localhost:4200/share/abc');
  });
});
