/**
 * Pure rules for the client documents of a project (US22): which files can be uploaded, and how the
 * AI analysis becomes the review the analyst edits and the request that applies it. Kept free of
 * Angular so they are unit-testable.
 */

/** Largest document the API accepts (`spring.servlet.multipart.max-file-size`). */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

/** File extensions the API reads text from: PDF and Word (Office Open XML). */
export const DOCUMENT_EXTENSIONS = ['pdf', 'docx'] as const;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Content types a browser may send per extension (as the API accepts them). */
const MIME_TYPES_BY_EXTENSION: Record<string, ReadonlySet<string>> = {
  pdf: new Set(['application/pdf', 'application/x-pdf', 'application/acrobat']),
  docx: new Set([DOCX_MIME, 'application/zip', 'application/x-zip-compressed']),
};
/** Types that say nothing about the file, so the extension decides. */
const GENERIC_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/x-download',
  'application/force-download',
  'application/unknown',
]);

/** The `accept` attribute of the file picker. */
export const DOCUMENT_ACCEPT = ['.pdf', '.docx', 'application/pdf', DOCX_MIME].join(',');

/** The document types of the workspace API, in the order the review offers them. */
export const DOCUMENT_TYPES = [
  'BUSINESS_RULES',
  'TECHNICAL_SPEC',
  'MEETING_NOTES',
  'GLOSSARY_SOURCE',
  'REFERENCE',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Why a file cannot be uploaded, or null when it can. */
export type DocumentProblem = 'type' | 'size' | 'empty';

/**
 * Mirrors the API checks the browser can make: a `.pdf` or `.docx` extension whose declared type, if
 * any, is not another kind of file (an `.exe`, an image…), not empty, at most 50 MB. The API still
 * checks the file's content.
 */
export function documentProblem(file: {
  name: string;
  size: number;
  type: string;
}): DocumentProblem | null {
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) return 'type';
  const mime = file.type.split(';')[0].trim().toLowerCase();
  if (!GENERIC_MIME_TYPES.has(mime) && !MIME_TYPES_BY_EXTENSION[extension].has(mime)) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > MAX_DOCUMENT_BYTES) return 'size';
  return null;
}

/** A human size: `845 KB`, `12.4 MB`. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

/** Upload progress as a whole percentage, or null while the total is unknown. */
export function uploadPercent(loaded: number, total: number | undefined): number | null {
  if (!total) return null;
  return Math.min(100, Math.round((loaded / total) * 100));
}

/** What the API proposes after reading a document (`POST …/documents/upload`). */
export interface ClientDocumentAnalysis {
  documentId: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  extractedChars: number;
  truncated: boolean;
  classified: boolean;
  documentType: string;
  context: string;
  glossary: { term: string; definition: string; exists: boolean }[];
  constraints: { text: string; exists: boolean }[];
}

/** One proposed item of the review: kept when selected; an existing one cannot be selected. */
export interface ReviewItem<T> {
  value: T;
  exists: boolean;
  selected: boolean;
}

/** The analysis as the analyst edits it before applying. */
export interface DocumentReview {
  documentId: string;
  name: string;
  documentType: DocumentType;
  summary: string;
  glossary: ReviewItem<{ term: string; definition: string }>[];
  constraints: ReviewItem<string>[];
}

/** Body of `POST …/documents/{id}/apply`. */
export interface ApplyClientDocumentRequest {
  name: string;
  documentType: DocumentType;
  summary: string;
  glossaryTerms: { term: string; definition: string }[];
  constraints: string[];
}

function asDocumentType(value: string): DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value)
    ? (value as DocumentType)
    : 'REFERENCE';
}

/** The document name proposed from its file name: no extension, separators as spaces, ≤ 255 chars. */
export function nameFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (base || fileName || 'Documento').slice(0, 255);
}

/**
 * The review of a fresh analysis: every new term and constraint is preselected, the ones the project
 * already has are shown but cannot be selected. `canAddTerms` / `canAddConstraints` turn the
 * preselection off when the analyst may not write the glossary / constraints.
 */
export function reviewFromAnalysis(
  analysis: ClientDocumentAnalysis,
  canAddTerms = true,
  canAddConstraints = true,
): DocumentReview {
  return {
    documentId: analysis.documentId,
    name: nameFromFileName(analysis.fileName),
    documentType: asDocumentType(analysis.documentType),
    summary: analysis.context ?? '',
    glossary: analysis.glossary.map((g) => ({
      value: { term: g.term, definition: g.definition },
      exists: g.exists,
      selected: canAddTerms && !g.exists,
    })),
    constraints: analysis.constraints.map((c) => ({
      value: c.text,
      exists: c.exists,
      selected: canAddConstraints && !c.exists,
    })),
  };
}

/** Flips one item's selection; existing items stay unselected. */
export function toggleItem<T>(items: ReviewItem<T>[], index: number): ReviewItem<T>[] {
  return items.map((item, i) =>
    i === index && !item.exists ? { ...item, selected: !item.selected } : item,
  );
}

/** Selects every new item, or clears them all when every new item is already selected. */
export function toggleAll<T>(items: ReviewItem<T>[]): ReviewItem<T>[] {
  const selectable = items.filter((i) => !i.exists);
  const all = selectable.length > 0 && selectable.every((i) => i.selected);
  return items.map((item) => (item.exists ? item : { ...item, selected: !all }));
}

/** How many items are selected. */
export function selectedCount<T>(items: ReviewItem<T>[]): number {
  return items.filter((i) => i.selected && !i.exists).length;
}

/** The apply request: the reviewed name/type/summary and only the selected new items, trimmed. */
export function applyRequestFromReview(review: DocumentReview): ApplyClientDocumentRequest {
  return {
    name: review.name.trim(),
    documentType: review.documentType,
    summary: review.summary.trim(),
    glossaryTerms: review.glossary
      .filter((g) => g.selected && !g.exists)
      .map((g) => ({ term: g.value.term.trim(), definition: g.value.definition.trim() })),
    constraints: review.constraints
      .filter((c) => c.selected && !c.exists)
      .map((c) => c.value.trim()),
  };
}
