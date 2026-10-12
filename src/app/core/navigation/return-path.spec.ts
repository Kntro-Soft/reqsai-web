import { afterEach, describe, expect, it } from 'vitest';
import { rememberReturnPath, safeReturnPath, takeReturnPath } from './return-path';

describe('return path', () => {
  afterEach(() => sessionStorage.removeItem('test.return'));

  it('accepts only in-app paths', () => {
    expect(safeReturnPath('/projects/p1/code?x=1')).toBe('/projects/p1/code?x=1');
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(safeReturnPath('/\\evil.example')).toBeNull();
    expect(safeReturnPath('https://evil.example')).toBeNull();
    expect(safeReturnPath('/javascript:alert(1)')).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });

  it('returns the remembered path once, and the fallback for an unsafe or missing one', () => {
    rememberReturnPath('test.return', '/projects/p1/settings/integrations');
    expect(takeReturnPath('test.return', '/settings/integrations')).toBe(
      '/projects/p1/settings/integrations',
    );
    expect(takeReturnPath('test.return', '/settings/integrations')).toBe('/settings/integrations');

    rememberReturnPath('test.return', '//evil.example');
    expect(takeReturnPath('test.return', '/settings/integrations')).toBe('/settings/integrations');
  });
});
