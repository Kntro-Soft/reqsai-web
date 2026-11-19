import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { RecordingConsent } from './recording-consent';

/** US70: the capture starts only after the analyst confirms the participants' consent. */
describe('RecordingConsent', () => {
  function render(open = true): {
    fixture: ComponentFixture<RecordingConsent>;
    confirmed: ReturnType<typeof vi.fn>;
    declined: ReturnType<typeof vi.fn>;
  } {
    TestBed.configureTestingModule({
      imports: [RecordingConsent, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    });
    const fixture = TestBed.createComponent(RecordingConsent);
    const confirmed = vi.fn();
    const declined = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.declined.subscribe(declined);
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
    return { fixture, confirmed, declined };
  }

  const byTestId = (id: string) =>
    document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function tick(fixture: ComponentFixture<RecordingConsent>): void {
    fixture.detectChanges();
  }

  it('renders nothing while closed', () => {
    render(false);
    expect(byTestId('recording-consent')).toBeNull();
  });

  it('blocks the confirmation and shows the reason until the consent is ticked', () => {
    const { fixture, confirmed } = render();
    const confirm = byTestId('consent-confirm') as HTMLButtonElement;

    expect(byTestId('consent-required')).not.toBeNull();
    expect(confirm.disabled).toBe(true);
    confirm.click();
    expect(confirmed).not.toHaveBeenCalled();

    const checkbox = byTestId('consent-checkbox') as HTMLInputElement;
    checkbox.click();
    tick(fixture);

    expect(byTestId('consent-required')).toBeNull();
    expect(confirm.disabled).toBe(false);
  });

  it('confirms and closes once the consent is ticked', () => {
    const { fixture, confirmed, declined } = render();
    (byTestId('consent-checkbox') as HTMLInputElement).click();
    tick(fixture);

    (byTestId('consent-confirm') as HTMLButtonElement).click();
    tick(fixture);

    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(declined).not.toHaveBeenCalled();
    expect(fixture.componentInstance.open()).toBe(false);
    expect(byTestId('recording-consent')).toBeNull();
  });

  it('declines without starting when the dialog is cancelled', () => {
    const { fixture, confirmed, declined } = render();

    (byTestId('consent-cancel') as HTMLButtonElement).click();
    tick(fixture);

    expect(declined).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('declines when the dialog is dismissed with Escape', () => {
    const { fixture, confirmed, declined } = render();

    byTestId('modal')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    tick(fixture);

    expect(declined).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('asks again on every opening: the checkbox does not carry over', () => {
    const { fixture } = render();
    (byTestId('consent-checkbox') as HTMLInputElement).click();
    tick(fixture);
    (byTestId('consent-cancel') as HTMLButtonElement).click();
    tick(fixture);

    fixture.componentInstance.open.set(true);
    tick(fixture);

    expect((byTestId('consent-checkbox') as HTMLInputElement).checked).toBe(false);
    expect((byTestId('consent-confirm') as HTMLButtonElement).disabled).toBe(true);
  });
});
