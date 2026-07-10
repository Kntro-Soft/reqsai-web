import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiscoveryApiService } from './discovery-api.service';

/** Story delete endpoints: single DELETE (204) and batch-delete (200 { deleted }). */
describe('DiscoveryApiService story deletion', () => {
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

  it('DELETEs a single story and resolves on 204', () => {
    let done = false;
    api.deleteStory('proj-1', 'story-9').subscribe(() => (done = true));
    const req = http.expectOne('/api/projects/proj-1/stories/story-9');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  it('POSTs the selected ids to batch-delete and returns the deleted count', () => {
    let result: { deleted: number } | undefined;
    api.batchDeleteStories('proj-1', ['a', 'b', 'c']).subscribe((r) => (result = r));
    const req = http.expectOne('/api/projects/proj-1/stories/batch-delete');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ storyIds: ['a', 'b', 'c'] });
    req.flush({ deleted: 3 });
    expect(result).toEqual({ deleted: 3 });
  });
});
