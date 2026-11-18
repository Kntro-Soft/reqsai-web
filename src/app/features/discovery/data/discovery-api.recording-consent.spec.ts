import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryApiService } from './discovery-api.service';
import { DiscoverySessionResponse } from './discovery.models';

/** US70: the participants' consent is recorded per session before the capture starts. */
describe('DiscoveryApiService recording consent', () => {
  let api: DiscoveryApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DiscoveryApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DiscoveryApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs the confirmation to the session and returns who confirmed it and when', () => {
    let result: DiscoverySessionResponse | undefined;
    api.confirmRecordingConsent('proj-1', 'sess-7').subscribe((s) => (result = s));
    const req = http.expectOne('/api/projects/proj-1/sessions/sess-7/consent');
    expect(req.request.method).toBe('POST');
    req.flush({
      id: 'sess-7',
      status: 'DRAFT',
      recordingConsentAt: '2026-11-18T15:00:00Z',
      recordingConsentBy: 'user-1',
    });
    expect(result?.recordingConsentBy).toBe('user-1');
    expect(result?.recordingConsentAt).toBe('2026-11-18T15:00:00Z');
  });
});
