import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProjectGlossary } from './glossary';
import { ProjectContextApiService } from '../../data/project-context-api.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { ToastService } from '../../../../shared/toast/toast.service';

const TERM = {
  id: 't1',
  term: 'Reserva',
  definition: 'Mesa apartada.',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

function page(content: object[]) {
  return of({ content, page: { totalPages: 1, totalElements: content.length } });
}

describe('ProjectGlossary', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function render(
    content: object[] = [],
    granted: readonly string[] = ['GLOSSARY_TERM_WRITE', 'GLOSSARY_TERM_DELETE'],
  ): { fixture: ComponentFixture<ProjectGlossary>; el: HTMLElement } {
    api = {
      listGlossaryTerms: vi.fn(() => page(content)),
      createGlossaryTerm: vi.fn((_o: string, _p: string, body: object) =>
        of({ ...TERM, id: 't2', ...body }),
      ),
      updateGlossaryTerm: vi.fn((_o: string, _p: string, id: string, body: object) =>
        of({ ...TERM, id, ...body }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [ProjectGlossary, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: ProjectContextApiService, useValue: api },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        {
          provide: PermissionsStore,
          useValue: { has: (p: string) => granted.includes(p), isOrgOwnerOrAdmin: () => true },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectGlossary);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function type(el: HTMLElement, id: string, value: string): void {
    const field = byTestId(el, id) as HTMLInputElement | HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  async function openCreate(fixture: ComponentFixture<ProjectGlossary>, el: HTMLElement) {
    byTestId(el, 'glossary-new')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const submit = (fixture: ComponentFixture<ProjectGlossary>, el: HTMLElement) => {
    byTestId(el, 'term-submit')!.click();
    fixture.detectChanges();
  };

  it('has no inline add form: creating happens in a modal opened from the header', async () => {
    const { fixture, el } = render([TERM]);

    expect(byTestId(el, 'term-form')).toBeNull();
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    await openCreate(fixture, el);

    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(byTestId(el, 'term-form')).not.toBeNull();
    // The first field takes focus so the analyst can start typing.
    expect(document.activeElement).toBe(byTestId(el, 'term-input'));
  });

  it('offers the create button on the empty state too, but not without the permission', () => {
    const { el } = render([]);
    expect(byTestId(el, 'glossary-empty')).not.toBeNull();
    expect(byTestId(el, 'glossary-new')).not.toBeNull();
    expect(byTestId(el, 'glossary-empty-new')).not.toBeNull();

    TestBed.resetTestingModule();
    const readOnly = render([], []);
    expect(byTestId(readOnly.el, 'glossary-new')).toBeNull();
    expect(byTestId(readOnly.el, 'glossary-empty-new')).toBeNull();
  });

  it('validates inline without calling the API', async () => {
    const { fixture, el } = render([TERM]);
    await openCreate(fixture, el);

    type(el, 'term-input', '   ');
    submit(fixture, el);

    expect(api['createGlossaryTerm']).not.toHaveBeenCalled();
    expect(byTestId(el, 'term-error')).not.toBeNull();
    expect(byTestId(el, 'definition-error')).not.toBeNull();
    expect(byTestId(el, 'term-input')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('creates the term trimmed, closes, toasts and reloads the list', async () => {
    const { fixture, el } = render([TERM]);
    const toast = TestBed.inject(ToastService);
    await openCreate(fixture, el);

    type(el, 'term-input', '  Mesa  ');
    type(el, 'definition-input', ' Lugar donde se sientan. ');
    submit(fixture, el);

    expect(api['createGlossaryTerm']).toHaveBeenCalledWith('org-1', 'p1', {
      term: 'Mesa',
      definition: 'Lugar donde se sientan.',
    });
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(toast.toasts().some((t) => t.kind === 'success')).toBe(true);
    expect(api['listGlossaryTerms']).toHaveBeenCalledTimes(2);
  });

  it('keeps the modal open and shows an API error inside it', async () => {
    const { fixture, el } = render([TERM]);
    await openCreate(fixture, el);
    api['createGlossaryTerm'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'Duplicado' } })),
    );

    type(el, 'term-input', 'Reserva');
    type(el, 'definition-input', 'Otra definición.');
    submit(fixture, el);

    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(byTestId(el, 'term-form-error')).not.toBeNull();
    expect((byTestId(el, 'term-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(api['listGlossaryTerms']).toHaveBeenCalledTimes(1);
  });

  it('edits a row in the same modal, prefilled, with a PUT', async () => {
    const { fixture, el } = render([TERM]);
    (fixture.componentInstance as unknown as { askEdit(t: typeof TERM): void }).askEdit(TERM);
    fixture.detectChanges();
    await fixture.whenStable();

    expect((byTestId(el, 'term-input') as HTMLInputElement).value).toBe('Reserva');
    expect((byTestId(el, 'definition-input') as HTMLTextAreaElement).value).toBe('Mesa apartada.');

    type(el, 'definition-input', 'Mesa apartada para una hora.');
    submit(fixture, el);

    expect(api['updateGlossaryTerm']).toHaveBeenCalledWith('org-1', 'p1', 't1', {
      term: 'Reserva',
      definition: 'Mesa apartada para una hora.',
    });
    expect(api['createGlossaryTerm']).not.toHaveBeenCalled();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.textContent).toContain('Mesa apartada para una hora.');
  });
});
