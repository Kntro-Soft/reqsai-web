import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProjectConstraints } from './constraints';
import { ProjectContextApiService } from '../../data/project-context-api.service';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { ToastService } from '../../../../shared/toast/toast.service';

const CONSTRAINT = {
  id: 'c1',
  description: 'Debe integrarse con SAP',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

function page(content: object[]) {
  return of({ content, page: { totalPages: 1, totalElements: content.length } });
}

describe('ProjectConstraints', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function render(
    content: object[] = [],
    granted: readonly string[] = ['CONSTRAINT_WRITE'],
  ): { fixture: ComponentFixture<ProjectConstraints>; el: HTMLElement } {
    api = {
      listConstraints: vi.fn(() => page(content)),
      createConstraint: vi.fn((_o: string, _p: string, body: object) =>
        of({ ...CONSTRAINT, id: 'c2', ...body }),
      ),
      updateConstraint: vi.fn((_o: string, _p: string, id: string, body: object) =>
        of({ ...CONSTRAINT, id, ...body }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [ProjectConstraints, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: ProjectContextApiService, useValue: api },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        {
          provide: PermissionsStore,
          useValue: { has: (p: string) => granted.includes(p), isOrgOwnerOrAdmin: () => true },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectConstraints);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function type(el: HTMLElement, value: string): void {
    const field = byTestId(el, 'constraint-input') as HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  async function openCreate(fixture: ComponentFixture<ProjectConstraints>, el: HTMLElement) {
    byTestId(el, 'constraints-new')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const submit = (fixture: ComponentFixture<ProjectConstraints>, el: HTMLElement) => {
    byTestId(el, 'constraint-submit')!.click();
    fixture.detectChanges();
  };

  it('has no inline add form: creating happens in a modal opened from the header', async () => {
    const { fixture, el } = render([CONSTRAINT]);

    expect(byTestId(el, 'constraint-form')).toBeNull();
    await openCreate(fixture, el);

    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(byTestId(el, 'constraint-input'));
  });

  it('offers the create button on the empty state too, but not without the permission', () => {
    const { el } = render([]);
    expect(byTestId(el, 'constraints-new')).not.toBeNull();
    expect(byTestId(el, 'constraints-empty-new')).not.toBeNull();

    TestBed.resetTestingModule();
    const readOnly = render([], []);
    expect(byTestId(readOnly.el, 'constraints-new')).toBeNull();
    expect(byTestId(readOnly.el, 'constraints-empty-new')).toBeNull();
  });

  it('validates inline and counts characters', async () => {
    const { fixture, el } = render([CONSTRAINT]);
    await openCreate(fixture, el);

    type(el, '   ');
    submit(fixture, el);

    expect(api['createConstraint']).not.toHaveBeenCalled();
    expect(byTestId(el, 'constraint-error')!.textContent).toContain('descriptionRequired');

    type(el, 'Solo 3G');
    fixture.detectChanges();
    expect(el.querySelector('#description-count')!.textContent).toContain('7/500');
  });

  it('creates the constraint trimmed, closes, toasts and reloads the list', async () => {
    const { fixture, el } = render([CONSTRAINT]);
    const toast = TestBed.inject(ToastService);
    await openCreate(fixture, el);

    type(el, '  Solo 3G  ');
    submit(fixture, el);

    expect(api['createConstraint']).toHaveBeenCalledWith('org-1', 'p1', { description: 'Solo 3G' });
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(toast.toasts().some((t) => t.kind === 'success')).toBe(true);
    expect(api['listConstraints']).toHaveBeenCalledTimes(2);
  });

  it('keeps the modal open and shows an API error inside it', async () => {
    const { fixture, el } = render([CONSTRAINT]);
    await openCreate(fixture, el);
    api['createConstraint'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'Duplicada' } })),
    );

    type(el, 'Debe integrarse con SAP');
    submit(fixture, el);

    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    expect(byTestId(el, 'constraint-form-error')).not.toBeNull();
    expect(api['listConstraints']).toHaveBeenCalledTimes(1);
  });

  it('edits a row in the same modal, prefilled, with a PUT', async () => {
    const { fixture, el } = render([CONSTRAINT]);
    (fixture.componentInstance as unknown as { askEdit(c: typeof CONSTRAINT): void }).askEdit(
      CONSTRAINT,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect((byTestId(el, 'constraint-input') as HTMLTextAreaElement).value).toBe(
      'Debe integrarse con SAP',
    );
    type(el, 'Debe integrarse con SAP S/4');
    submit(fixture, el);

    expect(api['updateConstraint']).toHaveBeenCalledWith('org-1', 'p1', 'c1', {
      description: 'Debe integrarse con SAP S/4',
    });
    expect(api['createConstraint']).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Debe integrarse con SAP S/4');
  });
});
