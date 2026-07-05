import { languageStorageKey, resolveInitialLanguage } from './language-preference';

describe('languageStorageKey', () => {
  it('scopes the key per project', () => {
    expect(languageStorageKey('proj-1')).toBe('reqsai.discovery.lang.proj-1');
    expect(languageStorageKey('proj-2')).not.toBe(languageStorageKey('proj-1'));
  });
});

describe('resolveInitialLanguage', () => {
  it('prefers the stored override over the org default', () => {
    expect(resolveInitialLanguage('en-US', 'es-PE')).toBe('en-US');
  });

  it('falls back to the org default when nothing is stored', () => {
    expect(resolveInitialLanguage(null, 'pt-BR')).toBe('pt-BR');
    expect(resolveInitialLanguage(undefined, 'pt-BR')).toBe('pt-BR');
  });

  it('ignores blank stored values', () => {
    expect(resolveInitialLanguage('', 'de')).toBe('de');
    expect(resolveInitialLanguage('   ', 'de')).toBe('de');
  });

  it('defaults to es-PE when neither source has a value', () => {
    expect(resolveInitialLanguage(null, null)).toBe('es-PE');
    expect(resolveInitialLanguage('', '  ')).toBe('es-PE');
  });
});
