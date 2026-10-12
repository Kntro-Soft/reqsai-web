import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { CodeReference } from '../../data/codebase.models';
import { CodeReferences } from './code-references';

const EN = {
  discovery: {
    suggestion: {
      code: { references: 'Related places in the code', opensGitHub: '(opens on GitHub)' },
    },
    chat: { codeReferences: 'Cited code' },
  },
};

describe('CodeReferences', () => {
  let fixture: ComponentFixture<CodeReferences>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        CodeReferences,
        TranslocoTestingModule.forRoot({
          langs: { en: EN },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
    fixture = TestBed.createComponent(CodeReferences);
  });

  function show(references: CodeReference[] | null | undefined, testId = 'code-ref'): HTMLElement {
    fixture.componentRef.setInput('references', references);
    fixture.componentRef.setInput('chipTestId', testId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const place: CodeReference = {
    repository: 'Kntro-Soft/reqsai-landing',
    path: 'src/lib',
    name: 'plans.ts',
    url: 'https://github.com/Kntro-Soft/reqsai-landing/blob/abc/src/lib/plans.ts#L12-L20',
    file: 'src/lib/plans.ts',
    lineStart: 12,
    lineEnd: 20,
    quote: 'price: 49',
  };

  it('writes a place in a file as path:lines and opens GitHub in a new tab', () => {
    const el = show([place], 'chat-code-ref');

    const chip = el.querySelector('[data-testid="chat-code-ref"]') as HTMLAnchorElement;
    expect(chip.textContent).toContain('src/lib/plans.ts:12-20');
    expect(chip.getAttribute('href')).toBe(place.url);
    expect(chip.target).toBe('_blank');
    expect(chip.rel).toBe('noopener noreferrer');
    expect(chip.textContent).toContain('(opens on GitHub)');
  });

  it('keeps a module reference of before deep search as it was', () => {
    const el = show([
      {
        repository: 'a/b',
        path: 'src/x',
        name: 'Reservas',
        url: 'https://github.com/a/b/tree/main/src/x',
      },
    ]);

    const chip = el.querySelector('[data-testid="code-ref"]') as HTMLAnchorElement;
    expect(chip.textContent).toContain('Reservas');
    expect(chip.title).toBe('a/b/src/x');
  });

  it('shows plain text, not a link, when the url is missing or unsafe', () => {
    const el = show([
      { ...place, url: null },
      { ...place, lineStart: 30, lineEnd: 31, url: 'javascript:alert(1)' },
    ]);

    const chips = el.querySelectorAll('[data-testid="code-ref"]');
    expect(chips).toHaveLength(2);
    expect(Array.from(chips).every((c) => c.tagName === 'SPAN')).toBe(true);
  });

  it('renders nothing for no references', () => {
    expect(show([]).querySelector('ul')).toBeNull();
    expect(show(null).querySelector('ul')).toBeNull();
    expect(show(undefined).querySelector('ul')).toBeNull();
  });
});
