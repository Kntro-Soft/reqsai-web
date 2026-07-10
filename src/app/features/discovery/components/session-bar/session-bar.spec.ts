import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { SessionBar } from './session-bar';
import { SessionRecordingService } from '../../data/session-recording.service';
import { AudioRecorderService } from '../../../../core/audio/audio-recorder.service';
import { DiscoverySessionResponse, SessionStatus } from '../../data/discovery.models';

function session(status: SessionStatus): DiscoverySessionResponse {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    title: 'Kickoff',
    language: 'es-PE',
    status,
    startedAt: '2026-07-04T12:00:00Z',
    endedAt: null,
    audioDurationMs: 0,
    processingError: null,
    createdAt: '2026-07-04T11:59:00Z',
    updatedAt: '2026-07-04T11:59:00Z',
  };
}

class FakeRecordingService {
  readonly session = signal<DiscoverySessionResponse | null>(session('RECORDING'));
  readonly status = signal<SessionStatus | null>('RECORDING');
  readonly busy = signal(false);
  readonly elapsedMs = signal(0);
}

class FakeAudioRecorderService {
  readonly levels = signal<readonly number[]>([]);
}

describe('SessionBar', () => {
  let recording: FakeRecordingService;

  function render(): { fixture: ComponentFixture<SessionBar>; el: HTMLElement } {
    recording = new FakeRecordingService();
    TestBed.configureTestingModule({
      imports: [SessionBar, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: SessionRecordingService, useValue: recording },
        { provide: AudioRecorderService, useValue: new FakeAudioRecorderService() },
      ],
    });
    const fixture = TestBed.createComponent(SessionBar);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('gives the pause and stop buttons an accessible label and title (mobile hides their visible text)', () => {
    const { el } = render();

    const pause = el.querySelector('[data-testid="session-bar-pause"]') as HTMLButtonElement;
    const stop = el.querySelector('[data-testid="session-bar-stop"]') as HTMLButtonElement;

    expect(pause.getAttribute('aria-label')).toBeTruthy();
    expect(pause.getAttribute('title')).toBeTruthy();
    expect(stop.getAttribute('aria-label')).toBeTruthy();
    expect(stop.getAttribute('title')).toBeTruthy();
  });

  it('hides the pause/stop button labels and the status label below the sm breakpoint', () => {
    const { el } = render();

    const pause = el.querySelector('[data-testid="session-bar-pause"]') as HTMLButtonElement;
    const stop = el.querySelector('[data-testid="session-bar-stop"]') as HTMLButtonElement;
    const status = el.querySelector('[data-testid="session-bar-status"]') as HTMLElement;

    // "hidden sm:inline" is the app's established mobile-icon-only pattern
    // (see the discovery header's history/panel-toggle buttons).
    expect(pause.querySelector('span')?.className).toContain('hidden');
    expect(pause.querySelector('span')?.className).toContain('sm:inline');
    expect(stop.querySelector('span')?.className).toContain('hidden');
    expect(status.className).toContain('hidden');
    expect(status.className).toContain('sm:inline');
  });

  it('always renders the icon and the elapsed timer regardless of viewport', () => {
    const { el } = render();

    expect(el.querySelector('[data-testid="session-bar-pause"] hlm-icon')).not.toBeNull();
    expect(el.querySelector('[data-testid="session-bar-stop"] hlm-icon')).not.toBeNull();
    expect(el.querySelector('[data-testid="session-bar-timer"]')).not.toBeNull();
  });

  it('shows resume instead of pause once the session is paused', () => {
    recording = new FakeRecordingService();
    recording.status.set('PAUSED');
    TestBed.configureTestingModule({
      imports: [SessionBar, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: SessionRecordingService, useValue: recording },
        { provide: AudioRecorderService, useValue: new FakeAudioRecorderService() },
      ],
    });
    const fixture = TestBed.createComponent(SessionBar);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="session-bar-resume"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="session-bar-pause"]')).toBeNull();
  });
});
