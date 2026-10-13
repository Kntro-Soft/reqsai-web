import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { CaptureMenu } from './capture-menu';

describe('CaptureMenu', () => {
  function render(
    inputs: {
      canUpload?: boolean;
      uploadBlocked?: boolean;
      speakers?: boolean;
      canEditSpeakers?: boolean;
    } = {},
  ): { fixture: ComponentFixture<CaptureMenu>; el: HTMLElement } {
    TestBed.configureTestingModule({
      imports: [CaptureMenu, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CaptureMenu);
    fixture.componentRef.setInput('canUpload', inputs.canUpload ?? false);
    fixture.componentRef.setInput('uploadBlocked', inputs.uploadBlocked ?? false);
    fixture.componentRef.setInput('speakers', inputs.speakers ?? false);
    fixture.componentRef.setInput('canEditSpeakers', inputs.canEditSpeakers ?? false);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const trigger = (el: HTMLElement) =>
    el.querySelector('[data-testid="capture-menu"]') as HTMLButtonElement;
  const panel = () => document.querySelector('[data-testid="capture-menu-panel"]');
  const item = (testid: string) =>
    document.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;

  function open(fixture: ComponentFixture<CaptureMenu>, el: HTMLElement): void {
    trigger(el).click();
    fixture.detectChanges();
  }

  it('is a single closed button until opened', () => {
    const { el } = render();

    expect(trigger(el).getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger(el).getAttribute('aria-expanded')).toBe('false');
    expect(trigger(el).textContent?.trim()).toBe('');
    expect(panel()).toBeNull();
  });

  it('lists only the history when nothing else applies', () => {
    const { fixture, el } = render();

    open(fixture, el);

    expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
    expect(item('discovery-history')).not.toBeNull();
    expect(item('upload-recording-open')).toBeNull();
    expect(item('speakers-menu')).toBeNull();
  });

  it('disables the upload and says why when the AI allowance is spent', () => {
    const { fixture, el } = render({ canUpload: true, uploadBlocked: true });

    open(fixture, el);

    expect((item('upload-recording-open') as HTMLButtonElement).disabled).toBe(true);
    expect(item('upload-recording-open')?.textContent).toContain('discovery.upload.quotaBlocked');
  });

  it('offers the upload and the speakers when they apply', () => {
    const { fixture, el } = render({ canUpload: true, speakers: true, canEditSpeakers: true });

    open(fixture, el);

    expect(item('upload-recording-open')).not.toBeNull();
    expect(item('speakers-menu')?.textContent).toContain('discovery.speakers.edit');
  });

  it('reads "view" for people who cannot edit the speakers', () => {
    const { fixture, el } = render({ speakers: true, canEditSpeakers: false });

    open(fixture, el);

    expect(item('speakers-menu')?.textContent).toContain('discovery.speakers.view');
  });

  it('emits the chosen action and closes', () => {
    const { fixture, el } = render({ canUpload: true, speakers: true });
    const calls: string[] = [];
    fixture.componentInstance.uploadRequested.subscribe(() => calls.push('upload'));
    fixture.componentInstance.speakersRequested.subscribe(() => calls.push('speakers'));
    open(fixture, el);

    item('upload-recording-open')?.click();
    fixture.detectChanges();
    expect(calls).toEqual(['upload']);
    expect(panel()).toBeNull();

    open(fixture, el);
    item('speakers-menu')?.click();
    fixture.detectChanges();
    expect(calls).toEqual(['upload', 'speakers']);
  });

  it('focuses the first entry, moves with the arrows and wraps', () => {
    const { fixture, el } = render({ canUpload: true, speakers: true });
    open(fixture, el);
    const entries = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="capture-menu-panel"] [role="menuitem"]',
      ),
    );
    expect(entries).toHaveLength(3);
    expect(document.activeElement).toBe(entries[0]);

    entries[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(entries[1]);
    entries[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(entries[2]);
    entries[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(entries[0]);
    entries[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(entries[2]);
  });

  it('closes on Escape and returns focus to the button', () => {
    const { fixture, el } = render();
    open(fixture, el);

    item('discovery-history')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger(el));
  });
});
