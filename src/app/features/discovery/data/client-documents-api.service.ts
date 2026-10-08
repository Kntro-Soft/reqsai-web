import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApplyClientDocumentRequest, ClientDocumentAnalysis } from './client-documents';

/** A stored project document (workspace REST); the file fields are set for uploaded client documents. */
export interface ProjectDocumentResponse {
  id: string;
  projectId: string;
  name: string;
  documentType: string;
  status: string;
  fileName: string | null;
  mediaType: string | null;
  sizeBytes: number | null;
  extractedChars: number | null;
  summary: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Outcome of applying a reviewed client document. */
export interface ClientDocumentApplyResponse {
  document: ProjectDocumentResponse;
  glossaryTermsAdded: number;
  glossaryTermsSkipped: number;
  constraintsAdded: number;
  constraintsSkipped: number;
}

/**
 * Client for the project's client documents (US22), under the org-scoped workspace API: upload a PDF
 * or Word file to have its text extracted and classified by the AI, apply the reviewed result (adds
 * glossary terms and constraints, keeps the document as AI context), list and delete documents. A
 * pending analysis is discarded with the same DELETE as a stored document.
 */
@Injectable({ providedIn: 'root' })
export class ClientDocumentsApiService {
  private readonly http = inject(HttpClient);

  private base(orgId: string, projectId: string): string {
    return `/api/organizations/${orgId}/projects/${projectId}/documents`;
  }

  listDocuments(orgId: string, projectId: string): Observable<ProjectDocumentResponse[]> {
    return this.http.get<ProjectDocumentResponse[]>(this.base(orgId, projectId));
  }

  /** Uploads the file and reports progress events; the last one carries the analysis. */
  uploadDocument(
    orgId: string,
    projectId: string,
    file: File,
  ): Observable<HttpEvent<ClientDocumentAnalysis>> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ClientDocumentAnalysis>(`${this.base(orgId, projectId)}/upload`, form, {
      reportProgress: true,
      observe: 'events',
    });
  }

  applyDocument(
    orgId: string,
    projectId: string,
    documentId: string,
    request: ApplyClientDocumentRequest,
  ): Observable<ClientDocumentApplyResponse> {
    return this.http.post<ClientDocumentApplyResponse>(
      `${this.base(orgId, projectId)}/${documentId}/apply`,
      request,
    );
  }

  deleteDocument(orgId: string, projectId: string, documentId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(orgId, projectId)}/${documentId}`);
  }
}
