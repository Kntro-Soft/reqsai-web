import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { silentForbidden } from '../../../core/interceptors/error.interceptor';
import { QualityMetricsResponse } from './quality.models';

/**
 * Client for the quality indicators panel. A page load, so a 403 stays out of the global "no access" toast and
 * the page shows its own state instead.
 */
@Injectable({ providedIn: 'root' })
export class QualityApiService {
  private readonly http = inject(HttpClient);

  /** The indicators of a project for the UTC days `from` to `to` (inclusive, `YYYY-MM-DD`). */
  getQualityMetrics(
    projectId: string,
    from: string,
    to: string,
  ): Observable<QualityMetricsResponse> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<QualityMetricsResponse>(`/api/projects/${projectId}/quality-metrics`, {
      params,
      context: silentForbidden(),
    });
  }
}
