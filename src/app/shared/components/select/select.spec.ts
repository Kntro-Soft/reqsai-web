import { TestBed } from '@angular/core/testing';
import { Select, SelectOption } from './select';

describe('Select', () => {
  const options: SelectOption[] = [
    { value: 'en', label: 'English' },
    { value: 'es-419', label: 'Español (Latinoamérica)' },
  ];

  function render(inputs: Partial<{ compactLabel: string }> = {}) {
    const fixture = TestBed.createComponent(Select);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('size', 'sm');
    fixture.componentRef.setInput('value', 'es-419');
    if (inputs.compactLabel !== undefined) {
      fixture.componentRef.setInput('compactLabel', inputs.compactLabel);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
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
});
