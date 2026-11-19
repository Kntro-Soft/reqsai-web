import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { AudioState } from '../../data/discovery.models';
import { AudioPurgedNotice } from './audio-purged-notice';

const ES = {
  discovery: {
    audio: {
      purged: 'Audio eliminado',
      purgedHint: 'El audio superó el período de retención y se eliminó automáticamente.',
    },
  },
};

describe('AudioPurgedNotice', () => {
  let fixture: ComponentFixture<AudioPurgedNotice>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        AudioPurgedNotice,
        TranslocoTestingModule.forRoot({
          langs: { es: ES },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
          preloadLangs: true,
        }),
      ],
    });
    fixture = TestBed.createComponent(AudioPurgedNotice);
  });

  function show(audioState: AudioState | undefined): HTMLElement {
    fixture.componentRef.setInput('session', { audioState });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says the audio was deleted by the retention policy when the session audio was purged', () => {
    const el = show('PURGED');

    const notice = el.querySelector('[data-testid="audio-purged-notice"]') as HTMLElement;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toContain('Audio eliminado');
    expect(notice.getAttribute('title')).toContain('período de retención');
  });

  it.each<AudioState | undefined>(['STORED', 'NONE', undefined])(
    'shows nothing while the audio state is %s',
    (state) => {
      const el = show(state);

      expect(el.querySelector('[data-testid="audio-purged-notice"]')).toBeNull();
    },
  );
});
