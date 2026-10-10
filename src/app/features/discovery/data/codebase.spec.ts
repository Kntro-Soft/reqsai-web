import { describe, expect, it } from 'vitest';
import {
  additionsCount,
  aggregateProfile,
  filterGitHubRepositories,
  anyIndexing,
  filterModules,
  indexingProgress,
  isAddition,
  isIndexing,
  isProfileEmpty,
  labelReferences,
  mergeProfile,
  modulesLoadKey,
  parseRepositoryInput,
  pluralKey,
  profileAdditions,
  safeReturnPath,
  shortSha,
  statusKey,
} from './codebase';
import { CodeModuleResponse, CodeProfile, CodeRepositoryResponse } from './codebase.models';

function profile(overrides: Partial<CodeProfile> = {}): CodeProfile {
  return {
    languages: [],
    frameworks: [],
    databases: [],
    platforms: [],
    overview: null,
    ...overrides,
  };
}

function repo(overrides: Partial<CodeRepositoryResponse> = {}): CodeRepositoryResponse {
  return {
    id: 'repo-1',
    projectId: 'p1',
    provider: 'GITHUB',
    owner: 'acme',
    name: 'reservas',
    fullName: 'acme/reservas',
    branch: 'main',
    htmlUrl: 'https://github.com/acme/reservas',
    private: false,
    source: 'PUBLIC',
    autoUpdate: false,
    status: 'READY',
    error: null,
    commitSha: '0123456789abcdef',
    indexedAt: '2026-10-09T10:00:00Z',
    fileCount: 42,
    moduleCount: 5,
    modulesDone: 5,
    summarized: true,
    profile: profile(),
    createdAt: '2026-10-09T09:00:00Z',
    ...overrides,
  };
}

function module(overrides: Partial<CodeModuleResponse> = {}): CodeModuleResponse {
  return {
    id: 'm1',
    path: 'src/reservas',
    name: 'Reservas',
    summary: 'Crea y cancela reservas de mesa.',
    capabilities: ['Crear reserva', 'Cancelar reserva'],
    businessRules: ['Una reserva se puede cancelar hasta 2 horas antes.'],
    endpoints: ['POST /api/reservas', 'DELETE /api/reservas/{id}'],
    entities: ['Reserva'],
    fileCount: 6,
    url: 'https://github.com/acme/reservas/tree/main/src/reservas',
    ...overrides,
  };
}

describe('parseRepositoryInput', () => {
  it.each([
    ['acme/reservas', 'acme', 'reservas', null],
    ['  acme/reservas  ', 'acme', 'reservas', null],
    ['acme/reservas.git', 'acme', 'reservas', null],
    ['Acme-Labs/my_app.web', 'Acme-Labs', 'my_app.web', null],
    ['https://github.com/acme/reservas', 'acme', 'reservas', null],
    ['https://github.com/acme/reservas/', 'acme', 'reservas', null],
    ['https://github.com/acme/reservas.git', 'acme', 'reservas', null],
    ['http://www.github.com/acme/reservas', 'acme', 'reservas', null],
    ['github.com/acme/reservas', 'acme', 'reservas', null],
    ['https://github.com/acme/reservas?tab=readme', 'acme', 'reservas', null],
    ['https://github.com/acme/reservas/tree/develop', 'acme', 'reservas', 'develop'],
    ['https://github.com/acme/reservas/tree/feature/cancel', 'acme', 'reservas', 'feature/cancel'],
  ])('accepts %s', (input, owner, name, branch) => {
    expect(parseRepositoryInput(input)).toEqual({ owner, name, branch });
  });

  it.each([
    '',
    '   ',
    'reservas',
    'acme/',
    '/reservas',
    'acme/reservas/extra',
    'acme reservas/x',
    '-acme/reservas',
    'acme/..',
    'acme/re$ervas',
    'https://gitlab.com/acme/reservas',
    'https://github.com/acme',
    'https://github.com/acme/reservas/blob/main/README.md',
    'https://github.com/acme/reservas/issues',
    'https://github.com/acme/reservas/tree/',
    'ftp://github.com/acme/reservas',
    'https://user:pw@github.com/acme/reservas',
    'git@github.com:acme/reservas.git',
    'github.com/acme',
  ])('rejects %j', (input) => {
    expect(parseRepositoryInput(input)).toBeNull();
  });

  it('rejects null and undefined', () => {
    expect(parseRepositoryInput(null)).toBeNull();
    expect(parseRepositoryInput(undefined)).toBeNull();
  });
});

describe('indexing state', () => {
  it('treats PENDING and INDEXING as indexing', () => {
    expect(isIndexing({ status: 'PENDING' })).toBe(true);
    expect(isIndexing({ status: 'INDEXING' })).toBe(true);
    expect(isIndexing({ status: 'READY' })).toBe(false);
    expect(isIndexing({ status: 'FAILED' })).toBe(false);
  });

  it('polls while any repository is indexing', () => {
    expect(anyIndexing([repo(), repo({ status: 'INDEXING' })])).toBe(true);
    expect(anyIndexing([repo(), repo({ status: 'FAILED' })])).toBe(false);
    expect(anyIndexing([])).toBe(false);
  });

  it('maps every status to its i18n key, unknown ones to pending', () => {
    expect(statusKey('READY')).toBe('code.repo.status.READY');
    expect(statusKey('FAILED')).toBe('code.repo.status.FAILED');
    expect(statusKey('INDEXING')).toBe('code.repo.status.INDEXING');
    expect(statusKey('ARCHIVED')).toBe('code.repo.status.PENDING');
    expect(statusKey(null)).toBe('code.repo.status.PENDING');
  });

  it('reports progress only once the module count is known', () => {
    expect(indexingProgress({ moduleCount: 0, modulesDone: 0 })).toBeNull();
    expect(indexingProgress({ moduleCount: 8, modulesDone: 2 })).toBe(25);
    expect(indexingProgress({ moduleCount: 3, modulesDone: 5 })).toBe(100);
    expect(indexingProgress({ moduleCount: 4, modulesDone: -1 })).toBe(0);
  });

  it('shortens a commit to 7 characters', () => {
    expect(shortSha('0123456789abcdef')).toBe('0123456');
    expect(shortSha(null)).toBeNull();
    expect(shortSha('  ')).toBeNull();
  });

  it('reloads modules once per finished indexing', () => {
    expect(modulesLoadKey(repo({ status: 'INDEXING' }))).toBeNull();
    const first = modulesLoadKey(repo());
    expect(first).toBe(modulesLoadKey(repo()));
    expect(modulesLoadKey(repo({ indexedAt: '2026-10-09T11:00:00Z' }))).not.toBe(first);
  });
});

describe('detected profile', () => {
  it('merges the READY repositories only, without duplicates', () => {
    const detected = aggregateProfile([
      repo({
        fullName: 'acme/reservas',
        profile: profile({
          languages: ['TypeScript', 'SQL'],
          frameworks: ['NestJS'],
          databases: ['PostgreSQL'],
          overview: 'API de reservas.',
        }),
      }),
      repo({
        id: 'repo-2',
        fullName: 'acme/web',
        profile: profile({
          languages: ['typescript'],
          frameworks: ['Angular'],
          platforms: ['Web'],
        }),
      }),
      repo({
        id: 'repo-3',
        status: 'INDEXING',
        profile: profile({ languages: ['Go'] }),
      }),
    ]);
    expect(detected.languages).toEqual(['TypeScript', 'SQL']);
    expect(detected.frameworks).toEqual(['NestJS', 'Angular']);
    expect(detected.databases).toEqual(['PostgreSQL']);
    expect(detected.platforms).toEqual(['Web']);
    expect(detected.overviews).toEqual([{ repository: 'acme/reservas', text: 'API de reservas.' }]);
    expect(isProfileEmpty(detected)).toBe(false);
    expect(isProfileEmpty(aggregateProfile([repo({ status: 'FAILED' })]))).toBe(true);
  });

  it('computes what is new to the project, ignoring case and accents', () => {
    const additions = profileAdditions(
      {
        programmingLanguages: ['Java', 'typescript'],
        frameworks: [],
        databases: ['PostgreSQL'],
        clientPlatforms: ['Movil'],
      },
      {
        languages: ['TypeScript', 'Kotlin'],
        frameworks: ['Spring Boot', 'spring boot'],
        databases: ['postgresql', 'Redis'],
        platforms: ['Móvil', 'Web'],
      },
    );
    expect(additions).toEqual({
      languages: ['Kotlin'],
      frameworks: ['Spring Boot'],
      databases: ['Redis'],
      platforms: ['Web'],
    });
    expect(additionsCount(additions)).toBe(4);
    expect(isAddition(additions.platforms, 'web')).toBe(true);
    expect(isAddition(additions.languages, 'TypeScript')).toBe(false);
  });

  it('treats everything as new for a project without a profile', () => {
    const additions = profileAdditions(null, {
      languages: ['TypeScript'],
      frameworks: [],
      databases: [],
      platforms: [],
    });
    expect(additions.languages).toEqual(['TypeScript']);
  });

  it('appends the additions and keeps what the project had', () => {
    expect(
      mergeProfile(
        {
          programmingLanguages: ['Java'],
          frameworks: ['Spring'],
          databases: [],
          clientPlatforms: [],
        },
        { languages: ['TypeScript'], frameworks: [], databases: ['Redis'], platforms: ['Web'] },
      ),
    ).toEqual({
      programmingLanguages: ['Java', 'TypeScript'],
      frameworks: ['Spring'],
      databases: ['Redis'],
      clientPlatforms: ['Web'],
    });
  });
});

describe('filterModules', () => {
  const modules = [
    module(),
    module({
      id: 'm2',
      path: 'src/pagos',
      name: 'Pagos',
      summary: 'Cobra con tarjeta.',
      capabilities: ['Cobrar'],
      businessRules: [],
      endpoints: ['POST /api/pagos'],
      entities: ['Pago'],
    }),
  ];

  it('keeps every module for a blank filter', () => {
    expect(filterModules(modules, '  ')).toHaveLength(2);
    expect(filterModules(modules, null)).toHaveLength(2);
  });

  it('matches name, path, rules and endpoints, ignoring case and accents', () => {
    expect(filterModules(modules, 'pagos').map((m) => m.id)).toEqual(['m2']);
    expect(filterModules(modules, '2 HORAS').map((m) => m.id)).toEqual(['m1']);
    expect(filterModules(modules, 'delete /api').map((m) => m.id)).toEqual(['m1']);
    expect(filterModules(modules, 'tarjéta').map((m) => m.id)).toEqual(['m2']);
  });

  it('needs every word to match', () => {
    expect(filterModules(modules, 'reserva pago')).toEqual([]);
  });
});

describe('pluralKey', () => {
  it('picks the singular form only for one', () => {
    expect(pluralKey('code.repo.files', 1)).toBe('code.repo.files.one');
    expect(pluralKey('code.repo.files', 0)).toBe('code.repo.files.other');
    expect(pluralKey('code.repo.files', 12)).toBe('code.repo.files.other');
  });
});

describe('labelReferences', () => {
  const ref = (name: string, path: string) => ({
    repository: 'acme/reservas',
    path,
    name,
    url: null,
  });

  it('keeps unique names and adds the folder, or the repository for its root, to repeated ones', () => {
    const labels = labelReferences([
      ref('Reservas', ''),
      ref('Pagos', 'src/payments'),
      ref('reservas', 'src/reservations'),
    ]).map((r) => r.label);

    expect(labels).toEqual(['Reservas · acme/reservas', 'Pagos', 'reservas · src/reservations']);
  });
});

describe('GitHub picker helpers', () => {
  const repo = (fullName: string, description: string | null = null) => ({
    installationId: 1,
    owner: fullName.split('/')[0],
    name: fullName.split('/')[1],
    fullName,
    defaultBranch: 'main',
    htmlUrl: `https://github.com/${fullName}`,
    private: false,
    description,
    pushedAt: null,
    connected: false,
  });

  it('filters by every word of the query over name and description, ignoring accents', () => {
    const list = [repo('acme/facturacion', 'Cobros y facturación'), repo('acme/web', null)];
    expect(filterGitHubRepositories(list, '  ').map((r) => r.fullName)).toEqual([
      'acme/facturacion',
      'acme/web',
    ]);
    expect(filterGitHubRepositories(list, 'FACTURACION cobros').map((r) => r.fullName)).toEqual([
      'acme/facturacion',
    ]);
    expect(filterGitHubRepositories(list, 'acme mobile')).toEqual([]);
  });

  it('accepts only in-app return paths', () => {
    expect(safeReturnPath('/projects/p1/code?x=1')).toBe('/projects/p1/code?x=1');
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(safeReturnPath('/\\evil.example')).toBeNull();
    expect(safeReturnPath('https://evil.example')).toBeNull();
    expect(safeReturnPath('/javascript:alert(1)')).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
});
