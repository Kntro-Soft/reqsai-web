import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SILENCE_FORBIDDEN_TOAST } from '../../../core/interceptors/error.interceptor';
import { CodebaseApiService } from './codebase-api.service';
import { CodeModuleResponse, CodeRepositoryResponse } from './codebase.models';

const BASE = '/api/projects/p1/code/repositories';

describe('CodebaseApiService', () => {
  let api: CodebaseApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CodebaseApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CodebaseApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the repositories without the global 403 toast (it is polled)', () => {
    let result: CodeRepositoryResponse[] | undefined;
    api.listRepositories('p1').subscribe((r) => (result = r));
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SILENCE_FORBIDDEN_TOAST)).toBe(true);
    req.flush([{ id: 'repo-1' }]);
    expect(result?.[0].id).toBe('repo-1');
  });

  it('connects a repository with its branch and token', () => {
    api
      .connectRepository('p1', { repository: 'acme/reservas', branch: 'main', accessToken: 'tok' })
      .subscribe();
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      repository: 'acme/reservas',
      branch: 'main',
      accessToken: 'tok',
    });
    expect(req.request.context.get(SILENCE_FORBIDDEN_TOAST)).toBe(false);
    req.flush({ id: 'repo-1', status: 'PENDING' }, { status: 201, statusText: 'Created' });
  });

  it('reindexes a repository', () => {
    let status: string | undefined;
    api.reindexRepository('p1', 'repo-1').subscribe((r) => (status = r.status));
    const req = http.expectOne(`${BASE}/repo-1/reindex`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'repo-1', status: 'INDEXING' });
    expect(status).toBe('INDEXING');
  });

  it('removes a repository', () => {
    let done = false;
    api.removeRepository('p1', 'repo-1').subscribe(() => (done = true));
    const req = http.expectOne(`${BASE}/repo-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  it('lists the modules of a repository', () => {
    let modules: CodeModuleResponse[] | undefined;
    api.listModules('p1', 'repo-1').subscribe((m) => (modules = m));
    const req = http.expectOne(`${BASE}/repo-1/modules`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SILENCE_FORBIDDEN_TOAST)).toBe(true);
    req.flush([{ id: 'm1', path: '', name: 'Raíz' }]);
    expect(modules?.[0].path).toBe('');
  });
});
