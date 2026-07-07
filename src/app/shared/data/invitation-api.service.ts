import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AcceptInvitationResult,
  InvitationView,
} from '../../features/workspace/data/workspace.models';

/**
 * Thin HTTP client for the organization-invitation flow. These endpoints are not
 * org-scoped: the invitation view is public (no auth, no tenant) and accept resolves
 * the tenant from the token, so they live here rather than in {@link WorkspaceApiService}.
 */
@Injectable({ providedIn: 'root' })
export class InvitationApiService {
  private readonly http = inject(HttpClient);

  /** Public — resolves an invitation by its token. `404` when the token is unknown. */
  getInvitation(token: string): Observable<InvitationView> {
    return this.http.get<InvitationView>(`/api/invitations/${encodeURIComponent(token)}`);
  }

  /** JWT-auth — accepts the invitation for the signed-in account. */
  acceptInvitation(token: string): Observable<AcceptInvitationResult> {
    return this.http.post<AcceptInvitationResult>('/api/invitations/accept', { token });
  }
}
