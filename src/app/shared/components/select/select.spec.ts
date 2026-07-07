import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Select, SelectOption } from './select';

describe('Select', () => {
  const options: SelectOption[] = [
    { value: 'en', label: 'English' },
    { value: 'es-419', label: 'Español (Latinoamérica)' },
  ];

  function build(inputs: Partial<{ compactLabel: string }> = {}): ComponentFixture<Select> {
    const fixture = TestBed.createComponent(Select);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('size', 'sm');
    fixture.componentRef.setInput('value', 'es-419');
    if (inputs.compactLabel !== undefined) {
      fixture.componentRef.setInput('compactLabel', inputs.compactLabel);
    }
    fixture.detectChanges();
    return fixture;
  }

  function render(inputs: Partial<{ compactLabel: string }> = {}) {
    return build(inputs).nativeElement as HTMLElement;
  }

  /** Opens the dropdown and returns its overlay panel (rendered into the body). */
  function openPanel(fixture: ComponentFixture<Select>): HTMLElement {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    return document.querySelector<HTMLElement>('[role="listbox"]')!;
  }

  it('shows only the selected label in the trigger by default', () => {
    const el = render();
    const trigger = el.querySelector('button')!;
    expect(trigger.textContent).toContain('Español (Latinoamérica)');
    // No compact/full split spans without a compactLabel.
    expect(trigger.querySelector('.sm\\:hidden')).toBeNull();
  });

  it('renders the compact label below sm: and the full label from sm: up', () => {
    const el = render({ compactLabel: 'ES' });
    const trigger = el.querySelector('button')!;

    const full = trigger.querySelector('.hidden.sm\\:inline');
    const compact = trigger.querySelector('.sm\\:hidden');
    expect(full?.textContent).toContain('Español (Latinoamérica)');
    expect(compact?.textContent).toContain('ES');
  });

  it('drops the mobile min-width when a compactLabel is set', () => {
    const el = render({ compactLabel: 'ES' });
    const trigger = el.querySelector('button')!;
    // sm-sized trigger: min-width only applies from sm: up when compact.
    expect(trigger.className).toContain('sm:min-w-[7rem]');
    expect(trigger.className).not.toMatch(/(^|\s)min-w-\[7rem\]/);
  });

  it('keeps the unconditional min-width without a compactLabel', () => {
    const el = render();
    const trigger = el.querySelector('button')!;
    expect(trigger.className).toContain('min-w-[7rem]');
    expect(trigger.className).not.toContain('sm:min-w-[7rem]');
  });

  it('gives the dropdown panel a readable min-width (capped to viewport) when compact, keeping FULL option labels', () => {
    const fixture = build({ compactLabel: 'ES' });
    const panel = openPanel(fixture);

    // The panel renders into the CDK overlay container, appended to the body.
    expect(panel).not.toBeNull();
    // Panel width is independent of the compact trigger: its own min-width, capped
    // so it never overflows a narrow (~375px) viewport, and stays scrollable.
    expect(panel.className).toContain('min-w-[12rem]');
    expect(panel.className).toContain('max-w-[calc(100vw-2rem)]');
    // The options themselves keep their FULL names — the abbreviation is trigger-only.
    const optionLabels = Array.from(document.querySelectorAll('[role="option"]')).map((o) =>
      o.textContent?.trim(),
    );
    expect(optionLabels).toContain('Español (Latinoamérica)');
    expect(optionLabels).not.toContain('ES');

    fixture.destroy();
  });

  it('keeps the panel synced to the trigger width (w-full) without a compactLabel', () => {
    const fixture = build();
    const panel = openPanel(fixture);

    expect(panel).not.toBeNull();
    // Desktop behavior unchanged: the panel fills the trigger-synced overlay width.
    expect(panel.className).toContain('w-full');
    expect(panel.className).not.toContain('min-w-[12rem]');

    fixture.destroy();
  });
});
