import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SILENCE_FORBIDDEN_TOAST } from '../../../core/interceptors/error.interceptor';
import { QualityApiService } from './quality-api.service';

describe('QualityApiService', () => {
  let api: QualityApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [QualityApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(QualityApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the indicators of the period without the global 403 toast', () => {
    let sessions: number | undefined;
    api
      .getQualityMetrics('p1', '2026-10-20', '2026-11-18')
      .subscribe((m) => (sessions = m.sessions));

    const req = http.expectOne(
      (r) => r.url === '/api/projects/p1/quality-metrics' && r.method === 'GET',
    );
    expect(req.request.params.get('from')).toBe('2026-10-20');
    expect(req.request.params.get('to')).toBe('2026-11-18');
    expect(req.request.context.get(SILENCE_FORBIDDEN_TOAST)).toBe(true);
    req.flush({ sessions: 4 });
    expect(sessions).toBe(4);
  });
});
