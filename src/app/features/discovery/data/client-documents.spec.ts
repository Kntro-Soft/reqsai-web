import { describe, expect, it } from 'vitest';
import {
  ClientDocumentAnalysis,
  MAX_DOCUMENT_BYTES,
  applyRequestFromReview,
  documentProblem,
  formatBytes,
  nameFromFileName,
  reviewFromAnalysis,
  selectedCount,
  toggleAll,
  toggleItem,
  uploadPercent,
} from './client-documents';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function analysis(overrides: Partial<ClientDocumentAnalysis> = {}): ClientDocumentAnalysis {
  return {
    documentId: 'd1',
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
    constraints: [
      { text: 'Debe cumplir la Ley 29733.', exists: false },
      { text: 'Disponible 24/7.', exists: false },
    ],
    ...overrides,
  };
}

describe('documentProblem', () => {
  it('accepts a PDF or Word document by extension, with its own or a generic type', () => {
    expect(documentProblem({ name: 'tdr.pdf', size: 1000, type: 'application/pdf' })).toBeNull();
    expect(documentProblem({ name: 'Acta.DOCX', size: 1000, type: DOCX })).toBeNull();
    expect(documentProblem({ name: 'acta.docx', size: 1000, type: '' })).toBeNull();
    expect(
      documentProblem({ name: 'acta.docx', size: 1000, type: 'application/octet-stream' }),
    ).toBeNull();
  });

  it('rejects executables and any other format, also when renamed', () => {
    expect(
      documentProblem({ name: 'setup.exe', size: 1000, type: 'application/x-msdownload' }),
    ).toBe('type');
    expect(
      documentProblem({ name: 'factura.pdf', size: 1000, type: 'application/x-msdownload' }),
    ).toBe('type');
    expect(documentProblem({ name: 'notas.doc', size: 1000, type: 'application/msword' })).toBe(
      'type',
    );
    expect(documentProblem({ name: 'foto.png', size: 1000, type: 'image/png' })).toBe('type');
    expect(documentProblem({ name: 'tdr.pdf', size: 1000, type: DOCX })).toBe('type');
    expect(documentProblem({ name: 'acta.docx', size: 1000, type: 'application/zip' })).toBeNull();
    expect(documentProblem({ name: 'sin-extension', size: 1000, type: '' })).toBe('type');
  });

  it('rejects an empty file and one over 50 MB', () => {
    expect(documentProblem({ name: 'a.pdf', size: 0, type: 'application/pdf' })).toBe('empty');
    expect(
      documentProblem({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES + 1, type: 'application/pdf' }),
    ).toBe('size');
    expect(
      documentProblem({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES, type: 'application/pdf' }),
    ).toBeNull();
  });
});

describe('formatBytes / uploadPercent', () => {
  it('formats sizes in KB and MB', () => {
    expect(formatBytes(500)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12.4 MB');
    expect(formatBytes(null)).toBe('—');
  });

  it('reports a whole percentage, or null while the total is unknown', () => {
    expect(uploadPercent(50, 200)).toBe(25);
    expect(uploadPercent(300, 200)).toBe(100);
    expect(uploadPercent(10, undefined)).toBeNull();
  });
});

describe('nameFromFileName', () => {
  it('drops the extension and turns underscores into spaces', () => {
    expect(nameFromFileName('Terminos_de_referencia.pdf')).toBe('Terminos de referencia');
    expect(nameFromFileName('acta-kickoff.docx')).toBe('acta-kickoff');
    expect(nameFromFileName('.pdf')).toBe('.pdf');
  });
});

describe('review', () => {
  it('preselects new terms and constraints, never existing ones', () => {
    const review = reviewFromAnalysis(analysis());

    expect(review.name).toBe('Terminos de referencia');
    expect(review.documentType).toBe('TECHNICAL_SPEC');
    expect(review.summary).toBe('Cadena de restaurantes de Lima.');
    expect(review.glossary.map((g) => g.selected)).toEqual([false, true]);
    expect(review.constraints.map((c) => c.selected)).toEqual([true, true]);
    expect(selectedCount(review.glossary)).toBe(1);
  });

  it('preselects nothing the analyst may not add, and maps unknown types to REFERENCE', () => {
    const review = reviewFromAnalysis(analysis({ documentType: 'CONTRATO' }), false, false);

    expect(review.documentType).toBe('REFERENCE');
    expect(selectedCount(review.glossary)).toBe(0);
    expect(selectedCount(review.constraints)).toBe(0);
  });

  it('toggles one item, keeping existing ones unselected', () => {
    const review = reviewFromAnalysis(analysis());

    expect(toggleItem(review.glossary, 0)[0].selected).toBe(false);
    expect(toggleItem(review.glossary, 1)[1].selected).toBe(false);
    expect(toggleItem(toggleItem(review.glossary, 1), 1)[1].selected).toBe(true);
  });

  it('selects all new items, or clears them when all are selected', () => {
    const review = reviewFromAnalysis(analysis());

    const cleared = toggleAll(review.constraints);
    expect(cleared.every((c) => !c.selected)).toBe(true);
    const selected = toggleAll(cleared);
    expect(selected.every((c) => c.selected)).toBe(true);
    expect(toggleAll(review.glossary)[0].selected).toBe(false);
  });

  it('applies only the selected new items, trimmed', () => {
    const review = reviewFromAnalysis(analysis());
    review.name = '  TdR  ';
    review.summary = ' Contexto. ';
    review.constraints = toggleItem(review.constraints, 1);

    expect(applyRequestFromReview(review)).toEqual({
      name: 'TdR',
      documentType: 'TECHNICAL_SPEC',
      summary: 'Contexto.',
      glossaryTerms: [{ term: 'Reserva', definition: 'Mesa apartada.' }],
      constraints: ['Debe cumplir la Ley 29733.'],
    });
  });
});
