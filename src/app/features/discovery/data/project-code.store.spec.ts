import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { PermissionsStore } from '../../../core/authz/permissions.store';
import { ProjectCodeStore } from './project-code.store';

describe('ProjectCodeStore', () => {
  let store: ProjectCodeStore;
  let http: HttpTestingController;
  const granted = signal<string[]>(['INTEGRATION_READ', 'SESSION_DECIDE']);

  beforeEach(() => {
    granted.set(['INTEGRATION_READ', 'SESSION_DECIDE']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PermissionsStore, useValue: { has: (p: string) => granted().includes(p) } },
        ProjectCodeStore,
      ],
    });
    store = TestBed.inject(ProjectCodeStore);
    http = TestBed.inject(HttpTestingController);
  });

  const reposUrl = '/api/projects/p1/code/repositories';

  it('offers the action when a repository is ready and the analyst may read integrations and decide', () => {
    store.load('p1');
    http.expectOne(reposUrl).flush([{ id: 'r1', status: 'READY' }]);

    expect(store.hasReadyRepository()).toBe(true);
    expect(store.canVerify()).toBe(true);
  });

  it('hides it while every repository is still indexing or failed', () => {
    store.load('p1');
    http.expectOne(reposUrl).flush([
      { id: 'r1', status: 'INDEXING' },
      { id: 'r2', status: 'FAILED' },
    ]);

    expect(store.hasReadyRepository()).toBe(false);
    expect(store.canVerify()).toBe(false);
  });

  it('hides it without the permissions, even with a ready repository', () => {
    store.load('p1');
    http.expectOne(reposUrl).flush([{ id: 'r1', status: 'READY' }]);

    granted.set(['SESSION_DECIDE']);
    expect(store.canVerify()).toBe(false);
    granted.set(['INTEGRATION_READ']);
    expect(store.canVerify()).toBe(false);
  });

  it('hides it when the repositories cannot be read', () => {
    store.load('p1');
    http.expectOne(reposUrl).flush(null, { status: 403, statusText: 'Forbidden' });

    expect(store.canVerify()).toBe(false);
  });
});
