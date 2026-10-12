import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SILENCE_FORBIDDEN_TOAST } from '../../../core/interceptors/error.interceptor';
import { OverviewApiService } from './overview-api.service';

describe('OverviewApiService', () => {
  let api: OverviewApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OverviewApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(OverviewApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the project overview without the global 403 toast', () => {
    let weeks: number | undefined;
    api.getProjectOverview('p1').subscribe((o) => (weeks = o.weeks));
    const req = http.expectOne('/api/projects/p1/overview');
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SILENCE_FORBIDDEN_TOAST)).toBe(true);
    req.flush({ weeks: 12 });
    expect(weeks).toBe(12);
  });

  it('reads the organization overview without the global 403 toast', () => {
    let projects: number | undefined;
    api.getOrganizationOverview('o1').subscribe((o) => (projects = o.projects));
    const req = http.expectOne('/api/organizations/o1/overview');
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SILENCE_FORBIDDEN_TOAST)).toBe(true);
    req.flush({ projects: 3 });
    expect(projects).toBe(3);
  });
});
