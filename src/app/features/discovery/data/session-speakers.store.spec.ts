import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionSpeakersStore } from './session-speakers.store';
import { SessionSpeakerResponse, SessionSpeakersResponse } from './discovery.models';

const SPEAKERS_URL = '/api/projects/proj-1/sessions/sess-1/speakers';

function speaker(overrides: Partial<SessionSpeakerResponse> = {}): SessionSpeakerResponse {
  return {
    label: '0',
    index: 1,
    displayName: null,
    name: 'Hablante 1',
    side: null,
    segmentCount: 4,
    ...overrides,
  };
}

function response(speakers: SessionSpeakerResponse[], count = 0): SessionSpeakersResponse {
  return {
    sessionId: 'sess-1',
    speakers,
    overlaps: {
      count,
      totalMs: count * 1000,
      ranges: count > 0 ? [{ startMs: 1000, endMs: 2000, speakerLabels: ['0', '1'] }] : [],
    },
  };
}

describe('SessionSpeakersStore', () => {
  let store: SessionSpeakersStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(SessionSpeakersStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads a session once per key and again when the key changes', () => {
    store.ensure('proj-1', 'sess-1', 'RECORDING|0');
    store.ensure('proj-1', 'sess-1', 'RECORDING|0');
    http.expectOne(SPEAKERS_URL).flush(response([speaker()]));
    store.ensure('proj-1', 'sess-1', 'RECORDING|0');
    expect(store.forSession('sess-1')?.speakers).toHaveLength(1);

    store.ensure('proj-1', 'sess-1', 'COMPLETED|0,1');
    http.expectOne(SPEAKERS_URL).flush(response([speaker(), speaker({ label: '1', index: 2 })], 2));
    expect(store.forSession('sess-1')?.speakers).toHaveLength(2);
    expect(store.forSession('sess-1')?.overlaps?.count).toBe(2);
  });

  it('keeps the default labels when loading fails and retries on the next key', () => {
    store.ensure('proj-1', 'sess-1', 'RECORDING|0');
    http.expectOne(SPEAKERS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    expect(store.forSession('sess-1')).toBeUndefined();

    store.ensure('proj-1', 'sess-1', 'RECORDING|0');
    store.ensure('proj-1', 'sess-1', 'RECORDING|0,1');
    http.expectOne(SPEAKERS_URL).flush(response([speaker()]));
    expect(store.forSession('sess-1')?.speakers).toHaveLength(1);
  });

  it('renames a speaker through the API and reflects the saved name', () => {
    store.ensure('proj-1', 'sess-1', 'COMPLETED|0');
    http.expectOne(SPEAKERS_URL).flush(response([speaker()]));

    let saved: SessionSpeakerResponse | undefined;
    store
      .update('proj-1', 'sess-1', '0', { displayName: 'Ana', side: 'CLIENT' })
      .subscribe((s) => (saved = s));
    const put = http.expectOne(`${SPEAKERS_URL}/0`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ displayName: 'Ana', side: 'CLIENT' });
    put.flush(speaker({ displayName: 'Ana', name: 'Ana', side: 'CLIENT' }));

    expect(saved?.name).toBe('Ana');
    expect(store.forSession('sess-1')?.speakers[0]).toMatchObject({
      displayName: 'Ana',
      name: 'Ana',
      side: 'CLIENT',
      segmentCount: 4,
    });
  });

  it('applies a SPEAKER_UPDATED event and forgets everything on reset', () => {
    store.applyRealtime({
      sessionId: 'sess-1',
      type: 'SPEAKER_UPDATED',
      occurredAt: '2026-10-09T10:00:00Z',
      speakerLabel: '1',
      displayName: 'Luis',
      side: 'TEAM',
    });
    expect(store.forSession('sess-1')?.speakers[0]).toMatchObject({
      label: '1',
      index: 1,
      displayName: 'Luis',
      side: 'TEAM',
    });

    store.reset();
    expect(store.forSession('sess-1')).toBeUndefined();
  });
});
