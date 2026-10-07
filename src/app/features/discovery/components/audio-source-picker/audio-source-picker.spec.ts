import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AudioSourcePicker } from './audio-source-picker';
import { AudioSource } from '../../../../core/audio/audio-source';

describe('AudioSourcePicker', () => {
  function render(
    inputs: { value?: AudioSource; meetingSupported?: boolean; disabled?: boolean } = {},
  ): { fixture: ComponentFixture<AudioSourcePicker>; el: HTMLElement } {
    TestBed.configureTestingModule({
      imports: [AudioSourcePicker, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    });
    const fixture = TestBed.createComponent(AudioSourcePicker);
    fixture.componentRef.setInput('value', inputs.value ?? 'mic');
    fixture.componentRef.setInput('meetingSupported', inputs.meetingSupported ?? true);
    fixture.componentRef.setInput('disabled', inputs.disabled ?? false);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function option(el: HTMLElement, source: AudioSource): HTMLButtonElement {
    return el.querySelector(`[data-testid="audio-source-${source}"]`) as HTMLButtonElement;
  }

  it('marks the current source as pressed', () => {
    const { el } = render({ value: 'meeting' });

    expect(option(el, 'meeting').getAttribute('aria-pressed')).toBe('true');
    expect(option(el, 'mic').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches to the virtual meeting source', () => {
    const { fixture, el } = render();
    const changes: AudioSource[] = [];
    fixture.componentInstance.value.subscribe((v) => changes.push(v));

    option(el, 'meeting').click();
    fixture.detectChanges();

    expect(changes).toEqual(['meeting']);
    expect(option(el, 'meeting').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the virtual option visible but inert where meeting audio is unsupported', () => {
    const { fixture, el } = render({ meetingSupported: false });
    let unavailable = 0;
    fixture.componentInstance.unavailablePicked.subscribe(() => unavailable++);

    const meeting = option(el, 'meeting');
    expect(meeting.getAttribute('aria-disabled')).toBe('true');
    expect(meeting.getAttribute('title')).toContain('discovery.source.unsupported');

    meeting.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('mic');
    expect(unavailable).toBe(1);
  });

  it('ignores clicks while locked by a live session', () => {
    const { fixture, el } = render({ disabled: true });

    option(el, 'meeting').click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('mic');
    expect(option(el, 'mic').getAttribute('aria-disabled')).toBe('true');
  });
});
