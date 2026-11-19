import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorySourceFragmentResponse, StorySourcesResponse } from '../../data/story-sources.models';
import { StorySources } from './story-sources';

const EN = {
  common: { close: 'Close', cancel: 'Cancel' },
  discovery: { retry: 'Retry' },
  storyForm: {
    viewSession: 'View source session',
    origin: { viewInSession: 'View in the session' },
  },
  storySources: {
    action: 'View origin',
    title: 'Story origin',
    hint: 'Fragments of the meeting',
    loadError: 'The origin could not be loaded.',
    manual: 'This story does not come from a session.',
    unavailable: 'Origin not available.',
    session: 'Session: {{title}}',
    sessionGone: 'Deleted session',
    moment: 'Moment of the meeting: {{time}}',
    notLocated: 'Not located in the transcript',
  },
};

const SOURCES_URL = '/api/projects/proj-1/stories/story-1/sources';

const located: StorySourceFragmentResponse = {
  id: 'f-1',
  sessionId: 'sess-1',
  sessionTitle: 'Kickoff con el restaurante',
  sessionStartedAt: '2026-11-10T15:00:00Z',
  quote: 'que el comensal reserve una mesa en línea',
  transcriptText: 'Necesito que el comensal reserve una mesa en línea.',
  startSequence: 12,
  endSequence: 13,
  startMs: 754_000,
  endMs: 761_500,
  occurredAt: '2026-11-10T15:12:34Z',
  speakerName: 'Ana Torres',
};

describe('StorySources', () => {
  let fixture: ComponentFixture<StorySources>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        StorySources,
        TranslocoTestingModule.forRoot({
          langs: { en: EN },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StorySources);
    fixture.componentRef.setInput('projectId', 'proj-1');
    fixture.componentRef.setInput('storyId', 'story-1');
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  const byId = (id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);
  const all = (id: string): HTMLElement[] =>
    Array.from(el.querySelectorAll(`[data-testid="${id}"]`));

  /** Selects "ver origen" and answers the request with `body` (or an error when null). */
  function openWith(body: StorySourcesResponse | null): void {
    byId('story-sources-open')!.click();
    fixture.detectChanges();
    const req = http.expectOne(SOURCES_URL);
    if (body) req.flush(body);
    else req.flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
  }

  it('does not load anything, nor show the dialog, until "ver origen" is selected', () => {
    expect(byId('story-sources-open')?.textContent).toContain('View origin');
    expect(byId('modal')).toBeNull();
    http.expectNone(SOURCES_URL);
  });

  it('shows the spinner while the sources load', () => {
    byId('story-sources-open')!.click();
    fixture.detectChanges();

    expect(byId('modal')).not.toBeNull();
    expect(byId('story-sources-loading')).not.toBeNull();
    http
      .expectOne(SOURCES_URL)
      .flush({ storyId: 'story-1', origin: 'MANUAL', sessionId: null, fragments: [] });
  });

  it('Given a story generated during a session, when "ver origen" is selected, then it shows the transcript fragment and the moment of the meeting', () => {
    openWith({
      storyId: 'story-1',
      origin: 'SESSION',
      sessionId: null,
      sessionTitle: null,
      sessionStartedAt: null,
      fragments: [located],
    });

    expect(all('story-source')).toHaveLength(1);
    expect(byId('story-source-text')?.textContent).toContain(
      'Necesito que el comensal reserve una mesa en línea.',
    );
    expect(byId('story-source-moment')?.textContent).toContain(
      'Moment of the meeting: 12:34 – 12:41',
    );
    expect(byId('story-source-speaker')?.textContent).toContain('Ana Torres');
    expect(byId('story-source-session')?.textContent).toContain('Kickoff con el restaurante');
    expect(byId('story-sources-manual')).toBeNull();
    expect(byId('story-sources-unavailable')).toBeNull();
  });

  it('links each fragment to its session at the segment it starts in', () => {
    openWith({
      storyId: 'story-1',
      origin: 'SESSION',
      sessionId: null,
      sessionTitle: null,
      sessionStartedAt: null,
      fragments: [located],
    });

    const link = byId('story-source-link') as HTMLAnchorElement;
    const url = new URL(link.href, 'http://localhost');
    expect(url.pathname).toBe('/projects/proj-1/sessions');
    expect(url.searchParams.get('session')).toBe('sess-1');
    expect(url.searchParams.get('segment')).toBe('12');
  });

  it('shows the quote, with no moment, for a fragment that was not located in the transcript', () => {
    openWith({
      storyId: 'story-1',
      origin: 'SESSION',
      sessionId: null,
      sessionTitle: null,
      sessionStartedAt: null,
      fragments: [
        {
          ...located,
          transcriptText: null,
          startSequence: null,
          endSequence: null,
          startMs: null,
          endMs: null,
          occurredAt: null,
          speakerName: null,
        },
      ],
    });

    expect(byId('story-source-text')?.textContent).toContain(
      'que el comensal reserve una mesa en línea',
    );
    expect(byId('story-source-moment')).toBeNull();
    expect(byId('story-source-not-located')?.textContent).toContain(
      'Not located in the transcript',
    );
    expect(byId('story-source-speaker')).toBeNull();
  });

  it('lists every fragment of a story that comes from several moments', () => {
    openWith({
      storyId: 'story-1',
      origin: 'SESSION',
      sessionId: null,
      sessionTitle: null,
      sessionStartedAt: null,
      fragments: [located, { ...located, id: 'f-2', startMs: 90_000, endMs: 95_000 }],
    });

    expect(all('story-source')).toHaveLength(2);
    expect(all('story-source-moment')[1].textContent).toContain('1:30 – 1:35');
  });

  it('Given a story created manually, when "ver origen" is selected, then it says the story does not come from a session', () => {
    openWith({
      storyId: 'story-1',
      origin: 'MANUAL',
      sessionId: null,
      sessionTitle: null,
      sessionStartedAt: null,
      fragments: [],
    });

    expect(byId('story-sources-manual')?.textContent).toContain('does not come from a session');
    expect(byId('story-sources-list')).toBeNull();
    expect(byId('story-source')).toBeNull();
  });

  it('says the origin is not available, and names the session, for a story from before fragments were kept', () => {
    openWith({
      storyId: 'story-1',
      origin: 'UNAVAILABLE',
      sessionId: 'sess-1',
      sessionTitle: 'Kickoff con el restaurante',
      sessionStartedAt: '2026-11-10T15:00:00Z',
      fragments: [],
    });

    expect(byId('story-sources-unavailable')?.textContent).toContain('Origin not available.');
    const link = byId('story-sources-unavailable-session') as HTMLAnchorElement;
    expect(link.textContent).toContain('Session: Kickoff con el restaurante');
    expect(new URL(link.href, 'http://localhost').searchParams.get('session')).toBe('sess-1');
  });

  it('offers a retry when the sources cannot be loaded', () => {
    openWith(null);

    expect(byId('story-sources-error')?.textContent).toContain('The origin could not be loaded.');
    (byId('story-sources-error')!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    http
      .expectOne(SOURCES_URL)
      .flush({ storyId: 'story-1', origin: 'MANUAL', sessionId: null, fragments: [] });
    fixture.detectChanges();

    expect(byId('story-sources-error')).toBeNull();
    expect(byId('story-sources-manual')).not.toBeNull();
  });

  it('closes the dialog and reads the sources again when it is reopened', () => {
    openWith({
      storyId: 'story-1',
      origin: 'MANUAL',
      sessionId: null,
      sessionTitle: null,
      sessionStartedAt: null,
      fragments: [],
    });

    byId('story-sources-close')!.click();
    fixture.detectChanges();
    expect(byId('modal')).toBeNull();

    byId('story-sources-open')!.click();
    fixture.detectChanges();
    http
      .expectOne(SOURCES_URL)
      .flush({ storyId: 'story-1', origin: 'MANUAL', sessionId: null, fragments: [] });
  });
});
