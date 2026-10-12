import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AudioSourcePicker } from './audio-source-picker';
import { AudioSource } from '../../../../core/audio/audio-source';

describe('AudioSourcePicker', () => {
  function render(
    inputs: {
      value?: AudioSource;
      meetingSupported?: boolean;
      disabled?: boolean;
      asking?: boolean;
    } = {},
  ): { fixture: ComponentFixture<AudioSourcePicker>; el: HTMLElement } {
    TestBed.configureTestingModule({
      imports: [AudioSourcePicker, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    });
    const fixture = TestBed.createComponent(AudioSourcePicker);
    fixture.componentRef.setInput('value', inputs.value ?? 'mic');
    fixture.componentRef.setInput('meetingSupported', inputs.meetingSupported ?? true);
    fixture.componentRef.setInput('disabled', inputs.disabled ?? false);
    fixture.componentRef.setInput('asking', inputs.asking ?? false);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function trigger(el: HTMLElement): HTMLButtonElement {
    return el.querySelector('[data-testid="audio-source-trigger"]') as HTMLButtonElement;
  }

  /** The menu lives in a CDK overlay on the document body, not inside the component. */
  function option(source: AudioSource): HTMLButtonElement | null {
    return document.querySelector(`[data-testid="audio-source-${source}"]`);
  }

  function open(fixture: ComponentFixture<AudioSourcePicker>, el: HTMLElement): void {
    trigger(el).click();
    fixture.detectChanges();
  }

  it('shows only a round button with the current source, no options', () => {
    const { el } = render();

    expect(trigger(el).getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger(el).getAttribute('aria-expanded')).toBe('false');
    expect(trigger(el).getAttribute('aria-label')).toContain('discovery.source.micShort');
    expect(option('mic')).toBeNull();
  });

  it('names the virtual meeting on the button when it is the current source', () => {
    const { el } = render({ value: 'meeting' });

    expect(trigger(el).getAttribute('aria-label')).toContain('discovery.source.meetingShort');
  });

  it('opens the menu with both sources and marks the current one', () => {
    const { fixture, el } = render({ value: 'meeting' });

    open(fixture, el);

    expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
    expect(option('meeting')?.getAttribute('aria-checked')).toBe('true');
    expect(option('mic')?.getAttribute('aria-checked')).toBe('false');
    expect(option('mic')?.textContent).toContain('discovery.source.micShort');
    // The full description is the accessible name; the short one is what is read on screen.
    expect(option('meeting')?.getAttribute('aria-label')).toContain('discovery.source.meeting');
    expect(option('meeting')?.getAttribute('aria-label')).not.toContain('meetingShort');
  });

  it('switches to the virtual meeting source and closes', () => {
    const { fixture, el } = render();
    const picked: AudioSource[] = [];
    fixture.componentInstance.picked.subscribe((v) => picked.push(v));
    open(fixture, el);

    option('meeting')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('meeting');
    expect(picked).toEqual(['meeting']);
    expect(fixture.componentInstance.open()).toBe(false);
    expect(option('meeting')).toBeNull();
  });

  it('reports a pick even when the source does not change', () => {
    const { fixture, el } = render();
    const picked: AudioSource[] = [];
    fixture.componentInstance.picked.subscribe((v) => picked.push(v));
    open(fixture, el);

    option('mic')?.click();

    expect(picked).toEqual(['mic']);
  });

  it('keeps the virtual option listed but inert where meeting audio is unsupported', () => {
    const { fixture, el } = render({ meetingSupported: false });
    let unavailable = 0;
    fixture.componentInstance.unavailablePicked.subscribe(() => unavailable++);
    open(fixture, el);

    const meeting = option('meeting');
    expect(meeting?.getAttribute('aria-disabled')).toBe('true');
    expect(meeting?.textContent).toContain('discovery.source.unsupported');

    meeting?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('mic');
    expect(unavailable).toBe(1);
  });

  it('cannot be opened while locked by a live session', () => {
    const { fixture, el } = render({ disabled: true });

    open(fixture, el);

    expect(trigger(el).disabled).toBe(true);
    expect(fixture.componentInstance.open()).toBe(false);
    expect(option('mic')).toBeNull();
  });

  it('can be opened by the page and asks where the audio comes from', () => {
    const { fixture } = render({ asking: true });

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(document.querySelector('[data-testid="audio-source-ask"]')).not.toBeNull();
    expect(option('mic')).not.toBeNull();
  });

  it('moves with the arrow keys, closes on Escape and returns focus to the button', () => {
    const { fixture, el } = render();
    open(fixture, el);
    const mic = option('mic') as HTMLButtonElement;
    const meeting = option('meeting') as HTMLButtonElement;
    // The checked item takes focus when the menu opens.
    expect(document.activeElement).toBe(mic);

    mic.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(meeting);
    meeting.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(mic);

    mic.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.open()).toBe(false);
    expect(document.activeElement).toBe(trigger(el));
  });
});
