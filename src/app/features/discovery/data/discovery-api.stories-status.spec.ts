import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryApiService } from './discovery-api.service';
import { UserStoryResponse } from './discovery.models';

/** Story review endpoint: PATCH .../status with the decision, answering the updated story. */
describe('DiscoveryApiService story review', () => {
  let api: DiscoveryApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DiscoveryApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DiscoveryApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('PATCHes the review status and returns the updated story', () => {
    let result: UserStoryResponse | undefined;
    api.changeStoryStatus('proj-1', 'story-9', 'APPROVED').subscribe((s) => (result = s));
    const req = http.expectOne('/api/projects/proj-1/stories/story-9/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'APPROVED' });
    req.flush({ id: 'story-9', status: 'APPROVED' });
    expect(result?.status).toBe('APPROVED');
  });
});
