import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { IntegrationJobsStore, JOB_POLL_INTERVAL_MS } from './integration-jobs.store';
import { IntegrationJobResponse } from './integrations.models';

/** In-memory RealtimeService: one Subject per logical topic + a settable connected flag. */
class FakeRealtimeService {
  readonly topics = new Map<string, Subject<unknown>>();
  readonly connected = signal(true);

  watch<T>(topic: string): Subject<T> {
    let subject = this.topics.get(topic);
    if (!subject) {
      subject = new Subject<unknown>();
      this.topics.set(topic, subject);
    }
    return subject as Subject<T>;
  }
}

const ACTIVE_URL = '/api/projects/proj-1/integration/jira/jobs?active=true';
const TOPIC = 'projects/proj-1/integration-jobs';

function job(overrides: Partial<IntegrationJobResponse> = {}): IntegrationJobResponse {
  return {
    id: 'job-1',
    projectId: 'proj-1',
    jobType: 'IMPORT',
    status: 'RUNNING',
    total: 10,
    processed: 0,
    succeeded: 0,
    failed: 0,
    message: null,
    createdAt: '2026-07-09T10:00:00Z',
    finishedAt: null,
    ...overrides,
  };
}

describe('IntegrationJobsStore', () => {
  let store: IntegrationJobsStore;
  let http: HttpTestingController;
  let realtime: FakeRealtimeService;

  beforeEach(() => {
    realtime = new FakeRealtimeService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RealtimeService, useValue: realtime },
      ],
    });
    store = TestBed.inject(IntegrationJobsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.setProject(null); // stops any polling interval between tests
    http.verify();
    vi.useRealTimers();
  });

  it('recovers the active jobs when a project context loads', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([job({ processed: 4 })]);

    expect(store.jobs().length).toBe(1);
    expect(store.current()?.processed).toBe(4);
    expect(store.runningOfType('IMPORT')).toBe(true);
    expect(store.runningOfType('PUSH_ALL')).toBe(false);
  });

  it('tracks a 202 job immediately and upserts realtime progress snapshots', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([]);

    store.track(job());
    expect(store.current()?.processed).toBe(0);

    realtime.topics.get(TOPIC)!.next(job({ processed: 7 }));
    expect(store.current()?.processed).toBe(7);
    expect(store.jobs().length).toBe(1);
  });

  it('never regresses progress on an out-of-order RUNNING snapshot', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([job({ processed: 7 })]);

    realtime.topics.get(TOPIC)!.next(job({ processed: 3 }));
    expect(store.current()?.processed).toBe(7);
  });

  it('emits a terminal job exactly once and drops it from the running list', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([job()]);

    const completed: IntegrationJobResponse[] = [];
    store.completed$.subscribe((j) => completed.push(j));

    const done = job({ status: 'COMPLETED', processed: 10, succeeded: 9, failed: 1 });
    realtime.topics.get(TOPIC)!.next(done);
    realtime.topics.get(TOPIC)!.next(done); // duplicate terminal snapshot

    expect(completed.length).toBe(1);
    expect(completed[0].succeeded).toBe(9);
    expect(store.jobs().length).toBe(0);
    expect(store.current()).toBeNull();
  });

  it('emits FAILED jobs on the same completion stream', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([]);

    const completed: IntegrationJobResponse[] = [];
    store.completed$.subscribe((j) => completed.push(j));

    realtime.topics.get(TOPIC)!.next(job({ status: 'FAILED', message: 'JIRA_UNREACHABLE' }));
    expect(completed.length).toBe(1);
    expect(completed[0].status).toBe('FAILED');
  });

  it('ignores snapshots that belong to another project', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([]);

    realtime.topics.get(TOPIC)!.next(job({ projectId: 'proj-other' }));
    expect(store.jobs().length).toBe(0);
  });

  it('polls each running job while the socket is down and stops on terminal', () => {
    vi.useFakeTimers();
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([job()]);

    realtime.connected.set(false);
    vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS);
    http.expectOne('/api/projects/proj-1/integration/jira/jobs/job-1').flush(job({ processed: 5 }));
    expect(store.current()?.processed).toBe(5);

    vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS);
    http
      .expectOne('/api/projects/proj-1/integration/jira/jobs/job-1')
      .flush(job({ status: 'COMPLETED', processed: 10 }));
    expect(store.jobs().length).toBe(0);

    // Terminal stopped the poll: no further requests on the next tick.
    vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS);
    http.expectNone('/api/projects/proj-1/integration/jira/jobs/job-1');
  });

  it('does not poll while the socket is connected (STOMP already pushes snapshots)', () => {
    vi.useFakeTimers();
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([job()]);

    realtime.connected.set(true);
    vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS * 3);
    http.expectNone('/api/projects/proj-1/integration/jira/jobs/job-1');
  });

  it('clears jobs and resubscribes when the project changes', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([job()]);
    expect(store.jobs().length).toBe(1);

    store.setProject('proj-2');
    http.expectOne('/api/projects/proj-2/integration/jira/jobs?active=true').flush([]);
    expect(store.jobs().length).toBe(0);

    // The old project's topic no longer feeds the store.
    realtime.topics.get(TOPIC)!.next(job({ processed: 9 }));
    expect(store.jobs().length).toBe(0);
  });

  it('is idempotent for the same project (no duplicate recovery fetch)', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush([]);

    store.setProject('proj-1');
    http.expectNone(ACTIVE_URL);
  });

  it('keeps working when the recovery fetch fails (realtime still feeds it)', () => {
    store.setProject('proj-1');
    http.expectOne(ACTIVE_URL).flush(null, { status: 500, statusText: 'Server Error' });

    realtime.topics.get(TOPIC)!.next(job());
    expect(store.jobs().length).toBe(1);
  });
});
