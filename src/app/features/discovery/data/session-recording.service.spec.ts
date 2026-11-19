import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioRecorderService } from '../../../core/audio/audio-recorder.service';
import { SessionRecordingService } from './session-recording.service';

const BASE = '/api/projects/proj-1/sessions';

/**
 * US70: starting a live capture creates the session, records the participants' consent (who, when)
 * and only then starts it, so a capture never begins without a recorded consent.
 */
describe('SessionRecordingService start', () => {
  let service: SessionRecordingService;
  let http: HttpTestingController;
  const recorder = {
    startStreaming: vi.fn().mockResolvedValue(undefined),
    stopStreaming: vi.fn(),
    pauseStreaming: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AudioRecorderService, useValue: recorder },
      ],
    });
    service = TestBed.inject(SessionRecordingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates the session, records the consent, then starts and streams the capture', () => {
    service.start('proj-1', { title: 'Reunión', language: 'es-PE' }).subscribe();

    http.expectOne(BASE).flush({ id: 'sess-1', projectId: 'proj-1', status: 'DRAFT' });
    http.expectNone(`${BASE}/sess-1/start`);
    http.expectOne(`${BASE}/sess-1/consent`).flush({
      id: 'sess-1',
      projectId: 'proj-1',
      status: 'DRAFT',
      recordingConsentAt: '2026-11-18T15:00:00Z',
      recordingConsentBy: 'user-1',
    });
    http.expectOne(`${BASE}/sess-1/start`).flush({
      id: 'sess-1',
      projectId: 'proj-1',
      status: 'RECORDING',
      recordingConsentAt: '2026-11-18T15:00:00Z',
      recordingConsentBy: 'user-1',
    });

    expect(service.status()).toBe('RECORDING');
    expect(service.session()?.recordingConsentBy).toBe('user-1');
    expect(recorder.startStreaming).toHaveBeenCalledWith('sess-1');

    // Release the elapsed-time timer the live session started.
    service.stop()?.subscribe();
    http.expectOne(`${BASE}/sess-1/stop`).flush({ id: 'sess-1', status: 'STOPPED' });
    expect(service.session()).toBeNull();
  });

  it('does not start the capture when the consent cannot be recorded', () => {
    let failed: unknown;
    service.start('proj-1', { title: 'Reunión', language: 'es-PE' }).subscribe({
      error: (e) => (failed = e),
    });

    http.expectOne(BASE).flush({ id: 'sess-1', projectId: 'proj-1', status: 'DRAFT' });
    http
      .expectOne(`${BASE}/sess-1/consent`)
      .flush({ code: 'INVALID_SESSION_STATUS' }, { status: 422, statusText: 'Unprocessable' });

    http.expectNone(`${BASE}/sess-1/start`);
    expect(failed).toBeTruthy();
    expect(service.session()).toBeNull();
    expect(recorder.startStreaming).not.toHaveBeenCalled();
    expect(recorder.stopStreaming).toHaveBeenCalled();
    expect(service.busy()).toBe(false);
  });
});
