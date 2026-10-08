import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ProjectDocuments } from './documents';
import {
  ClientDocumentsApiService,
  ProjectDocumentResponse,
} from '../../data/client-documents-api.service';
import { ClientDocumentAnalysis } from '../../data/client-documents';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { ToastService } from '../../../../shared/toast/toast.service';

const ANALYSIS: ClientDocumentAnalysis = {
  documentId: 'doc-1',
  fileName: 'Terminos_de_referencia.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 2048,
  extractedChars: 1500,
  truncated: false,
  classified: true,
  documentType: 'TECHNICAL_SPEC',
  context: 'Cadena de restaurantes de Lima.',
  glossary: [
    { term: 'Comensal', definition: 'Cliente que reserva.', exists: true },
    { term: 'Reserva', definition: 'Mesa apartada.', exists: false },
  ],
  constraints: [{ text: 'Debe cumplir la Ley 29733.', exists: false }],
};

const STORED: ProjectDocumentResponse = {
  id: 'doc-1',
  projectId: 'p1',
  name: 'Terminos de referencia',
  documentType: 'TECHNICAL_SPEC',
  status: 'ACTIVE',
  fileName: 'Terminos_de_referencia.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 2048,
  extractedChars: 1500,
  summary: 'Cadena de restaurantes de Lima.',
  createdAt: '2026-10-09T10:00:00Z',
  updatedAt: '2026-10-09T10:00:00Z',
};

describe('ProjectDocuments', () => {
  let api: {
    listDocuments: ReturnType<typeof vi.fn>;
    uploadDocument: ReturnType<typeof vi.fn>;
    applyDocument: ReturnType<typeof vi.fn>;
    deleteDocument: ReturnType<typeof vi.fn>;
  };

  function render(): { fixture: ComponentFixture<ProjectDocuments>; el: HTMLElement } {
    api = {
      listDocuments: vi.fn(() => of([])),
      uploadDocument: vi.fn(() =>
        of(
          { type: HttpEventType.UploadProgress, loaded: 2048, total: 2048 },
          new HttpResponse({ body: ANALYSIS, status: 201 }),
        ),
      ),
      applyDocument: vi.fn(() =>
        of({
          document: STORED,
          glossaryTermsAdded: 1,
          glossaryTermsSkipped: 0,
          constraintsAdded: 1,
          constraintsSkipped: 0,
        }),
      ),
      deleteDocument: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [ProjectDocuments, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: ClientDocumentsApiService, useValue: api },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        {
          provide: PermissionsStore,
          useValue: { has: () => true, isOrgOwner: () => true, isOrgOwnerOrAdmin: () => true },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectDocuments);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function pick(fixture: ComponentFixture<ProjectDocuments>, file: File): void {
    const input = fixture.nativeElement.querySelector(
      '[data-testid="doc-file-input"]',
    ) as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('shows the empty list of a project without documents', () => {
    const { el } = render();

    expect(api.listDocuments).toHaveBeenCalledWith('org-1', 'p1');
    expect(byTestId(el, 'doc-empty')).not.toBeNull();
  });

  it('refuses an executable before uploading anything', () => {
    const { fixture, el } = render();

    pick(fixture, new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }));

    expect(byTestId(el, 'doc-problem')).not.toBeNull();
    expect((byTestId(el, 'doc-analyze') as HTMLButtonElement).disabled).toBe(true);
    expect(api.uploadDocument).not.toHaveBeenCalled();
  });

  it('uploads a PDF, reviews the analysis and applies the selected items', () => {
    const { fixture, el } = render();
    pick(
      fixture,
      new File(['%PDF-1.4'], 'Terminos_de_referencia.pdf', { type: 'application/pdf' }),
    );

    byTestId(el, 'doc-analyze')!.click();
    fixture.detectChanges();

    expect(api.uploadDocument).toHaveBeenCalled();
    expect(byTestId(el, 'doc-review')).not.toBeNull();
    const terms = el.querySelectorAll('[data-testid="doc-term"]');
    expect(terms).toHaveLength(2);
    const existing = terms[0].querySelector('input') as HTMLInputElement;
    expect(existing.disabled).toBe(true);
    expect(existing.checked).toBe(false);
    expect(byTestId(terms[0] as HTMLElement, 'doc-term-exists')).not.toBeNull();
    expect((terms[1].querySelector('input') as HTMLInputElement).checked).toBe(true);
    expect((byTestId(el, 'doc-context') as HTMLTextAreaElement).value).toBe(
      'Cadena de restaurantes de Lima.',
    );

    api.listDocuments.mockReturnValue(of([STORED]));
    byTestId(el, 'doc-apply')!.click();
    fixture.detectChanges();

    expect(api.applyDocument).toHaveBeenCalledWith('org-1', 'p1', 'doc-1', {
      name: 'Terminos de referencia',
      documentType: 'TECHNICAL_SPEC',
      summary: 'Cadena de restaurantes de Lima.',
      glossaryTerms: [{ term: 'Reserva', definition: 'Mesa apartada.' }],
      constraints: ['Debe cumplir la Ley 29733.'],
    });
    expect(byTestId(el, 'doc-review')).toBeNull();
    expect(el.querySelectorAll('[data-testid="doc-row"]')).toHaveLength(1);
  });

  it('discards an analysis by deleting the pending document', () => {
    const { fixture, el } = render();
    pick(fixture, new File(['%PDF-1.4'], 'acta.pdf', { type: 'application/pdf' }));
    byTestId(el, 'doc-analyze')!.click();
    fixture.detectChanges();

    byTestId(el, 'doc-discard')!.click();
    fixture.detectChanges();

    expect(api.deleteDocument).toHaveBeenCalledWith('org-1', 'p1', 'doc-1');
    expect(byTestId(el, 'doc-review')).toBeNull();
    expect(byTestId(el, 'doc-upload')).not.toBeNull();
  });
});
